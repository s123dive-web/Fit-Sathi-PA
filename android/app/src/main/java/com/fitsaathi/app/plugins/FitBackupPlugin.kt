package com.fitsaathi.app.plugins

import android.app.Activity
import android.content.Intent
import androidx.activity.result.ActivityResult
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Backup / restore through the Storage Access Framework. The user picks the destination
 * (Google Drive, Downloads, ...) — the app never talks to any cloud API itself.
 */
@CapacitorPlugin(name = "FitBackup")
class FitBackupPlugin : Plugin() {

    @PluginMethod
    fun saveDocument(call: PluginCall) {
        val filename = call.getString("filename") ?: "fitsaathi-backup.json"
        val mime = call.getString("mimeType") ?: "application/json"
        if (call.getString("data") == null) return call.reject("data required")
        val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = mime
            putExtra(Intent.EXTRA_TITLE, filename)
        }
        startActivityForResult(call, intent, "onSaveResult")
    }

    @ActivityCallback
    private fun onSaveResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("saved", false)); return
        }
        try {
            val data = call.getString("data") ?: ""
            context.contentResolver.openOutputStream(uri, "wt")?.use { it.write(data.toByteArray(Charsets.UTF_8)) }
                ?: return call.reject("Could not open destination")
            call.resolve(JSObject().put("saved", true))
        } catch (e: Exception) {
            call.reject("Write failed: ${e.message}", e)
        }
    }

    @PluginMethod
    fun openDocument(call: PluginCall) {
        val mimes = call.getArray("mimeTypes")?.toList<String>()?.toTypedArray() ?: arrayOf("application/json")
        val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
            addCategory(Intent.CATEGORY_OPENABLE)
            type = "*/*"
            putExtra(Intent.EXTRA_MIME_TYPES, mimes)
        }
        startActivityForResult(call, intent, "onOpenResult")
    }

    @ActivityCallback
    private fun onOpenResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val uri = result.data?.data
        if (result.resultCode != Activity.RESULT_OK || uri == null) {
            call.resolve(JSObject().put("data", JSObject.NULL).put("name", JSObject.NULL)); return
        }
        try {
            val text = context.contentResolver.openInputStream(uri)?.use { it.readBytes().toString(Charsets.UTF_8) }
                ?: return call.reject("Could not read file")
            var name: String? = null
            context.contentResolver.query(uri, arrayOf(android.provider.OpenableColumns.DISPLAY_NAME), null, null, null)?.use { c ->
                if (c.moveToFirst()) name = c.getString(0)
            }
            call.resolve(JSObject().put("data", text).put("name", name ?: "file"))
        } catch (e: Exception) {
            call.reject("Read failed: ${e.message}", e)
        }
    }
}
