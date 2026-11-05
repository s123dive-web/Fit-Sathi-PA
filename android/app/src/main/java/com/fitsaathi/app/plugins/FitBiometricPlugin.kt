package com.fitsaathi.app.plugins

import android.view.WindowManager
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_STRONG
import androidx.biometric.BiometricManager.Authenticators.BIOMETRIC_WEAK
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/** Fingerprint / face unlock through androidx BiometricPrompt. The PIN stays the fallback inside the app. */
@CapacitorPlugin(name = "FitBiometric")
class FitBiometricPlugin : Plugin() {

    private val authenticators = BIOMETRIC_STRONG or BIOMETRIC_WEAK

    /** The single in-flight authenticate() call; a new call supersedes it, activity destruction rejects it. */
    private val lock = Any()
    private var pending: PluginCall? = null

    private fun status(): String = when (BiometricManager.from(context).canAuthenticate(authenticators)) {
        BiometricManager.BIOMETRIC_SUCCESS -> "available"
        BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "none_enrolled"
        BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE, BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> "no_hardware"
        else -> "unavailable"
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val s = status()
        call.resolve(JSObject().put("available", s == "available").put("status", s))
    }

    /** Resolves `call` only if it is still the in-flight call (a superseded call was already rejected). */
    private fun finish(call: PluginCall, data: JSObject) {
        val mine = synchronized(lock) {
            if (pending === call) {
                pending = null
                true
            } else {
                false
            }
        }
        if (mine) call.resolve(data)
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        val orphan = synchronized(lock) {
            val p = pending
            pending = null
            p
        }
        orphan?.reject("destroyed", "destroyed")
    }

    /**
     * FLAG_SECURE on the main window: blocks screenshots / screen recording and blanks the app in Recents while
     * the PIN / biometric lock is active (`enabled` true). Cleared again with `enabled` false.
     */
    @PluginMethod
    fun setSecureScreen(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        val act = activity
        if (act == null) {
            call.reject("no_activity")
            return
        }
        act.runOnUiThread {
            try {
                if (enabled) {
                    act.window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
                } else {
                    act.window.clearFlags(WindowManager.LayoutParams.FLAG_SECURE)
                }
                call.resolve()
            } catch (e: Exception) {
                call.reject("Could not update FLAG_SECURE: ${e.message}", e)
            }
        }
    }

    @PluginMethod
    fun authenticate(call: PluginCall) {
        val s = status()
        if (s != "available") {
            call.resolve(JSObject().put("success", false).put("reason", s))
            return
        }
        val act = activity as? FragmentActivity
        if (act == null) {
            call.resolve(JSObject().put("success", false).put("reason", "no_activity"))
            return
        }
        val previous = synchronized(lock) {
            val p = pending
            pending = call
            p
        }
        previous?.reject("superseded", "superseded")

        val title = call.getString("title") ?: "Unlock FitSaathi"
        val subtitle = call.getString("subtitle")
        val negative = call.getString("negativeButton") ?: "Use PIN"
        act.runOnUiThread {
            val callback = object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    finish(call, JSObject().put("success", true))
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    val reason = when (errorCode) {
                        BiometricPrompt.ERROR_NEGATIVE_BUTTON, BiometricPrompt.ERROR_USER_CANCELED, BiometricPrompt.ERROR_CANCELED -> "cancelled"
                        BiometricPrompt.ERROR_LOCKOUT, BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> "lockout"
                        else -> "error:$errorCode"
                    }
                    finish(call, JSObject().put("success", false).put("reason", reason))
                }

                override fun onAuthenticationFailed() { /* wrong finger: prompt stays open */ }
            }
            try {
                val prompt = BiometricPrompt(act, ContextCompat.getMainExecutor(act), callback)
                val builder = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setNegativeButtonText(negative)
                    .setAllowedAuthenticators(authenticators)
                    .setConfirmationRequired(false)
                if (subtitle != null) builder.setSubtitle(subtitle)
                prompt.authenticate(builder.build())
            } catch (e: Exception) {
                finish(call, JSObject().put("success", false).put("reason", "error:${e.message}"))
            }
        }
    }
}
