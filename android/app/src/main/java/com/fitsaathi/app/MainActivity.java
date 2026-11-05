package com.fitsaathi.app;

import android.content.res.Configuration;
import android.graphics.drawable.ColorDrawable;
import android.os.Bundle;
import android.view.View;

import androidx.core.content.ContextCompat;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.fitsaathi.app.plugins.FitAlarmsPlugin;
import com.fitsaathi.app.plugins.FitBackupPlugin;
import com.fitsaathi.app.plugins.FitBiometricPlugin;
import com.fitsaathi.app.plugins.FitHealthConnectPlugin;
import com.fitsaathi.app.plugins.FitSecurePhotosPlugin;
import com.fitsaathi.app.plugins.FitWidgetPlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(FitAlarmsPlugin.class);
        registerPlugin(FitWidgetPlugin.class);
        registerPlugin(FitHealthConnectPlugin.class);
        registerPlugin(FitSecurePhotosPlugin.class);
        registerPlugin(FitBackupPlugin.class);
        registerPlugin(FitBiometricPlugin.class);
        super.onCreate(savedInstanceState);
        setupEdgeToEdge();
    }

    /**
     * targetSdk 35+ draws edge-to-edge unconditionally (the opt-out attribute is ignored). Keep the WebView out
     * from under the status / navigation bars and the keyboard by turning those insets into padding on the
     * content root, and paint the root in the page background so the bar areas match the web app.
     */
    private void setupEdgeToEdge() {
        final View content = findViewById(android.R.id.content);
        if (content == null) {
            return;
        }
        applyPageColors(content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, windowInsets) -> {
            Insets insets = windowInsets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.ime());
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        ViewCompat.requestApplyInsets(content);
    }

    /** Background + system bar icon colour for the current day / night mode. */
    private void applyPageColors(View content) {
        int background = ContextCompat.getColor(this, R.color.page_background);
        content.setBackgroundColor(background);
        getWindow().setBackgroundDrawable(new ColorDrawable(background));
        int nightMask = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        boolean isNight = nightMask == Configuration.UI_MODE_NIGHT_YES;
        WindowInsetsControllerCompat controller = new WindowInsetsControllerCompat(getWindow(), getWindow().getDecorView());
        // Light page -> dark icons (appearance "light" bars); dark page -> light icons.
        controller.setAppearanceLightStatusBars(!isNight);
        controller.setAppearanceLightNavigationBars(!isNight);
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        // uiMode is in configChanges, so a dark-mode toggle lands here instead of recreating the activity.
        View content = findViewById(android.R.id.content);
        if (content != null) {
            applyPageColors(content);
        }
    }
}
