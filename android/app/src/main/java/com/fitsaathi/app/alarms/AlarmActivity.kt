package com.fitsaathi.app.alarms

import android.app.Activity
import android.app.KeyguardManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.WindowManager
import android.widget.Button
import android.widget.TextView
import androidx.core.app.NotificationManagerCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.fitsaathi.app.R

/**
 * Alarm ring screen for supplement / workout alarms, shown over the lock screen. Reached by tapping the
 * heads-up alarm notification (USE_FULL_SCREEN_INTENT is not declared, so it is never auto-launched).
 * Plays the alarm ringtone itself (looping, alarm stream, 60 s cap) and vibrates; on arrival it re-posts the
 * notification on a silent channel so the sound is never doubled.
 */
class AlarmActivity : Activity() {

    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    /** Alarm currently bound to the screen (null until bind() succeeds). */
    private var boundAlarmId: String? = null
    private val handler = Handler(Looper.getMainLooper())
    private val stopRunnable = Runnable { stopSound() }

    companion object {
        const val EXTRA_ALARM_ID = "alarmId"
        private const val SOUND_TIMEOUT_MS = 60_000L
        private val VIBRATION = longArrayOf(0, 600, 300, 600, 300)

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
        setupEdgeToEdge()
        bind(intent)
    }

    /** Edge-to-edge (targetSdk 35+): keep the buttons clear of the system bars; the dark root paints behind them. */
    private fun setupEdgeToEdge() {
        val root = findViewById<View>(R.id.alarm_root) ?: return
        val baseLeft = root.paddingLeft
        val baseTop = root.paddingTop
        val baseRight = root.paddingRight
        val baseBottom = root.paddingBottom
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, windowInsets ->
            val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(baseLeft + insets.left, baseTop + insets.top, baseRight + insets.right, baseBottom + insets.bottom)
            WindowInsetsCompat.CONSUMED
        }
        ViewCompat.requestApplyInsets(root)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.setAppearanceLightStatusBars(false) // dark background -> light icons
        controller.setAppearanceLightNavigationBars(false)
    }

    /**
     * singleInstance + CLEAR_TOP: a tap on the notification of the alarm already ringing just brings the screen
     * forward (keep the sound going); a different alarm stops the first sound and rebinds.
     */
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val id = intent.getStringExtra(EXTRA_ALARM_ID)
        if (id != null && id == boundAlarmId && ringtone != null) return
        stopSound()
        bind(intent)
    }

    private fun bind(intent: Intent?) {
        val id = intent?.getStringExtra(EXTRA_ALARM_ID)
        val spec = if (id != null) AlarmStore.find(this, id) else null
        if (spec == null) {
            finish()
            return
        }
        boundAlarmId = spec.id

        findViewById<TextView>(R.id.alarm_title).text = spec.title
        findViewById<TextView>(R.id.alarm_body).text = spec.body
        val kind = when (spec.kind) { "workout", "fasting", "motivation" -> "habit"; else -> spec.kind }

        val done = findViewById<Button>(R.id.alarm_done)
        val snooze = findViewById<Button>(R.id.alarm_snooze)
        val dismiss = findViewById<Button>(R.id.alarm_dismiss)
        done.visibility = if (spec.actions.contains("done")) View.VISIBLE else View.GONE
        snooze.visibility = if (spec.actions.contains("snooze")) View.VISIBLE else View.GONE
        done.setOnClickListener { fire(kind, spec, "done"); finishAlarm(spec) }
        snooze.setOnClickListener { fire(kind, spec, "snooze"); finishAlarm(spec) }
        dismiss.setOnClickListener { finishAlarm(spec) }

        // Re-post the notification silently and without a full-screen intent: stops any channel sound that may
        // already be playing (banner path) so audio is never doubled, and keeps the action buttons in the shade.
        try { Notifications.showAlarm(this, spec, fromActivity = true) } catch (_: Exception) {}

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
        handler.removeCallbacks(stopRunnable)
        try {
            val uri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_ALARM) ?: RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION)
            val r = RingtoneManager.getRingtone(this, uri)
            if (r != null) {
                r.audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_ALARM)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) r.isLooping = true
                r.play()
                ringtone = r
            }
        } catch (_: Exception) {}
        try {
            val v = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager).defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            v.vibrate(VibrationEffect.createWaveform(VIBRATION, 0))
            vibrator = v
        } catch (_: Exception) {}
        handler.postDelayed(stopRunnable, SOUND_TIMEOUT_MS)
    }

    private fun stopSound() {
        handler.removeCallbacks(stopRunnable)
        try { ringtone?.stop() } catch (_: Exception) {}
        try { vibrator?.cancel() } catch (_: Exception) {}
        ringtone = null
        vibrator = null
    }

    override fun onDestroy() {
        stopSound()
        super.onDestroy()
    }
}
