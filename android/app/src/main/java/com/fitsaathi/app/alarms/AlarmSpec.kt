package com.fitsaathi.app.alarms

import org.json.JSONArray
import org.json.JSONObject
import java.util.Calendar

/** Mirrors AlarmSpec in src/native/plugins.ts */
data class AlarmSpec(
    val id: String,
    val kind: String,
    val refId: String,
    val title: String,
    val body: String,
    val hour: Int,
    val minute: Int,
    val days: List<Int>,          // ISO weekdays 1..7, empty = daily
    val actions: List<String>,    // done | skip | snooze | add
    val alarmClock: Boolean,
) {
    val notificationId: Int get() = id.hashCode() and 0x7fffffff

    fun toJson(): JSONObject = JSONObject().apply {
        put("id", id); put("kind", kind); put("refId", refId); put("title", title); put("body", body)
        put("hour", hour); put("minute", minute)
        put("days", JSONArray(days)); put("actions", JSONArray(actions)); put("alarmClock", alarmClock)
    }

    /** Next occurrence strictly after `from` (epoch millis). */
    fun nextTriggerMillis(from: Long = System.currentTimeMillis()): Long {
        val cal = Calendar.getInstance().apply { timeInMillis = from }
        for (i in 0..7) {
            val c = (cal.clone() as Calendar).apply {
                add(Calendar.DAY_OF_YEAR, i)
                set(Calendar.HOUR_OF_DAY, hour); set(Calendar.MINUTE, minute); set(Calendar.SECOND, 0); set(Calendar.MILLISECOND, 0)
            }
            val iso = when (c.get(Calendar.DAY_OF_WEEK)) { Calendar.SUNDAY -> 7; else -> c.get(Calendar.DAY_OF_WEEK) - 1 }
            if (days.isNotEmpty() && !days.contains(iso)) continue
            if (c.timeInMillis > from) return c.timeInMillis
        }
        return from + 24 * 3600 * 1000L
    }

    companion object {
        fun fromJson(o: JSONObject): AlarmSpec = AlarmSpec(
            id = o.getString("id"),
            kind = o.optString("kind", "habit"),
            refId = o.optString("refId", ""),
            title = o.optString("title", "FitSaathi"),
            body = o.optString("body", ""),
            hour = o.optInt("hour", 8),
            minute = o.optInt("minute", 0),
            days = o.optJSONArray("days")?.let { a -> List(a.length()) { a.getInt(it) } } ?: emptyList(),
            actions = o.optJSONArray("actions")?.let { a -> List(a.length()) { a.getString(it) } } ?: emptyList(),
            alarmClock = o.optBoolean("alarmClock", false),
        )
    }
}
