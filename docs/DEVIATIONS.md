# Deviations and open items

Nothing was dropped silently. Each entry states the reason and the proposed alternative / next step.

## 1. Android APKs and on-device checks could not be produced in this environment — BLOCKED

**Affects:** REQUIREMENTS #73, #76, #79; SELF_CHECK steps 3–8; ALARM_TEST.md.
**Reason:** The build container has no Android SDK, and its outbound proxy refuses `dl.google.com`
(HTTP 403 on the command-line tools and the Google Maven repository), so neither `sdkmanager` nor Gradle's
dependency resolution for `com.android.tools.build:gradle` can run. There is no emulator either.
**What was done instead:** the full Capacitor Android project is checked in with the native Kotlin plugins,
receivers, widget and full-screen alarm activity written against the Capacitor 6 Java signatures verified
in `node_modules/@capacitor/android`. Everything that can be exercised without Android (TypeScript, 57 unit +
component tests, lint, production build, a headless-Chromium walkthrough of the import → Today → Food →
Progress → Profile flow) is green.
**Next step:** on a machine with Android Studio: `npm run cap:sync && cd android && ./gradlew assembleDebug`,
then follow `docs/ALARM_TEST.md` and fill in `docs/SELF_CHECK_REPORT.md` steps 3–8. Expect at most minor
compile fixes in the Kotlin (not compiled here).
Health Connect client is pinned to `1.1.0-alpha07` in `android/variables.gradle`; the stable `1.1.0` may require
`compileSdk 35` — bump both together after a resolution check.

**Update (review fixes):** the native layer was revised against the findings in `docs/REVIEW.md` §3 (ordered-broadcast
single delivery of notification actions, Android 14 full-screen-intent grant, exact-alarm permission-state receiver,
`onNewIntent` on the alarm activity, crash-proof stored specs, inexact reminders). **Update (CI):** the Android project now compiles in GitHub Actions
(`.github/workflows/build.yml`, `assembleDebug`, 0 Kotlin warnings in app sources); every push to `main` publishes
`app-debug.apk` as a workflow artifact and as a `build-N` GitHub release. Device checks in `docs/ALARM_TEST.md` still
need a phone or emulator.

## 2. SQLCipher not used; backups are AES-encrypted on export — accepted alternative

**Affects:** REQUIREMENTS #49.
**Reason:** The spec allows "SQLCipher or AES on export". The live SQLite file is in app-private storage
(already sandboxed by Android); the exported backup is the copy that leaves the sandbox, so it is encrypted
with AES-256-GCM using a PBKDF2 (600k iterations, SHA-256) passphrase key; the plaintext header is bound as GCM additional data and the app-lock keys are stripped from every export. Photos are additionally encrypted
at rest with an Android Keystore key.
**Alternative:** `@capacitor-community/sqlite` supports SQLCipher with `androidIsEncryption: true`
in `capacitor.config.ts` if at-rest DB encryption is wanted later; no code changes needed beyond the flag
and a passphrase flow.

## 3. "Material 3" is approximated with Tailwind, not the Material component library — PARTIAL

**Affects:** REQUIREMENTS #55.
**Reason:** The mandated stack is Tailwind; the official Material 3 web components would add a second
styling system. The UI follows Material 3 conventions (tonal surfaces, 16–28 px corner radii, bottom
navigation bar, 48 dp targets, system dark/light) via Tailwind utilities.
**Alternative:** swap tokens in `tailwind.config.js` for Material 3 colour roles, or add `@material/web`
components incrementally.

## 4. Steps are read from Health Connect only — by design

Health Connect requires Android 9+ with the Health Connect app (built-in on Android 14). On devices without
it the Today card explains why steps are hidden and offers no manual entry (not requested).

## 5. Motivational placeholders are rendered at scheduling time

Notification text for the next 14 days is rendered with current values (streak, kg left, …) each time the
app opens or an action is taken, then handed to AlarmManager as one-shot alarms. If the app is not opened
for several days, later slots still fire with slightly stale numbers; the rotation and timing are unaffected.
