package com.fitsaathi.app.plugins

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

    @PluginMethod
    fun authenticate(call: PluginCall) {
        if (status() != "available") {
            call.resolve(JSObject().put("success", false).put("reason", status())); return
        }
        val act = activity as? FragmentActivity ?: run {
            call.resolve(JSObject().put("success", false).put("reason", "no_activity")); return
        }
        val title = call.getString("title") ?: "Unlock FitSaathi"
        val subtitle = call.getString("subtitle")
        val negative = call.getString("negativeButton") ?: "Use PIN"
        act.runOnUiThread {
            val prompt = BiometricPrompt(act, ContextCompat.getMainExecutor(act), object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    call.resolve(JSObject().put("success", true))
                }
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    val reason = when (errorCode) {
                        BiometricPrompt.ERROR_NEGATIVE_BUTTON, BiometricPrompt.ERROR_USER_CANCELED, BiometricPrompt.ERROR_CANCELED -> "cancelled"
                        BiometricPrompt.ERROR_LOCKOUT, BiometricPrompt.ERROR_LOCKOUT_PERMANENT -> "lockout"
                        else -> "error:$errorCode"
                    }
                    call.resolve(JSObject().put("success", false).put("reason", reason))
                }
                override fun onAuthenticationFailed() { /* wrong finger: prompt stays open */ }
            })
            val info = BiometricPrompt.PromptInfo.Builder()
                .setTitle(title)
                .apply { if (subtitle != null) setSubtitle(subtitle) }
                .setNegativeButtonText(negative)
                .setAllowedAuthenticators(authenticators)
                .setConfirmationRequired(false)
                .build()
            prompt.authenticate(info)
        }
    }
}
