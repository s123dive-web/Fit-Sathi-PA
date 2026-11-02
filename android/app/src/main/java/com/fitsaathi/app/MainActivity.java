package com.fitsaathi.app;

import android.os.Bundle;

import com.fitsaathi.app.plugins.FitAlarmsPlugin;
import com.fitsaathi.app.plugins.FitBackupPlugin;
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
        super.onCreate(savedInstanceState);
    }
}
