package com.fitsaathi.app.alarms

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.RingtoneManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.fitsaathi.app.MainActivity
import com.fitsaathi.app.R

object Notifications {
    const val CHANNEL_ALARMS = "fitsaathi_alarms"
    const val CHANNEL_REMINDERS = "fitsaathi_reminders"
    const val CHANNEL_PINNED = "fitsaathi_pinned"
    const val PINNED_ID = 4242

    fun ensureChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel(CHANNEL_ALARMS, "Supplement alarms", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Exact-time alarms for supplements"
            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), null)
            enableVibration(true)
        })
        nm.createNotificationChannel(NotificationChannel(CHANNEL_REMINDERS, "Habit, water & fasting reminders", NotificationManager.IMPORTANCE_DEFAULT))
        nm.createNotificationChannel(NotificationChannel(CHANNEL_PINNED, "Today's checklist (pinned)", NotificationManager.IMPORTANCE_LOW).apply {
            setShowBadge(false)
        })
    }

    fun canPost(ctx: Context): Boolean =
        Build.VERSION.SDK_INT < 33 || ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED

    private fun openApp(ctx: Context, code: Int): PendingIntent = PendingIntent.getActivity(
        ctx, code, Intent(ctx, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP },
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    fun actionIntent(ctx: Context, kind: String, refId: String, action: String, alarmId: String?, code: Int): PendingIntent {
        val i = Intent(ctx, ActionReceiver::class.java).apply {
            this.action = ActionReceiver.ACTION
            putExtra(ActionReceiver.EXTRA_KIND, kind)
            putExtra(ActionReceiver.EXTRA_REF, refId)
            putExtra(ActionReceiver.EXTRA_ACTION, action)
            if (alarmId != null) putExtra(ActionReceiver.EXTRA_ALARM_ID, alarmId)
            data = android.net.Uri.parse("fitsaathi://action/$kind/$refId/$action/${alarmId ?: ""}")
        }
        return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    fun showAlarm(ctx: Context, spec: AlarmSpec) {
        ensureChannels(ctx)
        if (!canPost(ctx)) return
        val channel = if (spec.kind == "supplement") CHANNEL_ALARMS else CHANNEL_REMINDERS
        val b = NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_stat_fitsaathi)
            .setContentTitle(spec.title)
            .setContentText(spec.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(spec.body))
            .setPriority(if (spec.kind == "supplement") NotificationCompat.PRIORITY_HIGH else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(if (spec.kind == "supplement") NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            .setContentIntent(openApp(ctx, spec.notificationId))
        if (spec.kind == "supplement") b.setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))
        val kind = if (spec.kind == "fasting") "habit" else spec.kind
        var code = spec.notificationId * 7
        for (a in spec.actions) {
            val label = when (a) { "done" -> "✓ Done"; "skip" -> "Skip"; "snooze" -> "Snooze 10m"; "add" -> "+250 ml"; else -> a }
            b.addAction(0, label, actionIntent(ctx, kind, spec.refId, a, spec.id, code++))
        }
        NotificationManagerCompat.from(ctx).notify(spec.notificationId, b.build())
    }

    /** Ongoing, silent notification listing today's items with tick buttons for the first open ones. */
    fun refreshPinned(ctx: Context) {
        ensureChannels(ctx)
        val nm = NotificationManagerCompat.from(ctx)
        val s = PinnedStore.load(ctx)
        if (!s.enabled || s.items.length() == 0 || !canPost(ctx)) {
            nm.cancel(PINNED_ID)
            return
        }
        val style = NotificationCompat.InboxStyle()
        var done = 0
        val open = ArrayList<Pair<String, Pair<String, String>>>() // id -> (kind,title)
        for (i in 0 until s.items.length()) {
            val o = s.items.getJSONObject(i)
            val isDone = o.optBoolean("done")
            if (isDone) done++ else open.add(o.optString("id") to (o.optString("kind", "habit") to o.optString("title")))
            style.addLine((if (isDone) "✅ " else "◻️ ") + o.optString("title"))
        }
        val title = "FitSaathi · $done/${s.items.length()} done"
        val b = NotificationCompat.Builder(ctx, CHANNEL_PINNED)
            .setSmallIcon(R.drawable.ic_stat_fitsaathi)
            .setContentTitle(title)
            .setContentText(if (open.isEmpty()) "All done for today 🎉" else "Next: ${open.first().second.second}")
            .setStyle(style.setBigContentTitle(title))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(openApp(ctx, PINNED_ID))
        var code = 90_000
        for ((id, kt) in open.take(3)) {
            val label = "✓ " + kt.second.take(18)
            b.addAction(0, label, actionIntent(ctx, kt.first, id, "done", null, code++))
        }
        nm.notify(PINNED_ID, b.build())
    }
}
