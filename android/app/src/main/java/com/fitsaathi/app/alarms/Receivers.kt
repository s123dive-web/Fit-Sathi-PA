package com.fitsaathi.app.alarms

import android.app.Activity
import android.app.AlarmManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.PowerManager
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.fitsaathi.app.widget.HabitWidgetProvider
import org.json.JSONObject

private const val TAG = "FitAlarms"

/** Fires when an alarm goes off: show the notification and re-arm for the next occurrence. */
class AlarmReceiver : BroadcastReceiver() {
    companion object {
        /** Upper bound for the partial wake lock held while the alarm is posted and re-armed (normally a few ms). */
        private const val WAKE_LOCK_TIMEOUT_MS = 10_000L
    }

    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: return
        val snooze = intent.getBooleanExtra(AlarmScheduler.EXTRA_SNOOZE, false)
        // RTC_WAKEUP alarms wake the device, but a dozing CPU may be released again as soon as onReceive returns.
        // A short, timed partial wake lock (WAKE_LOCK permission) keeps it up until the notification is posted.
        val wakeLock = try {
            (context.getSystemService(Context.POWER_SERVICE) as? PowerManager)
                ?.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "fitsaathi:alarm")
                ?.also { it.acquire(WAKE_LOCK_TIMEOUT_MS) }
        } catch (e: Exception) {
            Log.w(TAG, "Could not acquire alarm wake lock", e)
            null
        }
        try {
            val spec = AlarmStore.find(context, id)
            if (spec == null) {
                Log.w(TAG, "Alarm $id fired but is no longer defined")
                return
            }
            try {
                Notifications.showAlarm(context, spec)
            } catch (e: Exception) {
                Log.e(TAG, "Could not show alarm $id", e)
            }
            if (!snooze && !spec.isOneShot) AlarmScheduler.schedule(context, spec) // never throws
        } finally {
            try {
                if (wakeLock != null && wakeLock.isHeld) wakeLock.release()
            } catch (_: Exception) {}
        }
    }
}

/**
 * Handles notification action buttons, widget taps and AlarmActivity buttons.
 *
 * Delivery is an ordered broadcast: if the running app's FitAlarmsPlugin receiver consumes the action it
 * sets RESULT_OK and nothing is persisted; otherwise the final result receiver stores it in
 * PendingActionStore for `drainPendingActions()` on the next launch. An action is therefore applied
 * exactly once. Every entry carries `ts` so JS can additionally dedupe.
 */
class ActionReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION = "com.fitsaathi.app.USER_ACTION"
        const val EXTRA_KIND = "kind"
        const val EXTRA_REF = "refId"
        const val EXTRA_ACTION = "action"
        const val EXTRA_ALARM_ID = "alarmId"
        const val WATER_STEP_ML = 250
    }

    override fun onReceive(context: Context, intent: Intent) {
        val kind = intent.getStringExtra(EXTRA_KIND) ?: return
        val refId = intent.getStringExtra(EXTRA_REF) ?: return
        val action = intent.getStringExtra(EXTRA_ACTION) ?: return
        val alarmId = intent.getStringExtra(EXTRA_ALARM_ID)
        val nm = NotificationManagerCompat.from(context)

        if (action == "snooze") {
            val spec = if (alarmId != null) AlarmStore.find(context, alarmId) else null
            if (spec != null) AlarmScheduler.snooze(context, spec)
            if (alarmId != null) nm.cancel(alarmId.hashCode() and 0x7fffffff)
            return
        }

        if (alarmId != null) nm.cancel(alarmId.hashCode() and 0x7fffffff)
        val entry = PendingActionStore.entry(kind, refId, action)

        // Update local snapshots so the pinned notification & widget reflect the tap immediately.
        try {
            when {
                kind == "water" && action == "add" -> WidgetStore.addWater(context, WATER_STEP_ML)
                action == "done" || action == "skip" -> {
                    PinnedStore.markDone(context, refId)
                    WidgetStore.markDone(context, refId)
                }
            }
            Notifications.refreshPinned(context)
            HabitWidgetProvider.refreshAll(context)
        } catch (e: Exception) {
            Log.w(TAG, "Snapshot refresh failed", e)
        }

        deliver(context, entry)
    }

    private fun deliver(context: Context, entry: JSONObject) {
        val live = Intent(PendingActionStore.BROADCAST).apply {
            setPackage(context.packageName)
            putExtra(PendingActionStore.EXTRA_JSON, entry.toString())
        }
        val resultReceiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context, i: Intent) {
                // Runs after every receiver of the ordered broadcast. RESULT_OK means the live plugin consumed it.
                if (resultCode != Activity.RESULT_OK) PendingActionStore.add(c, entry)
            }
        }
        try {
            context.sendOrderedBroadcast(live, null, resultReceiver, null, Activity.RESULT_CANCELED, null, null)
        } catch (e: Exception) {
            Log.w(TAG, "Ordered broadcast failed, persisting action", e)
            PendingActionStore.add(context, entry)
        }
    }
}

/** Re-arm alarms after reboot / app update / clock changes / exact-alarm permission changes. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            AlarmManager.ACTION_SCHEDULE_EXACT_ALARM_PERMISSION_STATE_CHANGED, // compile-time constant, safe below API 31
            "android.intent.action.QUICKBOOT_POWERON" -> {
                try {
                    AlarmScheduler.scheduleAll(context)
                } catch (e: Exception) {
                    Log.e(TAG, "scheduleAll failed", e)
                }
                try {
                    Notifications.refreshPinned(context)
                    HabitWidgetProvider.refreshAll(context)
                } catch (e: Exception) {
                    Log.w(TAG, "Snapshot refresh failed", e)
                }
            }
        }
    }
}
