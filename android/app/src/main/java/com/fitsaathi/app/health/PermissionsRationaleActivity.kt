package com.fitsaathi.app.health

import android.app.Activity
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Typeface
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.util.TypedValue
import android.widget.LinearLayout
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import com.fitsaathi.app.R

/**
 * Privacy rationale for Health Connect. Opened by Health Connect / system settings through
 * `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` (Android 13 and below) and the
 * `ViewPermissionUsageActivity` alias (Android 14+). Plain views, no web layer.
 */
class PermissionsRationaleActivity : Activity() {

    companion object {
        private const val TAG = "FitHealthConnect"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val density = resources.displayMetrics.density
        val pad = (20 * density).toInt()
        val textPrimary = ContextCompat.getColor(this, R.color.page_text_primary)
        val textSecondary = ContextCompat.getColor(this, R.color.page_text_secondary)

        val column = LinearLayout(this)
        column.orientation = LinearLayout.VERTICAL
        column.setPadding(pad, pad, pad, pad)

        val heading = TextView(this)
        heading.text = getString(R.string.health_connect_rationale_title)
        heading.textSize = 22f
        heading.setTypeface(null, Typeface.BOLD)
        heading.setTextColor(textPrimary)
        column.addView(heading)

        val body = TextView(this)
        body.text = getString(R.string.health_connect_rationale)
        body.textSize = 16f
        body.setTextColor(textSecondary)
        body.setPadding(0, pad / 2, 0, 0)
        body.setLineSpacing(0f, 1.25f)
        column.addView(body)

        val link = TextView(this)
        link.text = getString(R.string.privacy_policy_link)
        link.textSize = 16f
        link.setTypeface(null, Typeface.BOLD)
        link.setTextColor(ContextCompat.getColor(this, R.color.page_link))
        link.setPadding(0, pad, 0, pad)
        link.minHeight = (48 * density).toInt() // touch target
        link.isClickable = true
        link.isFocusable = true
        val outValue = TypedValue()
        theme.resolveAttribute(android.R.attr.selectableItemBackground, outValue, true)
        link.setBackgroundResource(outValue.resourceId)
        link.setOnClickListener { openPrivacyPolicy() }
        column.addView(link)

        val scroll = ScrollView(this)
        scroll.isFillViewport = true
        scroll.setBackgroundColor(ContextCompat.getColor(this, R.color.page_background)) // theme window background is null
        scroll.addView(column)
        setContentView(scroll)
        setupEdgeToEdge(scroll)
    }

    /** Edge-to-edge (targetSdk 35+): pad the root by the system bars / keyboard; the root background covers the bar areas. */
    private fun setupEdgeToEdge(root: ScrollView) {
        ViewCompat.setOnApplyWindowInsetsListener(root) { view, windowInsets ->
            val insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime())
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
            WindowInsetsCompat.CONSUMED
        }
        ViewCompat.requestApplyInsets(root)
        val nightMask = resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK
        val isNight = nightMask == Configuration.UI_MODE_NIGHT_YES
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.setAppearanceLightStatusBars(!isNight)
        controller.setAppearanceLightNavigationBars(!isNight)
    }

    private fun openPrivacyPolicy() {
        val url = getString(R.string.privacy_policy_url)
        val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url))
        try {
            startActivity(intent)
        } catch (e: Exception) {
            // No browser installed (or the device policy blocks it): show the address so it can be typed elsewhere.
            Log.w(TAG, "No activity can open the privacy policy URL", e)
            Toast.makeText(this, url, Toast.LENGTH_LONG).show()
        }
    }
}
