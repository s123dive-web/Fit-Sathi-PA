package com.fitsaathi.app.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.view.View
import android.widget.RemoteViews
import com.fitsaathi.app.MainActivity
import com.fitsaathi.app.R
import com.fitsaathi.app.alarms.Notifications
import com.fitsaathi.app.alarms.WidgetStore

/**
 * Home-screen widget: today's habits & supplements with one-tap ticks, water and XP.
 * Reads the snapshot written by the FitWidget plugin; taps go through ActionReceiver.
 */
class HabitWidgetProvider : AppWidgetProvider() {

    override fun onUpdate(context: Context, appWidgetManager: AppWidgetManager, appWidgetIds: IntArray) {
        for (id in appWidgetIds) appWidgetManager.updateAppWidget(id, build(context))
    }

    companion object {
        private val ROWS = intArrayOf(R.id.row1, R.id.row2, R.id.row3, R.id.row4, R.id.row5, R.id.row6)

        fun refreshAll(context: Context) {
            val mgr = AppWidgetManager.getInstance(context)
            val ids = mgr.getAppWidgetIds(ComponentName(context, HabitWidgetProvider::class.java))
            if (ids.isEmpty()) return
            val views = build(context)
            for (id in ids) mgr.updateAppWidget(id, views)
        }

        fun build(context: Context): RemoteViews {
            val v = RemoteViews(context.packageName, R.layout.widget_habits)
            val s = WidgetStore.load(context)
            val items = s.optJSONArray("items") ?: org.json.JSONArray()
            var done = 0
            for (i in 0 until items.length()) if (items.getJSONObject(i).optBoolean("done")) done++
            val water = s.optInt("waterMl", 0)
            val target = s.optInt("waterTargetMl", 0)
            v.setTextViewText(R.id.header, "FitSaathi · $done/${items.length()}")
            v.setTextViewText(
                R.id.subheader,
                "💧 ${"%.2f".format(water / 1000.0)}${if (target > 0) " / ${"%.1f".format(target / 1000.0)} L" else " L"} · ⭐ ${s.optInt("xpToday", 0)} XP",
            )
            val open = Intent(context, MainActivity::class.java).apply { flags = Intent.FLAG_ACTIVITY_NEW_TASK }
            v.setOnClickPendingIntent(R.id.header, PendingIntent.getActivity(context, 1, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            v.setOnClickPendingIntent(R.id.water, Notifications.actionIntent(context, "water", "water", "add", null, 80_001))

            // Show open items first, then done ones, up to 6 rows.
            val ordered = ArrayList<org.json.JSONObject>()
            for (i in 0 until items.length()) { val o = items.getJSONObject(i); if (!o.optBoolean("done")) ordered.add(o) }
            for (i in 0 until items.length()) { val o = items.getJSONObject(i); if (o.optBoolean("done")) ordered.add(o) }
            for ((idx, rowId) in ROWS.withIndex()) {
                if (idx >= ordered.size) {
                    v.setViewVisibility(rowId, View.GONE)
                    continue
                }
                val o = ordered[idx]
                val isDone = o.optBoolean("done")
                v.setViewVisibility(rowId, View.VISIBLE)
                v.setTextViewText(rowId, "${if (isDone) "✅" else "◻️"} ${o.optString("emoji")} ${o.optString("title")}")
                if (!isDone) {
                    v.setOnClickPendingIntent(
                        rowId,
                        Notifications.actionIntent(context, o.optString("kind", "habit"), o.optString("id"), "done", null, 81_000 + idx),
                    )
                } else {
                    v.setOnClickPendingIntent(rowId, PendingIntent.getActivity(context, 2, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
                }
            }
            if (items.length() == 0) {
                v.setViewVisibility(R.id.row1, View.VISIBLE)
                v.setTextViewText(R.id.row1, "Open FitSaathi to set up habits")
                v.setOnClickPendingIntent(R.id.row1, PendingIntent.getActivity(context, 3, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE))
            }
            return v
        }
    }
}
