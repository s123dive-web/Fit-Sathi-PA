# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Readable stack traces from Play Console crash reports.
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Capacitor plugins are discovered and invoked through annotations / reflection.
-keepattributes *Annotation*

# Our own plugins: @ActivityCallback / @PermissionCallback methods are private and invoked by reflection,
# receivers / activities are referenced from the manifest, and the widget provider through RemoteViews.
-keep class com.fitsaathi.app.** { *; }

# @capacitor-community/sqlite ships no consumer ProGuard rules; SQLCipher binds its JNI symbols by class/method name.
-keep class net.zetetic.** { *; }
-keep class com.getcapacitor.community.database.sqlite.** { *; }

# Health Connect client (androidx.health.connect:connect-client 1.1.0) marshals records by class name.
-keep class androidx.health.connect.client.** { *; }
-dontwarn androidx.health.connect.**

# Compile-time-only annotation libraries pulled in transitively (Tink via security-crypto, Room, etc.).
-dontwarn javax.annotation.**
-dontwarn com.google.errorprone.annotations.**
-dontwarn org.checkerframework.**
