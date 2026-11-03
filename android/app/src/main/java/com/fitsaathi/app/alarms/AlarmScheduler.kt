package com.fitsaathi.app.alarms

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.util.Log
import com.fitsaathi.app.MainActivity

/**
 * Schedules alarms with AlarmManager. Each alarm is re-armed for its next occurrence when it fires,
 * and the full set is re-armed after reboot / exact-alarm permission changes (BootReceiver).
 *
 * Exactness follows AlarmSpec.exact (JS sets it only for supplements and the workout):
 *  - exact + alarmClock  -> setAlarmClock (user-visible alarm, needs SCHEDULE_EXACT_ALARM on 31+)
 *  - exact               -> setExactAndAllowWhileIdle when permitted, else setAndAllowWhileIdle
 *  - inexact             -> setWindow(RTC_WAKEUP, trigger, 10 min) with setAndAllowWhileIdle as fallback
 */
object AlarmScheduler {
    private const val TAG = "FitAlarms"
    const val EXTRA_ALARM_ID = "alarmId"
    const val EXTRA_SNOOZE = "snooze"
    private const val INEXACT_WINDOW_MS = 10 * 60_000L

    fun canScheduleExact(ctx: Context): Boolean {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) am.canScheduleExactAlarms() else true
    }

    private fun pendingIntent(ctx: Context, spec: AlarmSpec, snooze: Boolean = false): PendingIntent {
        val intent = Intent(ctx, AlarmReceiver::class.java).apply {
            action = "com.fitsaathi.app.ALARM_FIRE"
            putExtra(EXTRA_ALARM_ID, spec.id)
            putExtra(EXTRA_SNOOZE, snooze)
            data = Uri.parse("fitsaathi://alarm/${spec.id}${if (snooze) "/snooze" else ""}")
        }
        val code = (spec.id + (if (snooze) ":snooze" else "")).hashCode()
        return PendingIntent.getBroadcast(ctx, code, intent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /**
     * Arms `spec` at `atMillis` (default: its next occurrence). Never throws: a spec whose trigger cannot be
     * computed, or an AlarmManager refusal, is logged and reported as `false`.
     */
    fun schedule(ctx: Context, spec: AlarmSpec, atMillis: Long? = null, snooze: Boolean = false): Boolean {
        val at: Long = atMillis ?: runCatching { spec.nextTriggerMillis() }.getOrElse { e ->
            Log.w(TAG, "Alarm ${spec.id} has an unusable schedule, skipping", e)
            return false
        }
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val pi = pendingIntent(ctx, spec, snooze)
        if (spec.isOneShot && at <= System.currentTimeMillis() && !snooze) {
            am.cancel(pi) // one-shot already in the past: nothing to arm
            return false
        }
        // A snooze is an explicit "in 10 minutes" from the user, so it is delivered exactly when permitted.
        val exact = spec.exact || snooze
        try {
            arm(ctx, am, spec, at, pi, exact)
        } catch (e: SecurityException) {
            Log.w(TAG, "Exact alarm not permitted for ${spec.id}, falling back to inexact", e)
            try {
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            } catch (e2: Exception) {
                Log.e(TAG, "Could not arm ${spec.id}", e2)
                return false
            }
        } catch (e: Exception) {
            Log.e(TAG, "Could not arm ${spec.id}", e)
            return false
        }
        return true
    }

    private fun arm(ctx: Context, am: AlarmManager, spec: AlarmSpec, at: Long, pi: PendingIntent, exact: Boolean) {
        when {
            exact && spec.alarmClock && canScheduleExact(ctx) -> {
                val show = PendingIntent.getActivity(
                    ctx, 0, Intent(ctx, MainActivity::class.java),
                    PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
                )
                am.setAlarmClock(AlarmManager.AlarmClockInfo(at, show), pi)
            }
            exact && canScheduleExact(ctx) -> am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            exact -> am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi) // permission missing: best effort
            else -> try {
                am.setWindow(AlarmManager.RTC_WAKEUP, at, INEXACT_WINDOW_MS, pi)
            } catch (e: Exception) {
                Log.w(TAG, "setWindow failed for ${spec.id}, using setAndAllowWhileIdle", e)
                am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi)
            }
        }
    }

    fun cancel(ctx: Context, spec: AlarmSpec) {
        val am = ctx.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        am.cancel(pendingIntent(ctx, spec, false))
        am.cancel(pendingIntent(ctx, spec, true))
    }

    /** Re-arm everything in AlarmStore; cancel alarms that were removed since last sync. Returns the number armed. */
    fun scheduleAll(ctx: Context): Int {
        val specs = AlarmStore.load(ctx)
        val current = specs.map { it.id }.toSet()
        for (oldId in AlarmStore.scheduledIds(ctx) - current) {
            cancel(ctx, AlarmSpec(oldId, "habit", "", "", "", 0, 0, emptyList(), emptyList(), false))
        }
        // Drop specs whose trigger cannot be computed and one-shots already in the past (yesterday's motivational slots).
        val now = System.currentTimeMillis()
        val live = ArrayList<AlarmSpec>(specs.size)
        for (spec in specs) {
            val next = runCatching { spec.nextTriggerMillis(now) }.getOrElse { e ->
                Log.w(TAG, "Dropping alarm ${spec.id}: unusable schedule", e)
                null
            } ?: continue
            if (spec.isOneShot && next <= now) continue
            live.add(spec)
        }
        if (live.size != specs.size) AlarmStore.save(ctx, live)
        var armed = 0
        for (spec in live) if (schedule(ctx, spec)) armed++
        AlarmStore.saveScheduledIds(ctx, current)
        Log.i(TAG, "Scheduled $armed/${live.size} alarms (exact permitted=${canScheduleExact(ctx)})")
        return armed
    }

    fun snooze(ctx: Context, spec: AlarmSpec, minutes: Int = 10) {
        schedule(ctx, spec, System.currentTimeMillis() + minutes * 60_000L, snooze = true)
    }
}
