package com.fitsaathi.app.alarms

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.fitsaathi.app.MainActivity

/**
 * Schedules exact alarms with AlarmManager. Each alarm is re-armed for its next occurrence
 * when it fires, and the full set is re-armed after reboot (BootReceiver).
 */
object AlarmScheduler {
    private const val TAG = "FitAlarms"
    const val EXTRA_ALARM_ID = "alarmId"
    const val EXTRA_SNOOZE = "snooze"

    fun canScheduleExact(ctx: Context): Boolean {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.canScheduleExactAlarms() else true
    }

    private fun pendingIntent(ctx: Context, spec: AlarmSpec, snooze: Boolean = false): PendingIntent {
        val intent = Intent(ctx, AlarmReceiver::class.java).apply {
            action = "com.fitsaathi.app.ALARM_FIRE"
            putExtra(EXTRA_ALARM_ID, spec.id)
            putExtra(EXTRA_SNOOZE, snooze)
            data = android.net.Uri.parse("fitsaathi://alarm/${spec.id}${if (snooze) "/snooze" else ""}")
        }
        val code = (spec.id + (if (snooze) ":snooze" else "")).hashCode()
        return PendingIntent.getBroadcast(ctx, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun schedule(ctx: Context, spec: AlarmSpec, atMillis: Long = spec.nextTriggerMillis(), snooze: Boolean = false) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = pendingIntent(ctx, spec, snooze)
        if (spec.isOneShot && atMillis <= System.currentTimeMillis() && !snooze) {
            am.cancel(pi) // one-shot already in the past: nothing to arm
            return
        }
        try {
            when {
                canScheduleExact(ctx) && spec.alarmClock -> {
                    val show = PendingIntent.getActivity(
                        ctx, 0, Intent(ctx, MainActivity::class.java),
                        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                    )
                    am.setAlarmClock(AlarmManager.AlarmClockInfo(atMillis, show), pi)
                }
                canScheduleExact(ctx) -> am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pi)
                else -> am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pi) // inexact fallback
            }
        } catch (e: SecurityException) {
            Log.w(TAG, "Exact alarm not permitted, falling back to inexact", e)
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, atMillis, pi)
        }
    }

    fun cancel(ctx: Context, spec: AlarmSpec) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pendingIntent(ctx, spec, false))
        am.cancel(pendingIntent(ctx, spec, true))
    }

    /** Re-arm everything in AlarmStore; cancel alarms that were removed since last sync. */
    fun scheduleAll(ctx: Context): Int {
        val specs = AlarmStore.load(ctx)
        val current = specs.map { it.id }.toSet()
        for (oldId in AlarmStore.scheduledIds(ctx) - current) {
            cancel(ctx, AlarmSpec(oldId, "habit", "", "", "", 0, 0, emptyList(), emptyList(), false))
        }
        // Prune one-shot alarms that are already in the past (yesterday's motivational slots).
        val now = System.currentTimeMillis()
        val live = specs.filter { !it.isOneShot || it.nextTriggerMillis(now) > now }
        if (live.size != specs.size) AlarmStore.save(ctx, live)
        for (spec in live) schedule(ctx, spec)
        AlarmStore.saveScheduledIds(ctx, current)
        Log.i(TAG, "Scheduled ${live.size} alarms (exact=${canScheduleExact(ctx)})")
        return live.size
    }

    fun snooze(ctx: Context, spec: AlarmSpec, minutes: Int = 10) {
        schedule(ctx, spec, System.currentTimeMillis() + minutes * 60_000L, snooze = true)
    }
}
