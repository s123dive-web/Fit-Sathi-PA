package com.fitsaathi.app.health

import android.app.Activity
import android.graphics.Typeface
import android.os.Bundle
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import com.fitsaathi.app.R

/**
 * Privacy rationale for Health Connect. Opened by Health Connect / system settings through
 * `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` (Android 13 and below) and the
 * `ViewPermissionUsageActivity` alias (Android 14+). Plain views, no web layer.
 */
class PermissionsRationaleActivity : Activity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val density = resources.displayMetrics.density
        val pad = (20 * density).toInt()

        val column = LinearLayout(this)
        column.orientation = LinearLayout.VERTICAL
        column.setPadding(pad, pad, pad, pad)

        val heading = TextView(this)
        heading.text = getString(R.string.health_connect_rationale_title)
        heading.textSize = 22f
        heading.setTypeface(null, Typeface.BOLD)
        heading.setTextColor(0xFF0F172A.toInt())
        column.addView(heading)

        val body = TextView(this)
        body.text = getString(R.string.health_connect_rationale)
        body.textSize = 16f
        body.setTextColor(0xFF334155.toInt())
        body.setPadding(0, pad / 2, 0, 0)
        body.setLineSpacing(0f, 1.25f)
        column.addView(body)

        val scroll = ScrollView(this)
        scroll.isFillViewport = true
        scroll.setBackgroundColor(0xFFFFFFFF.toInt()) // AppTheme.NoActionBar has a null window background
        scroll.addView(column)
        setContentView(scroll)
    }
}
