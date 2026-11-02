package com.fitsaathi.app.plugins

import com.fitsaathi.app.alarms.WidgetStore
import com.fitsaathi.app.widget.HabitWidgetProvider
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

@CapacitorPlugin(name = "FitWidget")
class FitWidgetPlugin : Plugin() {
    @PluginMethod
    fun update(call: PluginCall) {
        val snapshot = JSONObject().apply {
            put("date", call.getString("date") ?: "")
            put("items", call.getArray("items") ?: org.json.JSONArray())
            put("waterMl", call.getInt("waterMl") ?: 0)
            put("waterTargetMl", call.getInt("waterTargetMl") ?: 0)
            put("xpToday", call.getInt("xpToday") ?: 0)
        }
        WidgetStore.save(context, snapshot)
        HabitWidgetProvider.refreshAll(context)
        call.resolve()
    }
}
