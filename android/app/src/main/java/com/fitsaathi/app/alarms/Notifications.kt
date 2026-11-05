package com.fitsaathi.app.alarms

import android.Manifest
import android.annotation.SuppressLint
import android.app.KeyguardManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.media.AudioAttributes
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.fitsaathi.app.MainActivity
import com.fitsaathi.app.R

object Notifications {
    /** Heads-up alarms (screen on / full-screen intent not granted): alarm sound on the alarm stream + vibration. */
    const val CHANNEL_ALARMS = "fitsaathi_alarms_v2"
    /** Silent carrier for the full-screen path: AlarmActivity plays the looping alarm sound and vibrates itself. */
    const val CHANNEL_ALARMS_FSI = "fitsaathi_alarms_fsi"
    const val CHANNEL_REMINDERS = "fitsaathi_reminders"
    const val CHANNEL_PINNED = "fitsaathi_pinned"
    const val CHANNEL_MOTIVATION = "fitsaathi_motivation"
    const val PINNED_ID = 4242
    private const val LEGACY_CHANNEL_ALARMS = "fitsaathi_alarms" // had channel sound + vibration: doubled the activity audio

    private val ALARM_VIBRATION = longArrayOf(0, 600, 300, 600, 300, 600)

    fun ensureChannels(ctx: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return
        val alarmAttrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_ALARM)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        nm.createNotificationChannel(NotificationChannel(CHANNEL_ALARMS, "Supplement & workout alarms", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Alarm sound and vibration when the alarm is shown as a banner"
            setSound(RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM), alarmAttrs)
            enableVibration(true)
            vibrationPattern = ALARM_VIBRATION
        })
        nm.createNotificationChannel(NotificationChannel(CHANNEL_ALARMS_FSI, "Full-screen alarms", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Full-screen alarm UI (the alarm screen plays the sound itself)"
            setSound(null, null)
            enableVibration(false)
        })
        nm.createNotificationChannel(NotificationChannel(CHANNEL_REMINDERS, "Habit, water & fasting reminders", NotificationManager.IMPORTANCE_DEFAULT))
        nm.createNotificationChannel(NotificationChannel(CHANNEL_MOTIVATION, "Motivational messages", NotificationManager.IMPORTANCE_DEFAULT))
        nm.createNotificationChannel(NotificationChannel(CHANNEL_PINNED, "Today's checklist (pinned)", NotificationManager.IMPORTANCE_LOW).apply {
            setShowBadge(false)
        })
        try { nm.deleteNotificationChannel(LEGACY_CHANNEL_ALARMS) } catch (_: Exception) {}
    }

    /** Notifications can actually be posted: app-level toggle on every API level, plus POST_NOTIFICATIONS on 33+. */
    fun canPost(ctx: Context): Boolean {
        if (!NotificationManagerCompat.from(ctx).areNotificationsEnabled()) return false
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED
    }

    /**
     * True only when the manifest declares USE_FULL_SCREEN_INTENT. The permission is intentionally not declared
     * (Play restricts it to alarm-clock / calling apps), so this is false on every API level and alarms take the
     * heads-up path; the check is kept data-driven so declaring the permission again re-enables the path.
     */
    fun isFullScreenIntentDeclared(ctx: Context): Boolean {
        return try {
            @Suppress("DEPRECATION")
            val info = ctx.packageManager.getPackageInfo(ctx.packageName, PackageManager.GET_PERMISSIONS)
            val requested = info.requestedPermissions ?: return false
            requested.contains(Manifest.permission.USE_FULL_SCREEN_INTENT)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Whether a full-screen intent would actually launch: the permission must be declared (see above) and, on
     * Android 14+, granted by the user. Without the declaration the system ignores setFullScreenIntent entirely.
     */
    fun canUseFullScreenIntent(ctx: Context): Boolean {
        if (!isFullScreenIntentDeclared(ctx)) return false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return true
        val nm = ctx.getSystemService(NotificationManager::class.java) ?: return false
        return nm.canUseFullScreenIntent()
    }

    /**
     * Intent for the system screen where the user grants the full-screen-intent permission. Null below API 34 and
     * whenever the permission is not declared (the settings screen would be meaningless then).
     */
    fun fullScreenIntentSettingsIntent(ctx: Context): Intent? {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) return null
        if (!isFullScreenIntentDeclared(ctx)) return null
        return Intent(android.provider.Settings.ACTION_MANAGE_APP_USE_FULL_SCREEN_INTENT, Uri.parse("package:${ctx.packageName}"))
    }

    /**
     * SystemUI only launches a full-screen intent when it cannot show a heads-up banner instead
     * (screen off or keyguard showing). Predicting this lets us pick a silent channel for the
     * full-screen path and a sounding one for the banner path, so the alarm is heard exactly once.
     */
    private fun fullScreenWillLaunch(ctx: Context): Boolean {
        val pm = ctx.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return false
        val km = ctx.getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager ?: return false
        return !pm.isInteractive || km.isKeyguardLocked
    }

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
            data = Uri.parse("fitsaathi://action/$kind/$refId/$action/${alarmId ?: ""}")
        }
        return PendingIntent.getBroadcast(ctx, code, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
    }

    /**
     * Posts the notification for a fired alarm.
     *
     * Alarms (`spec.fullScreen`) are high-priority heads-up banners on the alarm channel (USAGE_ALARM sound +
     * vibration) with the Done / Snooze action buttons; tapping the banner opens AlarmActivity, the ring screen.
     * The full-screen-intent path is only taken when USE_FULL_SCREEN_INTENT is declared and granted *and* the
     * intent will actually launch (screen off / locked); then the notification goes on the silent channel and
     * AlarmActivity makes the noise. `fromActivity` re-posts the same notification silently and without a
     * full-screen intent (used by AlarmActivity to stop any channel sound so audio is never doubled, and to
     * avoid re-launching itself).
     */
    @SuppressLint("MissingPermission")
    fun showAlarm(ctx: Context, spec: AlarmSpec, fromActivity: Boolean = false) {
        ensureChannels(ctx)
        if (!canPost(ctx)) return
        val fsiAllowed = spec.fullScreen && !fromActivity && canUseFullScreenIntent(ctx)
        val silent = spec.fullScreen && (fromActivity || (fsiAllowed && fullScreenWillLaunch(ctx)))
        val channel = when {
            spec.fullScreen && silent -> CHANNEL_ALARMS_FSI
            spec.fullScreen -> CHANNEL_ALARMS
            spec.kind == "motivation" -> CHANNEL_MOTIVATION
            else -> CHANNEL_REMINDERS
        }
        val b = NotificationCompat.Builder(ctx, channel)
            .setSmallIcon(R.drawable.ic_stat_fitsaathi)
            .setContentTitle(spec.title)
            .setContentText(spec.body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(spec.body))
            .setPriority(if (spec.fullScreen) NotificationCompat.PRIORITY_MAX else NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(if (spec.fullScreen) NotificationCompat.CATEGORY_ALARM else NotificationCompat.CATEGORY_REMINDER)
            .setAutoCancel(true)
            // Alarms open the ring screen on tap (the full-screen path is normally unavailable); reminders open the app.
            .setContentIntent(if (spec.fullScreen) AlarmActivity.pendingIntent(ctx, spec) else openApp(ctx, spec.notificationId))
        if (spec.fullScreen) {
            if (silent) b.setSilent(true) else b.setVibrate(ALARM_VIBRATION)
            if (fsiAllowed) b.setFullScreenIntent(AlarmActivity.pendingIntent(ctx, spec), true)
            if (fromActivity) b.setOnlyAlertOnce(true)
            // Lock screen: keep the alarm title / actions visible so it can be answered without unlocking.
            b.setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
        }
        val kind = when (spec.kind) { "fasting", "motivation", "workout" -> "habit"; else -> spec.kind }
        var code = spec.notificationId * 7
        for (a in spec.actions) {
            val label = when (a) { "done" -> "✓ Done"; "skip" -> "Skip"; "snooze" -> "Snooze 10m"; "add" -> "+${ActionReceiver.WATER_STEP_ML} ml"; else -> a }
            b.addAction(0, label, actionIntent(ctx, kind, spec.refId, a, spec.id, code++))
        }
        NotificationManagerCompat.from(ctx).notify(spec.notificationId, b.build())
    }

    /** Ongoing, silent notification listing today's items with tick buttons for the first open ones. */
    @SuppressLint("MissingPermission")
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
        var total = 0
        val open = ArrayList<Triple<String, String, String>>() // id, kind, title
        for (i in 0 until s.items.length()) {
            val o = s.items.optJSONObject(i) ?: continue
            total++
            val isDone = o.optBoolean("done")
            val title = o.optString("title")
            if (isDone) done++ else open.add(Triple(o.optString("id"), o.optString("kind", "habit"), title))
            style.addLine((if (isDone) "✅ " else "◻️ ") + title)
        }
        if (total == 0) {
            nm.cancel(PINNED_ID)
            return
        }
        val title = "FitSaathi · $done/$total done"
        // Lock screen (VISIBILITY_PRIVATE): habit titles stay hidden behind a generic public version.
        val publicVersion = NotificationCompat.Builder(ctx, CHANNEL_PINNED)
            .setSmallIcon(R.drawable.ic_stat_fitsaathi)
            .setContentTitle("FitSaathi checklist")
            .setContentText("$done/$total done")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setContentIntent(openApp(ctx, PINNED_ID))
            .build()
        val b = NotificationCompat.Builder(ctx, CHANNEL_PINNED)
            .setSmallIcon(R.drawable.ic_stat_fitsaathi)
            .setContentTitle(title)
            .setContentText(if (open.isEmpty()) "All done for today 🎉" else "Next: ${open.first().third}")
            .setStyle(style.setBigContentTitle(title))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setPublicVersion(publicVersion)
            .setContentIntent(openApp(ctx, PINNED_ID))
        var code = 90_000
        for ((id, kind, itemTitle) in open.take(3)) {
            val label = "✓ " + itemTitle.take(18)
            b.addAction(0, label, actionIntent(ctx, kind, id, "done", null, code++))
        }
        nm.notify(PINNED_ID, b.build())
    }
}
