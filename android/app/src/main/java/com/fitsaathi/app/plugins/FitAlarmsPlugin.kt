package com.fitsaathi.app.plugins

import android.Manifest
import android.app.Activity
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.fitsaathi.app.alarms.AlarmScheduler
import com.fitsaathi.app.alarms.AlarmSpec
import com.fitsaathi.app.alarms.AlarmStore
import com.fitsaathi.app.alarms.Notifications
import com.fitsaathi.app.alarms.PendingActionStore
import com.fitsaathi.app.alarms.PinnedStore
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import org.json.JSONArray
import org.json.JSONObject

/** Mirrors FitAlarmsPlugin in src/native/plugins.ts */
@CapacitorPlugin(
    name = "FitAlarms",
    permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])],
)
class FitAlarmsPlugin : Plugin() {

    companion object {
        private const val TAG = "FitAlarms"
        private const val EVENT_ACTION = "action"
    }

    private var receiver: BroadcastReceiver? = null

    /** True between handleOnResume and handleOnPause: only then do we consume live actions. */
    @Volatile
    private var resumed = false

    /** Calls waiting for the user to come back from a system settings screen (resolved in handleOnResume). */
    private var pendingExactAlarmCall: PluginCall? = null
    private var pendingFullScreenCall: PluginCall? = null

    override fun load() {
        Notifications.ensureChannels(context)
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) {
                val json = intent.getStringExtra(PendingActionStore.EXTRA_JSON) ?: return
                // Consume only while the web layer is in the foreground with a listener attached. Otherwise leave
                // the result code untouched so ActionReceiver persists the action for drainPendingActions().
                if (!resumed || !hasListeners(EVENT_ACTION)) return
                try {
                    notifyListeners(EVENT_ACTION, JSObject.fromJSONObject(JSONObject(json)), true)
                    if (isOrderedBroadcast) resultCode = Activity.RESULT_OK
                } catch (e: Exception) {
                    Log.w(TAG, "Could not deliver live action", e)
                }
            }
        }
        receiver = r
        ContextCompat.registerReceiver(context, r, IntentFilter(PendingActionStore.BROADCAST), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun handleOnResume() {
        super.handleOnResume()
        resumed = true
        // Back from the exact-alarm / full-screen-intent settings screens: let JS re-query the permission state.
        pendingExactAlarmCall?.let { pendingExactAlarmCall = null; it.resolve() }
        pendingFullScreenCall?.let { pendingFullScreenCall = null; it.resolve() }
    }

    override fun handleOnPause() {
        super.handleOnPause()
        resumed = false
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        resumed = false
        receiver?.let { r -> try { context.unregisterReceiver(r) } catch (_: Exception) {} }
        receiver = null
        pendingExactAlarmCall?.let { pendingExactAlarmCall = null; it.resolve() }
        pendingFullScreenCall?.let { pendingFullScreenCall = null; it.resolve() }
    }

    /* ------------------------------- exact alarms ------------------------------- */

    @PluginMethod
    fun canScheduleExactAlarms(call: PluginCall) {
        call.resolve(JSObject().put("granted", AlarmScheduler.canScheduleExact(context)))
    }

    @PluginMethod
    fun requestExactAlarmPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || AlarmScheduler.canScheduleExact(context)) {
            call.resolve()
            return
        }
        val i = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        pendingExactAlarmCall?.resolve()
        pendingExactAlarmCall = call
        try {
            context.startActivity(i)
        } catch (e: Exception) {
            pendingExactAlarmCall = null
            call.reject("Cannot open the exact-alarm settings screen: ${e.message}")
        }
    }

    /* --------------------------- full-screen intents ---------------------------- */

    @PluginMethod
    fun canUseFullScreenIntent(call: PluginCall) {
        call.resolve(JSObject().put("granted", Notifications.canUseFullScreenIntent(context)))
    }

    @PluginMethod
    fun requestFullScreenIntentPermission(call: PluginCall) {
        // USE_FULL_SCREEN_INTENT is not declared in the manifest, so there is nothing to grant: resolve at once
        // without opening Settings (JS re-queries canUseFullScreenIntent and keeps the heads-up path).
        if (!Notifications.isFullScreenIntentDeclared(context)) {
            call.resolve()
            return
        }
        val i = Notifications.fullScreenIntentSettingsIntent(context)
        if (i == null || Notifications.canUseFullScreenIntent(context)) {
            call.resolve()
            return
        }
        i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        pendingFullScreenCall?.resolve()
        pendingFullScreenCall = call
        try {
            context.startActivity(i)
        } catch (e: Exception) {
            pendingFullScreenCall = null
            call.reject("Cannot open the full-screen-intent settings screen: ${e.message}")
        }
    }

    /* ------------------------------ notifications ------------------------------- */

    @PluginMethod
    fun areNotificationsEnabled(call: PluginCall) {
        call.resolve(JSObject().put("granted", Notifications.canPost(context)))
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) {
            // No runtime permission below 13: report the app-level toggle instead of an unconditional true.
            call.resolve(JSObject().put("granted", NotificationManagerCompat.from(context).areNotificationsEnabled()))
            return
        }
        if (getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(JSObject().put("granted", Notifications.canPost(context)))
            return
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback")
    }

    @PermissionCallback
    private fun notificationPermissionCallback(call: PluginCall) {
        val granted = Notifications.canPost(context)
        call.resolve(JSObject().put("granted", granted))
        if (granted) Notifications.refreshPinned(context)
    }

    /* ---------------------------------- alarms ---------------------------------- */

    @PluginMethod
    fun syncAlarms(call: PluginCall) {
        val arr: JSArray = call.getArray("alarms") ?: JSArray()
        val specs = ArrayList<AlarmSpec>(arr.length())
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val spec = try { AlarmSpec.fromJson(o) } catch (e: Exception) { null }
            if (spec == null) Log.w(TAG, "syncAlarms: skipping malformed alarm $o") else specs.add(spec)
        }
        AlarmStore.save(context, specs)
        val n = AlarmScheduler.scheduleAll(context)
        call.resolve(JSObject().put("scheduled", n))
    }

    @PluginMethod
    fun updatePinned(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        val title = call.getString("title") ?: "FitSaathi"
        val date = call.getString("date") ?: PendingActionStore.todayIso()
        val items: JSONArray = call.getArray("items") ?: JSArray()
        PinnedStore.save(context, enabled, title, date, items)
        Notifications.refreshPinned(context)
        call.resolve()
    }

    /* ----------------------------- pending actions ------------------------------ */

    private fun toJSArray(arr: JSONArray): JSArray {
        val out = JSArray()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.put(o)
        }
        return out
    }

    @PluginMethod
    fun getPendingActions(call: PluginCall) {
        call.resolve(JSObject().put("actions", toJSArray(PendingActionStore.getAll(context))))
    }

    @PluginMethod
    fun clearPendingActions(call: PluginCall) {
        PendingActionStore.clear(context)
        call.resolve()
    }

    /** Atomically returns and clears the stored actions (no window in which a new action can be lost). */
    @PluginMethod
    fun drainPendingActions(call: PluginCall) {
        call.resolve(JSObject().put("actions", toJSArray(PendingActionStore.drain(context))))
    }
}
