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
    val fullScreen: Boolean = false,
    val date: String? = null,     // one-shot on this local date (yyyy-MM-dd); null = recurring
    val exact: Boolean = false,   // exact delivery (supplements / workout); everything else is inexact
) {
    val notificationId: Int get() = id.hashCode() and 0x7fffffff

    fun toJson(): JSONObject {
        val o = JSONObject()
        o.put("id", id); o.put("kind", kind); o.put("refId", refId); o.put("title", title); o.put("body", body)
        o.put("hour", hour); o.put("minute", minute)
        o.put("days", JSONArray(days)); o.put("actions", JSONArray(actions))
        o.put("alarmClock", alarmClock); o.put("fullScreen", fullScreen); o.put("exact", exact)
        o.put("date", date ?: JSONObject.NULL)
        return o
    }

    val isOneShot: Boolean get() = date != null

    /**
     * Next occurrence strictly after `from` (epoch millis). Throws on a malformed date; every caller
     * wraps this in runCatching so a bad stored spec is skipped instead of crashing a receiver.
     */
    fun nextTriggerMillis(from: Long = System.currentTimeMillis()): Long {
        if (date != null) {
            val m = DATE_RE.matchEntire(date) ?: throw IllegalArgumentException("bad date '$date' on alarm $id")
            val year = m.groupValues[1].toInt()
            val month = m.groupValues[2].toInt()
            val day = m.groupValues[3].toInt()
            require(month in 1..12 && day in 1..31) { "bad date '$date' on alarm $id" }
            val c = Calendar.getInstance()
            c.isLenient = false
            c.clear()
            c.set(year, month - 1, day, hour, minute, 0)
            return c.timeInMillis // non-lenient: throws IllegalArgumentException on e.g. Feb 30
        }
        val cal = Calendar.getInstance()
        cal.timeInMillis = from
        for (i in 0..7) {
            val c = cal.clone() as Calendar
            c.add(Calendar.DAY_OF_YEAR, i)
            c.set(Calendar.HOUR_OF_DAY, hour); c.set(Calendar.MINUTE, minute); c.set(Calendar.SECOND, 0); c.set(Calendar.MILLISECOND, 0)
            val iso = if (c.get(Calendar.DAY_OF_WEEK) == Calendar.SUNDAY) 7 else c.get(Calendar.DAY_OF_WEEK) - 1
            if (days.isNotEmpty() && !days.contains(iso)) continue
            if (c.timeInMillis > from) return c.timeInMillis
        }
        return from + 24 * 3600 * 1000L
    }

    companion object {
        private val DATE_RE = Regex("""(\d{4})-(\d{2})-(\d{2})""")

        /** Null when the JSON cannot describe a usable alarm (missing id, malformed date, out-of-range time). */
        fun fromJson(o: JSONObject): AlarmSpec? {
            val id = o.optString("id", "")
            if (id.isEmpty()) return null
            val date: String? = if (o.isNull("date")) null else o.optString("date", "").ifEmpty { null }
            if (date != null && !DATE_RE.matches(date)) return null
            val hour = o.optInt("hour", 8)
            val minute = o.optInt("minute", 0)
            if (hour !in 0..23 || minute !in 0..59) return null
            val daysArr = o.optJSONArray("days")
            val days = ArrayList<Int>()
            if (daysArr != null) for (i in 0 until daysArr.length()) { val d = daysArr.optInt(i, -1); if (d in 1..7) days.add(d) }
            val actionsArr = o.optJSONArray("actions")
            val actions = ArrayList<String>()
            if (actionsArr != null) for (i in 0 until actionsArr.length()) { val a = actionsArr.optString(i, ""); if (a.isNotEmpty()) actions.add(a) }
            return AlarmSpec(
                id = id,
                kind = o.optString("kind", "habit"),
                refId = o.optString("refId", ""),
                title = o.optString("title", "FitSaathi"),
                body = o.optString("body", ""),
                hour = hour,
                minute = minute,
                days = days,
                actions = actions,
                alarmClock = o.optBoolean("alarmClock", false),
                fullScreen = o.optBoolean("fullScreen", false),
                date = date,
                exact = o.optBoolean("exact", false),
            )
        }
    }
}
