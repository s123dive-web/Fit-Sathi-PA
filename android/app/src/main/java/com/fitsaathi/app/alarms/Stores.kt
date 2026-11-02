package com.fitsaathi.app.alarms

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/** Persisted alarm definitions (survive reboot). */
object AlarmStore {
    private const val PREFS = "fitsaathi_alarms"
    private const val KEY = "alarms"
    private const val KEY_SCHEDULED = "scheduled_ids"

    fun save(ctx: Context, specs: List<AlarmSpec>) {
        val arr = JSONArray().apply { specs.forEach { put(it.toJson()) } }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).apply()
    }

    fun load(ctx: Context): List<AlarmSpec> {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            List(arr.length()) { AlarmSpec.fromJson(arr.getJSONObject(it)) }
        } catch (e: Exception) { emptyList() }
    }

    fun find(ctx: Context, id: String): AlarmSpec? = load(ctx).firstOrNull { it.id == id }

    fun saveScheduledIds(ctx: Context, ids: Set<String>) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet(KEY_SCHEDULED, ids).apply()
    }

    fun scheduledIds(ctx: Context): Set<String> =
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet(KEY_SCHEDULED, emptySet()) ?: emptySet()
}

/** Actions taken from notifications / widget while the web layer may not be running. */
object PendingActionStore {
    private const val PREFS = "fitsaathi_pending"
    private const val KEY = "actions"
    const val BROADCAST = "com.fitsaathi.app.PENDING_ACTION"

    fun todayIso(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    fun add(ctx: Context, kind: String, refId: String, action: String, date: String = todayIso()): JSONObject {
        val entry = JSONObject().apply {
            put("kind", kind); put("refId", refId); put("action", action); put("date", date); put("ts", System.currentTimeMillis())
        }
        val arr = getAll(ctx).apply { put(entry) }
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).apply()
        return entry
    }

    fun getAll(ctx: Context): JSONArray {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return JSONArray()
        return try { JSONArray(raw) } catch (e: Exception) { JSONArray() }
    }

    fun clear(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).apply()
    }
}

/** Snapshot of today's items for the pinned notification. */
object PinnedStore {
    private const val PREFS = "fitsaathi_pinned"

    fun save(ctx: Context, enabled: Boolean, title: String, date: String, items: JSONArray) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", enabled).putString("title", title).putString("date", date).putString("items", items.toString()).apply()
    }

    data class Snapshot(val enabled: Boolean, val title: String, val date: String, val items: JSONArray)

    fun load(ctx: Context): Snapshot {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val items = try { JSONArray(p.getString("items", "[]")) } catch (e: Exception) { JSONArray() }
        return Snapshot(p.getBoolean("enabled", false), p.getString("title", "FitSaathi") ?: "FitSaathi", p.getString("date", "") ?: "", items)
    }

    /** Mark an item done locally so the notification updates instantly, before the web layer syncs. */
    fun markDone(ctx: Context, id: String) {
        val s = load(ctx)
        var done = 0
        for (i in 0 until s.items.length()) {
            val o = s.items.getJSONObject(i)
            if (o.optString("id") == id) o.put("done", true)
            if (o.optBoolean("done")) done++
        }
        save(ctx, s.enabled, "FitSaathi · $done/${s.items.length()} done", s.date, s.items)
    }
}

/** Snapshot for the home-screen widget. */
object WidgetStore {
    private const val PREFS = "fitsaathi_widget"

    fun save(ctx: Context, json: JSONObject) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("snapshot", json.toString()).apply()
    }

    fun load(ctx: Context): JSONObject {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("snapshot", null) ?: return JSONObject()
        return try { JSONObject(raw) } catch (e: Exception) { JSONObject() }
    }

    fun markDone(ctx: Context, id: String) {
        val s = load(ctx)
        val items = s.optJSONArray("items") ?: return
        for (i in 0 until items.length()) {
            val o = items.getJSONObject(i)
            if (o.optString("id") == id) o.put("done", true)
        }
        save(ctx, s)
    }

    fun addWater(ctx: Context, ml: Int) {
        val s = load(ctx)
        s.put("waterMl", s.optInt("waterMl", 0) + ml)
        save(ctx, s)
    }
}
