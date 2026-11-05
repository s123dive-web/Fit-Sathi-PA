# FitSaathi Privacy Policy

_Last updated: 5 November 2026_

FitSaathi is a personal fitness and habit tracker for Android. It is built to work entirely on your phone.

## The short version

- **Nothing leaves your device.** FitSaathi has no servers, no user accounts, no analytics, no advertising and no
  crash reporting. The app does not request the Internet permission.
- **All data stays on your phone**, in the app's private, encrypted storage.
- **You own your data.** You can export it, back it up where you choose, and erase it at any time.

## What the app stores on your device

Only what you enter or allow:

- Your profile: name, age, height, weight and target weight, activity level, diet type, goals, eating window,
  sleep and workout times, supplements and habits.
- Your daily logs: habit ticks, supplements taken, water, weight entries, meals and nutrition totals, XP points,
  weekly summaries and the motivational messages already scheduled.
- **Progress photos** (optional): taken with the camera only after you turn on photo consent. They are encrypted
  with a key held in the Android Keystore, stored in the app's private folder, excluded from backups and device
  transfers, and never uploaded.
- **Daily step count** (optional): read from **Health Connect** only after you grant the "Read steps" permission.
  FitSaathi reads steps and nothing else, never writes to Health Connect, stores the count in its local database to
  show it on the Today and Progress screens, and does not share it with anyone or use it for advertising. Revoke the
  permission at any time in Health Connect; the app then stops reading.
- App-lock settings (optional): a salted hash of your PIN and the biometric preference. The PIN itself is never
  stored. Biometric unlock uses the Android system prompt; FitSaathi never sees your fingerprint or face data.

The local database is encrypted at rest (SQLCipher) with a random key generated on your device and kept in
Android's encrypted preferences.

## What the app does not do

- No account, sign-in, email or phone number.
- No analytics, tracking, advertising IDs, cookies or third-party SDKs that collect data.
- No network connections of any kind. The only time data moves off the phone is when **you** export it.

## Backups and exports you start

- **Encrypted backup**: creates a file encrypted with a passphrase you choose (AES-256-GCM). You pick where it goes
  with the Android file picker, for example your Downloads folder or your own Google Drive. Google Drive, if you
  choose it, is governed by Google's privacy policy. Photos and app-lock settings are never included.
- **Profile export**: a plain JSON file with your profile settings, written where you choose.

## Permissions and why

| Permission | Used for |
|------------|----------|
| Notifications | Reminders, the pinned daily checklist and alarm banners |
| Alarms & reminders (exact alarms) | Supplement and workout alarm clocks that must ring at the chosen minute |
| Camera | Taking progress photos (only when you choose to) |
| Biometrics | Unlocking the app with fingerprint or face, as a PIN alternative |
| Health Connect: Read steps | Showing your daily step count |
| Run at startup | Re-scheduling your alarms after the phone restarts |
| Vibrate / keep awake | Alarm vibration and delivering alarms reliably |

## Deleting your data

Profile → Erase all data removes everything the app stored, including photos and scheduled alarms. Uninstalling
the app does the same. There is nothing to delete on any server, because none exists.

## Children

FitSaathi is intended for adults (18+). It is not directed at children and does not knowingly store data about them.

## Not medical advice

FitSaathi is a wellness and habit tool, not a medical device. Calorie, protein and fasting targets are general
estimates. Consult a doctor before changing your diet, fasting schedule or exercise, especially with a medical
condition.

## Changes and contact

If this policy changes, the updated version is published at this address with a new date. Questions:
open an issue at https://github.com/s123dive-web/Fit-Sathi-PA/issues.
