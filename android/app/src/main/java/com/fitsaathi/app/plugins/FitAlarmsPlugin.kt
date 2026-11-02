package com.fitsaathi.app.plugins

import android.Manifest
import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.net.Uri
import android.os.Build
import android.provider.Settings
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

@CapacitorPlugin(
    name = "FitAlarms",
    permissions = [Permission(alias = "notifications", strings = [Manifest.permission.POST_NOTIFICATIONS])],
)
class FitAlarmsPlugin : Plugin() {

    private var receiver: BroadcastReceiver? = null

    override fun load() {
        Notifications.ensureChannels(context)
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context, intent: Intent) {
                val json = intent.getStringExtra("json") ?: return
                try {
                    val o = JSONObject(json)
                    notifyListeners("action", JSObject.fromJSONObject(o), true)
                } catch (_: Exception) {}
            }
        }
        receiver = r
        ContextCompat.registerReceiver(context, r, IntentFilter(PendingActionStore.BROADCAST), ContextCompat.RECEIVER_NOT_EXPORTED)
    }

    override fun handleOnDestroy() {
        receiver?.let { runCatching { context.unregisterReceiver(it) } }
        receiver = null
    }

    @PluginMethod
    fun canScheduleExactAlarms(call: PluginCall) {
        call.resolve(JSObject().put("granted", AlarmScheduler.canScheduleExact(context)))
    }

    @PluginMethod
    fun requestExactAlarmPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            val am = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
            if (!am.canScheduleExactAlarms()) {
                val i = Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM, Uri.parse("package:${context.packageName}"))
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                context.startActivity(i)
            }
        }
        call.resolve()
    }

    @PluginMethod
    fun requestNotificationPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        requestPermissionForAlias("notifications", call, "notificationPermissionCallback")
    }

    @PermissionCallback
    private fun notificationPermissionCallback(call: PluginCall) {
        val granted = getPermissionState("notifications") == PermissionState.GRANTED
        call.resolve(JSObject().put("granted", granted))
        if (granted) Notifications.refreshPinned(context)
    }

    @PluginMethod
    fun syncAlarms(call: PluginCall) {
        val arr: JSArray = call.getArray("alarms") ?: JSArray()
        val specs = ArrayList<AlarmSpec>()
        for (i in 0 until arr.length()) {
            runCatching { specs.add(AlarmSpec.fromJson(arr.getJSONObject(i))) }
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

    @PluginMethod
    fun getPendingActions(call: PluginCall) {
        val arr = PendingActionStore.getAll(context)
        val out = JSArray()
        for (i in 0 until arr.length()) out.put(arr.getJSONObject(i))
        call.resolve(JSObject().put("actions", out))
    }

    @PluginMethod
    fun clearPendingActions(call: PluginCall) {
        PendingActionStore.clear(context)
        call.resolve()
    }
}
