package com.fitsaathi.app.plugins

import android.os.Build
import androidx.activity.result.ActivityResult
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateRequest
import androidx.health.connect.client.time.TimeRangeFilter
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.ActivityCallback
import com.getcapacitor.annotation.CapacitorPlugin
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import java.time.LocalDate
import java.time.ZoneId

/** Read-only steps from Health Connect. Permission-gated with graceful fallbacks. */
@CapacitorPlugin(name = "FitHealthConnect")
class FitHealthConnectPlugin : Plugin() {

    private val readSteps = HealthPermission.getReadPermission(StepsRecord::class)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    /** Mirrors HealthConnectStatus in src/native/plugins.ts. Health Connect needs Android 9 (API 28). */
    private fun status(): String {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.P) return "unsupported"
        return when (HealthConnectClient.getSdkStatus(context)) {
            HealthConnectClient.SDK_AVAILABLE -> "available"
            HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update_required"
            else -> "not_installed"
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        scope.cancel()
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val s = status()
        call.resolve(JSObject().put("available", s == "available").put("status", s))
    }

    @PluginMethod
    fun hasPermission(call: PluginCall) {
        if (status() != "available") {
            call.resolve(JSObject().put("granted", false))
            return
        }
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val granted = client.permissionController.getGrantedPermissions().contains(readSteps)
                call.resolve(JSObject().put("granted", granted))
            } catch (e: Exception) {
                call.resolve(JSObject().put("granted", false))
            }
        }
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (status() != "available") {
            call.resolve(JSObject().put("granted", false))
            return
        }
        try {
            val contract = PermissionController.createRequestPermissionResultContract()
            val intent = contract.createIntent(context, setOf(readSteps))
            startActivityForResult(call, intent, "permissionResult")
        } catch (e: Exception) {
            call.resolve(JSObject().put("granted", false))
        }
    }

    @ActivityCallback
    private fun permissionResult(call: PluginCall?, result: ActivityResult) {
        if (call == null) return
        val granted = try {
            PermissionController.createRequestPermissionResultContract().parseResult(result.resultCode, result.data).contains(readSteps)
        } catch (e: Exception) {
            false
        }
        call.resolve(JSObject().put("granted", granted))
    }

    @PluginMethod
    fun readSteps(call: PluginCall) {
        if (status() != "available") {
            call.reject("Health Connect unavailable")
            return
        }
        val dateStr = call.getString("date") ?: LocalDate.now().toString()
        scope.launch {
            try {
                val client = HealthConnectClient.getOrCreate(context)
                val zone = ZoneId.systemDefault()
                val day = LocalDate.parse(dateStr)
                val start = day.atStartOfDay(zone).toInstant()
                val end = day.plusDays(1).atStartOfDay(zone).toInstant()
                val response = client.aggregate(
                    AggregateRequest(metrics = setOf(StepsRecord.COUNT_TOTAL), timeRangeFilter = TimeRangeFilter.between(start, end)),
                )
                val steps = response[StepsRecord.COUNT_TOTAL] ?: 0L
                call.resolve(JSObject().put("steps", steps))
            } catch (e: SecurityException) {
                call.reject("Permission denied", e)
            } catch (e: Exception) {
                call.reject("Could not read steps: ${e.message}", e)
            }
        }
    }
}
