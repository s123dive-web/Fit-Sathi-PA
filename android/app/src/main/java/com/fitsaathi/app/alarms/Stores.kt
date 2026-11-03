package com.fitsaathi.app.alarms

import android.annotation.SuppressLint
import android.content.Context
import android.util.Log
import org.json.JSONArray
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/*
 * All stores below are tiny SharedPreferences-backed snapshots that are written from several threads
 * (Capacitor's plugin executor, BroadcastReceivers on the main thread, the widget provider). Every
 * read-modify-write is therefore `@Synchronized` on the store object and uses `commit()` so a receiver
 * that is killed right after returning cannot lose the write.
 */

/** Persisted alarm definitions (survive reboot). */
object AlarmStore {
    private const val TAG = "FitAlarms"
    private const val PREFS = "fitsaathi_alarms"
    private const val KEY = "alarms"
    private const val KEY_SCHEDULED = "scheduled_ids"

    @Synchronized
    @SuppressLint("ApplySharedPref")
    fun save(ctx: Context, specs: List<AlarmSpec>) {
        val arr = JSONArray()
        for (s in specs) arr.put(s.toJson())
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).commit()
    }

    @Synchronized
    fun load(ctx: Context): List<AlarmSpec> {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return emptyList()
        return try {
            val arr = JSONArray(raw)
            val out = ArrayList<AlarmSpec>(arr.length())
            for (i in 0 until arr.length()) {
                val o = arr.optJSONObject(i) ?: continue
                val spec = AlarmSpec.fromJson(o)
                if (spec == null) Log.w(TAG, "Skipping malformed stored alarm: $o") else out.add(spec)
            }
            out
        } catch (e: Exception) {
            Log.w(TAG, "Stored alarms unreadable, starting empty", e)
            emptyList()
        }
    }

    fun find(ctx: Context, id: String): AlarmSpec? = load(ctx).firstOrNull { it.id == id }

    @Synchronized
    @SuppressLint("ApplySharedPref")
    fun saveScheduledIds(ctx: Context, ids: Set<String>) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putStringSet(KEY_SCHEDULED, HashSet(ids)).commit()
    }

    @Synchronized
    fun scheduledIds(ctx: Context): Set<String> {
        val stored = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getStringSet(KEY_SCHEDULED, null) ?: return emptySet()
        return HashSet(stored) // copy: the set returned by SharedPreferences must not be modified or reused
    }
}

/** Actions taken from notifications / widget while the web layer may not be running. */
object PendingActionStore {
    private const val PREFS = "fitsaathi_pending"
    private const val KEY = "actions"
    const val BROADCAST = "com.fitsaathi.app.PENDING_ACTION"
    const val EXTRA_JSON = "json"

    fun todayIso(): String = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())

    /** Builds an action entry (mirrors PendingNativeAction in src/types.ts) without persisting it. */
    fun entry(kind: String, refId: String, action: String, date: String = todayIso()): JSONObject {
        val o = JSONObject()
        o.put("kind", kind)
        o.put("refId", refId)
        o.put("action", action)
        o.put("date", date)
        o.put("ts", System.currentTimeMillis())
        return o
    }

    /** Persists an already-built entry (used when no live receiver consumed the broadcast). */
    @Synchronized
    @SuppressLint("ApplySharedPref")
    fun add(ctx: Context, entry: JSONObject) {
        val arr = readUnlocked(ctx)
        arr.put(entry)
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString(KEY, arr.toString()).commit()
    }

    fun add(ctx: Context, kind: String, refId: String, action: String, date: String = todayIso()): JSONObject {
        val e = entry(kind, refId, action, date)
        add(ctx, e)
        return e
    }

    private fun readUnlocked(ctx: Context): JSONArray {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null) ?: return JSONArray()
        return try { JSONArray(raw) } catch (e: Exception) { JSONArray() }
    }

    @Synchronized
    fun getAll(ctx: Context): JSONArray = readUnlocked(ctx)

    @Synchronized
    @SuppressLint("ApplySharedPref")
    fun clear(ctx: Context) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).commit()
    }

    /** Atomic get + clear: no window in which an action landing between the two calls could be dropped. */
    @Synchronized
    @SuppressLint("ApplySharedPref")
    fun drain(ctx: Context): JSONArray {
        val arr = readUnlocked(ctx)
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().remove(KEY).commit()
        return arr
    }
}

/** Snapshot of today's items for the pinned notification. */
object PinnedStore {
    private const val PREFS = "fitsaathi_pinned"

    @Synchronized
    @SuppressLint("ApplySharedPref")
    fun save(ctx: Context, enabled: Boolean, title: String, date: String, items: JSONArray) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
            .putBoolean("enabled", enabled)
            .putString("title", title)
            .putString("date", date)
            .putString("items", items.toString())
            .commit()
    }

    data class Snapshot(val enabled: Boolean, val title: String, val date: String, val items: JSONArray)

    @Synchronized
    fun load(ctx: Context): Snapshot {
        val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val items = try { JSONArray(p.getString("items", "[]") ?: "[]") } catch (e: Exception) { JSONArray() }
        return Snapshot(p.getBoolean("enabled", false), p.getString("title", "FitSaathi") ?: "FitSaathi", p.getString("date", "") ?: "", items)
    }

    /** Mark an item done locally so the notification updates instantly, before the web layer syncs. */
    @Synchronized
    fun markDone(ctx: Context, id: String) {
        val s = load(ctx)
        var done = 0
        for (i in 0 until s.items.length()) {
            val o = s.items.optJSONObject(i) ?: continue
            if (o.optString("id") == id) o.put("done", true)
            if (o.optBoolean("done")) done++
        }
        save(ctx, s.enabled, "FitSaathi · $done/${s.items.length()} done", s.date, s.items)
    }
}

/** Snapshot for the home-screen widget. */
object WidgetStore {
    private const val PREFS = "fitsaathi_widget"

    @Synchronized
    @SuppressLint("ApplySharedPref")
    fun save(ctx: Context, json: JSONObject) {
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putString("snapshot", json.toString()).commit()
    }

    @Synchronized
    fun load(ctx: Context): JSONObject {
        val raw = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString("snapshot", null) ?: return JSONObject()
        return try { JSONObject(raw) } catch (e: Exception) { JSONObject() }
    }

    @Synchronized
    fun markDone(ctx: Context, id: String) {
        val s = load(ctx)
        val items = s.optJSONArray("items") ?: return
        for (i in 0 until items.length()) {
            val o = items.optJSONObject(i) ?: continue
            if (o.optString("id") == id) o.put("done", true)
        }
        save(ctx, s)
    }

    @Synchronized
    fun addWater(ctx: Context, ml: Int) {
        val s = load(ctx)
        s.put("waterMl", s.optInt("waterMl", 0) + ml)
        save(ctx, s)
    }
}
