# Google Play submission checklist

What the build already satisfies, and the exact answers to give in Play Console. Keep this in sync with
`PRIVACY.md` and `AndroidManifest.xml`.

## Build

- Target: `targetSdk 36` / `compileSdk 36` (Play requires API 36 for new apps since 31 Aug 2026).
- Artefacts per push to `main` (Actions → Build APK → release `build-N`): `app-debug.apk`, `app-release.apk`,
  `app-release.aab`. **Upload the `.aab` to Play.**
- Release signing: add repository secrets `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`,
  `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` (generate once:
  `keytool -genkeypair -v -keystore upload.jks -alias upload -keyalg RSA -keysize 2048 -validity 10000`,
  then `base64 -w0 upload.jks`). Keep the `.jks` and passwords safe forever. Accept **Play App Signing** on first
  upload; this key becomes the upload key.
- Without the secrets the release artefacts are signed with the committed debug key (installable, not uploadable).
- `versionCode` = workflow run number, `versionName` = `1.0.<run>`; every push is a valid upgrade.
- R8 minify + resource shrinking on; native libraries 16 KB page-size aligned (SQLCipher 4.17, verified).
- Database encrypted at rest (SQLCipher, random device key in encrypted preferences); photos encrypted with an
  Android Keystore key; `allowBackup=false`; FLAG_SECURE while the app lock is on and on the photo screens.

## Manifest permissions (declare nothing else)

| Permission | Play Console declaration |
|------------|--------------------------|
| `POST_NOTIFICATIONS` | none |
| `SCHEDULE_EXACT_ALARM` | **Exact alarm** declaration: "User-configured medication (supplement) and workout alarm clocks that must fire at the exact minute the user chose. The user grants the permission in system settings; without it the app falls back to inexact reminders." |
| `USE_BIOMETRIC` | none |
| `RECEIVE_BOOT_COMPLETED` | none |
| `VIBRATE`, `WAKE_LOCK` | none |
| `CAMERA` | none (only used on user action; `android.hardware.camera` not required) |
| `android.permission.health.READ_STEPS` | **Health apps** declaration → Fitness & wellness; data type: Steps; read only; in-app rationale screen present; privacy policy covers Health Connect |

No `INTERNET`, no storage, no full-screen-intent permission.

## Play Console answers

- **App access**: all functionality is available without special access (no login).
- **Ads**: no.
- **Content rating (IARC)**: Health & Fitness utility; no user-generated content, no violence, no gambling.
- **Target audience**: 18 and over. Not designed for children.
- **News / COVID / Government / Financial**: no.
- **Data safety**:
  - Does your app collect or share any of the required user data types? **No.**
    (All data is stored on the device only. Health Connect data is processed on device. User-initiated exports
    to a user-chosen location are not collection by the app.)
  - Is all user data encrypted in transit? Not applicable (no transmission).
  - Do you provide a way for users to request deletion? Yes: Profile → Erase all data; uninstall.
- **Privacy policy URL**: `https://github.com/s123dive-web/Fit-Sathi-PA/blob/main/PRIVACY.md` (also linked in-app under
  Profile → About and in the Health Connect rationale screen).
- **Health apps declaration**: Health Connect → read Steps → core feature "Fitness and wellness tracking" → data is
  not shared, not sold, not used for ads, stored only on device.
- **App category**: Health & Fitness. Tags: habit tracker, fasting, water, supplements.

## Store listing text (draft)

Short description (≤ 80 chars): `Offline habit, fasting, water & supplement tracker. Your data never leaves your phone.`

Full description: FitSaathi is a private fitness companion that runs entirely on your phone. Track daily habits
with streaks, set exact alarm clocks for supplements and workouts, log water and weight, record Indian meals against
your eating window, review a weekly summary and keep encrypted progress photos. No account, no cloud, no ads. Reads
your daily steps from Health Connect if you allow it. Not a medical device; consult a doctor before changing your
diet or exercise.

Assets needed: 512×512 icon, 1024×500 feature graphic, at least 2 phone screenshots (Today, Habits, alarm screen,
Progress), optional 7"/10" tablet screenshots (the app supports foldables).

## Testing requirement (personal developer accounts)

New personal accounts must run a **closed test with ≥ 12 testers opted in for 14 continuous days** before
production access is granted. Plan: Internal testing (you) → Closed testing (12+ testers) → apply for production.

## Before each upload

1. `npm run check` green; CI green; download `app-release.aab` from the release.
2. Install `app-release.apk` on a phone and run `docs/ALARM_TEST.md` rows 1–13 once per major change.
3. Bump nothing by hand: versionCode comes from the run number.
