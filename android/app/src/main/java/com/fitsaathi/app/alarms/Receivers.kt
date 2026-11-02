package com.fitsaathi.app.alarms

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.core.app.NotificationManagerCompat
import com.fitsaathi.app.widget.HabitWidgetProvider

/** Fires when an alarm goes off: show the notification and re-arm for the next occurrence. */
class AlarmReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val id = intent.getStringExtra(AlarmScheduler.EXTRA_ALARM_ID) ?: return
        val snooze = intent.getBooleanExtra(AlarmScheduler.EXTRA_SNOOZE, false)
        val spec = AlarmStore.find(context, id)
        if (spec == null) {
            Log.w("FitAlarms", "Alarm $id fired but is no longer defined")
            return
        }
        Notifications.showAlarm(context, spec)
        if (!snooze) AlarmScheduler.schedule(context, spec)
    }
}

/** Handles notification action buttons and widget taps. */
class ActionReceiver : BroadcastReceiver() {
    companion object {
        const val ACTION = "com.fitsaathi.app.USER_ACTION"
        const val EXTRA_KIND = "kind"
        const val EXTRA_REF = "refId"
        const val EXTRA_ACTION = "action"
        const val EXTRA_ALARM_ID = "alarmId"
    }

    override fun onReceive(context: Context, intent: Intent) {
        val kind = intent.getStringExtra(EXTRA_KIND) ?: return
        val refId = intent.getStringExtra(EXTRA_REF) ?: return
        val action = intent.getStringExtra(EXTRA_ACTION) ?: return
        val alarmId = intent.getStringExtra(EXTRA_ALARM_ID)
        val nm = NotificationManagerCompat.from(context)

        if (action == "snooze") {
            alarmId?.let { AlarmStore.find(context, it) }?.let { AlarmScheduler.snooze(context, it) }
            alarmId?.let { nm.cancel(it.hashCode() and 0x7fffffff) }
            return
        }

        val entry = PendingActionStore.add(context, kind, refId, action)
        alarmId?.let { nm.cancel(it.hashCode() and 0x7fffffff) }

        // Update local snapshots so the pinned notification & widget reflect the tap immediately.
        when {
            kind == "water" && action == "add" -> WidgetStore.addWater(context, 250)
            action == "done" || action == "skip" -> {
                PinnedStore.markDone(context, refId)
                WidgetStore.markDone(context, refId)
            }
        }
        Notifications.refreshPinned(context)
        HabitWidgetProvider.refreshAll(context)

        // Tell the running app (if any) so it can apply the action right away.
        context.sendBroadcast(Intent(PendingActionStore.BROADCAST).apply {
            setPackage(context.packageName)
            putExtra("json", entry.toString())
        })
    }
}

/** Re-arm alarms after reboot / app update / clock changes. */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            "android.intent.action.QUICKBOOT_POWERON" -> {
                AlarmScheduler.scheduleAll(context)
                Notifications.refreshPinned(context)
                HabitWidgetProvider.refreshAll(context)
            }
        }
    }
}
