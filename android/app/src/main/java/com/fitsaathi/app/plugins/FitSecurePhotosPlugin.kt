package com.fitsaathi.app.plugins

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/**
 * Progress photos encrypted with an AES-256-GCM key that lives in the Android Keystore
 * (non-exportable) and stored in app-private storage. Nothing leaves the device.
 */
@CapacitorPlugin(name = "FitSecurePhotos")
class FitSecurePhotosPlugin : Plugin() {

    private val alias = "fitsaathi_photos_v1"
    private val dir: File get() = File(context.filesDir, "photos").apply { mkdirs() }

    private fun key(): SecretKey {
        val ks = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        // getKey() rather than getEntry(): some OEM keystores return a non-SecretKeyEntry wrapper for AES keys.
        val existing = try { ks.getKey(alias, null) as? SecretKey } catch (e: Exception) { null }
        if (existing != null) return existing
        val gen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        gen.init(
            KeyGenParameterSpec.Builder(alias, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setRandomizedEncryptionRequired(true)
                .build(),
        )
        return gen.generateKey()
    }

    private fun fileFor(key: String): File {
        require(key.matches(Regex("^[A-Za-z0-9_-]+$"))) { "bad key" }
        return File(dir, "$key.enc")
    }

    @PluginMethod
    fun save(call: PluginCall) {
        val b64 = call.getString("base64") ?: return call.reject("base64 required")
        try {
            val plain = Base64.decode(b64, Base64.DEFAULT)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
            val iv = cipher.iv
            val enc = cipher.doFinal(plain)
            val storageKey = "p_" + UUID.randomUUID().toString().replace("-", "")
            fileFor(storageKey).outputStream().use { out ->
                out.write(iv.size)
                out.write(iv)
                out.write(enc)
            }
            call.resolve(JSObject().put("key", storageKey))
        } catch (e: Exception) {
            call.reject("Encrypt failed: ${e.message}", e)
        }
    }

    @PluginMethod
    fun load(call: PluginCall) {
        val storageKey = call.getString("key") ?: return call.reject("key required")
        try {
            val bytes = fileFor(storageKey).readBytes()
            val ivLen = bytes[0].toInt()
            val iv = bytes.copyOfRange(1, 1 + ivLen)
            val enc = bytes.copyOfRange(1 + ivLen, bytes.size)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv)) }
            val plain = cipher.doFinal(enc)
            call.resolve(JSObject().put("base64", Base64.encodeToString(plain, Base64.NO_WRAP)))
        } catch (e: Exception) {
            call.reject("Decrypt failed: ${e.message}", e)
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val storageKey = call.getString("key") ?: return call.reject("key required")
        runCatching { fileFor(storageKey).delete() }
        call.resolve()
    }
}
