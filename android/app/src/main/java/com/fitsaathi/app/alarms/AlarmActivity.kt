package com.fitsaathi.app.alarms

import android.app.Activity
import android.app.KeyguardManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat
import com.fitsaathi.app.R

/** Full-screen alarm UI shown over the lock screen for supplement / workout alarms. */
class AlarmActivity : Activity() {

    private var ringtone: android.media.Ringtone? = null
    private var vibrator: Vibrator? = null

    companion object {
        const val EXTRA_ALARM_ID = "alarmId"

        fun pendingIntent(ctx: Context, spec: AlarmSpec): PendingIntent {
            val i = Intent(ctx, AlarmActivity::class.java).apply {
                putExtra(EXTRA_ALARM_ID, spec.id)
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            }
            return PendingIntent.getActivity(ctx, spec.notificationId + 1, i, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            (getSystemService(Context.KEYGUARD_SERVICE) as KeyguardManager).requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD,
            )
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        setContentView(R.layout.activity_alarm)

        val id = intent.getStringExtra(EXTRA_ALARM_ID)
        val spec = id?.let { AlarmStore.find(this, it) }
        if (spec == null) { finish(); return }

        findViewById<TextView>(R.id.alarm_title).text = spec.title
        findViewById<TextView>(R.id.alarm_body).text = spec.body
        val kind = when (spec.kind) { "workout", "fasting", "motivation" -> "habit"; else -> spec.kind }

        val done = findViewById<Button>(R.id.alarm_done)
        val snooze = findViewById<Button>(R.id.alarm_snooze)
        val dismiss = findViewById<Button>(R.id.alarm_dismiss)
        done.visibility = if (spec.actions.contains("done")) android.view.View.VISIBLE else android.view.View.GONE
        done.setOnClickListener { fire(kind, spec, "done"); finishAlarm(spec) }
        snooze.setOnClickListener { fire(kind, spec, "snooze"); finishAlarm(spec) }
        dismiss.setOnClickListener { finishAlarm(spec) }

        startSound()
    }

    private fun fire(kind: String, spec: AlarmSpec, action: String) {
        sendBroadcast(Intent(this, ActionReceiver::class.java).apply {
            this.action = ActionReceiver.ACTION
            putExtra(ActionReceiver.EXTRA_KIND, kind)
            putExtra(ActionReceiver.EXTRA_REF, spec.refId)
            putExtra(ActionReceiver.EXTRA_ACTION, action)
            putExtra(ActionReceiver.EXTRA_ALARM_ID, spec.id)
        })
    }

    private fun finishAlarm(spec: AlarmSpec) {
        NotificationManagerCompat.from(this).cancel(spec.notificationId)
        stopSound()
        finish()
    }

    private fun startSound() {
        try {
            ringtone = RingtoneManager.getRingtone(this, RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM))?.apply { play() }
        } catch (_: Exception) {}
        try {
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION") getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            vibrator?.vibrate(VibrationEffect.createWaveform(longArrayOf(0, 600, 300, 600, 300), 0))
        } catch (_: Exception) {}
    }

    private fun stopSound() {
        try { ringtone?.stop() } catch (_: Exception) {}
        try { vibrator?.cancel() } catch (_: Exception) {}
    }

    override fun onDestroy() {
        stopSound()
        super.onDestroy()
    }
}
