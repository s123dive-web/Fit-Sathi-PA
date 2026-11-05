# FitSaathi — personal fitness & habit assistant (Android, offline-first)

FitSaathi is a fully offline Android app: habits (Loop-style strength), supplements with exact alarm clocks,
water, weight trend + goal projection, Indian food log with fasting-window checks, weekly summaries,
rule-based insights, encrypted progress photos, a pinned checklist notification and a home-screen widget.

Nothing is hardcoded to a person. The owner's data is loaded through a profile JSON
(`sample/suresh_profile.json`) validated against `src/schema/profile.schema.json`.

Stack: **React 18 + Vite + TypeScript**, **Capacitor 6**, **@capacitor-community/sqlite**,
**Tailwind CSS**, **Recharts**, **Zustand**, **date-fns**. No backend, no analytics, no cloud calls.

Acceptance documents live in `docs/`: `REQUIREMENTS.md` (checklist), `SELF_CHECK_REPORT.md`,
`ALARM_TEST.md`, `DEVIATIONS.md`.

---

## Quick start

```bash
npm install
npm run dev            # web preview at http://localhost:5173 (SQLite runs in-browser via jeep-sqlite)
npm run check          # lint + typecheck + tests
npm test               # vitest unit + component tests
npm run build          # tsc + vite build → dist/
npm run cap:sync       # build + copy web assets + sync native plugins into android/
npm run cap:open       # open android/ in Android Studio
npm run android:assemble   # build + gradle assembleDebug → android/app/build/outputs/apk/debug/
```

Requirements for a local Android build: Android Studio (or command-line SDK) with **compileSdk 36**,
JDK 21, Gradle 8.14.3 (wrapper included), Capacitor 8. `minSdk` is 26 because of Health Connect. You do not need a
local SDK: GitHub Actions builds the debug APK, release APK and release AAB on every push to `main`.

On first launch choose **Import profile JSON** (pick the file, or paste it) or **Fill manually**.

### Importing a profile JSON

1. Copy `sample/suresh_profile.json` to the phone (or any file following `src/schema/profile.schema.json`).
2. Onboarding → _Import profile JSON_ → _Choose file…_ (or paste the JSON and _Validate pasted_).
3. The file is validated against the schema; errors are listed per field. A field-by-field preview/diff is shown.
4. Keep _Create habits from this profile_ ticked to seed the `habits` list, then confirm.
5. Later imports from Profile → _Import JSON…_ show a diff against the current profile before overwriting.
   Supplement ids are derived from name + time, so logs survive re-imports of the same file.
6. Profile → _Export JSON_ writes the current profile (including current habits) through the system file picker.

---

## Project layout

```
src/
  types.ts                 domain types
  schema/profile.schema.json   JSON Schema (draft-07) for the profile import/export
  db/database.ts           SQLite connection + migration runner (web: jeep-sqlite + sql-wasm)
  db/migrations/           versioned SQL files (001_initial.sql) + backup migration hooks
  db/repos.ts              repositories: profile, supplements, habits, logs, water, weight, foods, meals, photos, alarms, notification_log, steps, summaries, points
  utils/                   pure, unit-tested logic
    habitStrength.ts       Loop algorithm (strength, streaks, completion %)
    fasting.ts             eating-window state machine, "outside window" check, pre-close warning time
    projection.ts          7-day MA, OLS slope, ETA to target, chart series
    insights.ts            Daylio-style rule-based correlations (on-device)
    nutrition.ts           Mifflin-St Jeor BMR / TDEE / targets
    profile.ts             validation (ajv), diff before overwrite, profile habits ↔ app habits
    quotes.ts              motivational template engine + 14-day no-repeat rotation
    crypto.ts              AES-256-GCM + PBKDF2 for backups
    xp.ts, dates.ts (date-fns), schedule.ts, units.ts, haptics.ts, milestones.ts
  data/indianFoods.ts      seed food DB (Maharashtrian staples); data/quotes.json (64 templates)
  services/                side-effecting orchestration
    actions.ts             done/skip/miss, supplements, water, weight, meals (+XP, haptics, milestone confetti)
    sync.ts                builds the alarm set (supplements, workout, habits, water, fasting, motivation), pushes pinned notification + widget, consumes native actions
    weekly.ts              auto weekly summary every closed week
    health.ts              Health Connect steps (read-only)
    backup.ts              encrypted backup/restore with schema-version check through the system file picker
    photos.ts              camera → encrypted private storage
  native/plugins.ts        Capacitor plugin contracts (FitAlarms, FitWidget, FitHealthConnect, FitSecurePhotos, FitBackup)
  native/web.ts            web fallbacks so `npm run dev` works in a browser
  store/appStore.ts        Zustand store (revision counter, XP burst, confetti, toast)
  i18n/en.json, index.ts   all UI strings; add hi.json / mr.json and register in LOCALES
  screens/                 Onboarding, Today, Habits, Food, Progress (+Photos), ProfileScreen (settings)
  components/              UI primitives, HeatGrid, ProfileForm, ProfileImport
  tests/                   vitest unit specs + React Testing Library component tests
docs/                      REQUIREMENTS.md, SELF_CHECK_REPORT.md, ALARM_TEST.md, DEVIATIONS.md
android/app/src/main/java/com/fitsaathi/app/
  MainActivity.java        registers the custom plugins
  alarms/                  AlarmSpec, AlarmScheduler (AlarmManager exact), receivers (fire / action / boot), Notifications, AlarmActivity (full-screen), stores
  plugins/                 the five Capacitor plugins (Kotlin)
  widget/HabitWidgetProvider.kt   AppWidget with one-tap ticks
  photos/                  (reserved)
sample/suresh_profile.json  prefilled sample profile
```

---

## Feature map → requirements

| #   | Requirement                                                                                                                                                                                                                                                                                                                                                                                                               | Where                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Onboarding: import JSON or fill manually; every field editable later; export; import validates schema and shows diff                                                                                                                                                                                                                                                                                                      | `screens/Onboarding.tsx`, `components/ProfileForm.tsx`, `components/ProfileImport.tsx`, `logic/profile.ts`                                 |
| 2   | Today: habit done/skip/miss, supplements with streaks, +250 ml water, weight quick-entry, live fasting timer, Health Connect steps, XP burst                                                                                                                                                                                                                                                                              | `screens/Today.tsx`, `services/actions.ts`                                                                                                 |
| 3   | Habits: unlimited, daily / N×week / weekdays, Loop strength with gentle decay, heat-grid, streak/best/%, pinned notification + widget                                                                                                                                                                                                                                                                                     | `screens/Habits.tsx`, `logic/habitStrength.ts`, `android/.../Notifications.kt`, `widget/`                                                  |
| 4   | Food: seeded Indian DB (jowar bhakri, chapati, poha, idli, dal, rice, sabzi, chicken curry, eggs, tea with sugar, coffee…), log by time, auto-flag outside fasting window, daily totals vs target, weekly protein average, custom foods                                                                                                                                                                                   | `screens/Food.tsx`, `data/indianFoods.ts`, `logic/nutrition.ts`                                                                            |
| 5   | Progress: weight line + 7-day MA + projection line with ETA, weekly summary card (auto every Sunday), rule-based insights, encrypted photos with before/now compare and timeline, future-look v1 text + v2 cloud toggle stub (default OFF)                                                                                                                                                                                | `screens/Progress.tsx`, `logic/projection.ts`, `logic/insights.ts`, `services/weekly.ts`, `services/photos.ts`, `FitSecurePhotosPlugin.kt` |
| 6   | Exact alarms (AlarmManager `setExactAndAllowWhileIdle` / `setAlarmClock`), `SCHEDULE_EXACT_ALARM` handling, reboot + update persistence, per-supplement alarms, daily workout alarm, fasting warning 30 min before close, full-screen intent + sound + vibration, snooze 10 min, Done from the notification, 2×/day motivational messages from 64 templates rotating without repeats in 14 days, every channel toggleable | `services/sync.ts` (`buildAlarms`, `buildMotivationAlarms`), `utils/quotes.ts`, `android/.../alarms/*`                                     |
| 7   | Encrypted backup (AES-256-GCM, passphrase) via the system document picker (user can choose Google Drive); restore with schema-version check; no API keys, no OAuth, nothing uploaded by the app                                                                                                                                                                                                                           | `services/backup.ts`, `utils/crypto.ts`, `FitBackupPlugin.kt`                                                                              |
| 8   | Settings: theme, units, every notification channel, pinned notification, Drive toggle, Health Connect, erase data                                                                                                                                                                                                                                                                                                         | `screens/ProfileScreen.tsx`                                                                                                                |
| 8b  | App lock: 4-digit PIN (salted PBKDF2 hash), fingerprint/face unlock via BiometricPrompt, auto-lock timeout, cooldowns after wrong attempts, forgot-PIN reset                                                                                                                                                                                                                                                              | `screens/LockScreen.tsx`, `services/security.ts`, `utils/pin.ts`, `FitBiometricPlugin.kt`                                                  |
| 9   | Data model with created_at/updated_at on every table, versioned SQL migrations                                                                                                                                                                                                                                                                                                                                            | `db/migrations/001_initial.sql`, `db/database.ts`                                                                                          |
| 10  | TS strict, ESLint + Prettier, no `any`, Zustand, Recharts, date-fns, Vitest + RTL, folder layout                                                                                                                                                                                                                                                                                                                          | `eslint.config.js`, `.prettierrc`, `store/appStore.ts`, `tests/`                                                                           |

---

## Algorithms

**Habit strength (Loop).** `score = score·m + (done ? 1−m : 0)` per scheduled day with
`m = 0.5^(√f / 13)`, `f` = expected completions per day. Misses decay the score gently, skips
(planned rest) leave it unchanged, N×/week habits decay only at week end for missing completions.
Streaks: skip never breaks a streak; weekly habits count consecutive weeks hitting the target.

**Projection.** Daily weights → 7-day trailing average; OLS slope over the last 28 days (needs ≥5 days
of spread); ETA = days until the MA meets the target at that slope. States: on_track, moving_away, flat,
reached, insufficient_data.

**Insights.** Weekly summaries are split by rules (≥6 workouts, water target met, ≥80 % habits) and the
average weekly weight change of each side is compared; shown only with ≥2 weeks per side.

**Nutrition targets.** Explicit `nutritionTargets` in the profile win; otherwise Mifflin-St Jeor ×
activity factor, −500 kcal when losing / +300 when gaining, protein 1.6 g/kg of target weight.

**XP.** Habit 10 (configurable per habit), supplement 5, water tap 1 (+10 at target), weight 5,
meal 2, photo 15, +20 at streak milestones (7/21/30/60/90, with confetti). Level `n` starts at `50·(n−1)²` XP
(level 1 = 0, level 2 = 50, level 3 = 200 …). Reaching the water target auto-ticks a `water`-kind habit.

**Motivational messages.** `src/data/quotes.json` holds 64 templates (generic + "future-you"). On every app
open / action, the next 14 days × configured times (max 2/day — the pool guarantees no repeat inside 14 days for
2 slots/day) are planned as one-shot _inexact_ alarms; `notification_log` remembers which template each slot got.
Placeholders: `{name}`, `{streak}`, `{daysToTarget}`, `{kgLeft}`, `{bestStreak}`, `{weekCompletion}`,
`{targetKg}`, `{eatStart}`, `{eatEnd}`, `{wake}`.

**Exact vs inexact.** Only supplement alarms and the workout alarm are exact (`setAlarmClock`); habit reminders,
water breaks, fasting-window notices and motivational messages use `setWindow` with a 10-minute window, which is
what Android's exact-alarm policy and the battery expect from reminders.

---

## Native plugin contract

All five plugins are declared in `src/native/plugins.ts` and implemented in Kotlin under
`android/app/src/main/java/com/fitsaathi/app/plugins/`.

| Plugin             | Methods                                                                                                                                                                                                                  | Notes                                                                                                                                                                                                                                                                                                                                                         |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FitAlarms`        | `canScheduleExactAlarms`, `requestExactAlarmPermission`, `requestNotificationPermission`, `syncAlarms({alarms})`, `updatePinned({enabled,title,date,items})`, `getPendingActions`, `clearPendingActions`, event `action` | Alarm definitions persist in SharedPreferences; `BootReceiver` re-arms them after reboot / app update / time change. Each alarm re-arms itself for the next occurrence when it fires. Notification buttons and widget taps are stored as pending actions and applied by the web layer on resume (or immediately via the `action` event when the app is open). |
| `FitWidget`        | `update({date,items,waterMl,waterTargetMl,xpToday})`                                                                                                                                                                     | Snapshot → SharedPreferences → `AppWidgetManager`. Rows tap to mark done; chip adds +250 ml.                                                                                                                                                                                                                                                                  |
| `FitHealthConnect` | `isAvailable`, `hasPermission`, `requestPermission`, `readSteps({date})`                                                                                                                                                 | Read-only `READ_STEPS`. Graceful statuses: `not_installed`, `update_required`, `unsupported`, permission denied.                                                                                                                                                                                                                                              |
| `FitSecurePhotos`  | `save({base64})`, `load({key})`, `remove({key})`                                                                                                                                                                         | AES-256-GCM with a non-exportable Android Keystore key, files in `filesDir/photos`. `allowBackup=false` so photos are never backed up off-device.                                                                                                                                                                                                             |
| `FitBackup`        | `saveDocument({filename,mimeType,data})`, `openDocument({mimeTypes})`                                                                                                                                                    | `ACTION_CREATE_DOCUMENT` / `ACTION_OPEN_DOCUMENT`.                                                                                                                                                                                                                                                                                                            |
| `FitBiometric`     | `isAvailable`, `authenticate({title,subtitle,negativeButton})`                                                                                                                                                           | androidx `BiometricPrompt` (strong or weak biometrics); the in-app PIN is the fallback. Web reports `unavailable`.                                                                                                                                                                                                                                            |

Web fallbacks (`src/native/web.ts`): in-page timers + Notification API, WebCrypto AES-GCM in IndexedDB,
download / file input. Health Connect reports `unsupported`.

---

## Profile JSON

See `src/schema/profile.schema.json` and `sample/suresh_profile.json`. Times are `HH:MM` (24 h), workout /
habit days are `mon`…`sun`. `fasting.eatStart` / `fasting.eatEnd` describe the eating window (fasting is the
rest of the day). `user.heightCm` is always centimetres; the ft/in display is a preference. Supplements may omit
`id` (derived from name + time). `habits[]` seeds the Habits screen; `typicalMeals` powers the "Your usual"
chips in the food picker; `notifications` and `privacy` hold the channel toggles and consents.

Export from Profile → _Export JSON_. Import from Profile → _Import JSON…_: the file is validated and a
field-by-field diff is shown before anything is overwritten.

---

## Testing

`npm run check` runs ESLint, `tsc -b` and 130 Vitest specs: strength/streak/completion maths (incl. in-progress
weeks, explicit misses, prorated weekly targets), fasting window (incl. wrap past midnight), projection (stale data,
overshoot, ETA anchoring), schema validation + diff + habit seeding, alarm-set generation and exact/inexact flags,
quote rotation and degrade, encrypted backup (header authentication, KDF clamps, row validation, lock-state
stripping), PIN cooldown (fail-closed, clock-change resistant), dates, units, XP, nutrition, insights, plus React
Testing Library component tests for Today, Habits, Food, Onboarding and the lock screen.

The web build was also driven end-to-end in headless Chromium (onboarding import → Today ticks →
Habits → Food log → Progress → Profile → reload persistence) with no console errors.

The Android project (Kotlin plugins, widget, receivers, full-screen alarm) is built by GitHub Actions:
`.github/workflows/build.yml` runs the web build, `cap sync`, and `./gradlew assembleDebug` on every push to
`main` (or manually via _Run workflow_), uploads `app-debug.apk` as an artifact and attaches it to a `build-N`
release under **Releases**. No local SDK is needed. Device checks are scripted in `docs/ALARM_TEST.md`.

---

## App lock

Profile → **Security** → _App lock (4-digit PIN)_. Set and confirm the PIN; the app then asks for it on every
launch and after the chosen auto-lock timeout. Turn on _Fingerprint / face unlock_ (after confirming the PIN)
to unlock with the phone's biometrics; the PIN keypad is always available as fallback. The lock fails closed: if
the stored hash is ever missing while the lock is on, only _Forgot PIN?_ (erase) gets back in. Wrong PINs trigger
cooldowns (30 s after 5, 5 min after 8, 30 min after 10). There is no account, so _Forgot PIN?_ can only erase
the device data and start again (a backup can be restored afterwards).

## Publishing to Google Play

`docs/PLAY_CHECKLIST.md` has the full list: target API 36, release signing from repository secrets, the exact
permission declarations, Data safety answers, the privacy policy (`PRIVACY.md`), store-listing text and the closed
testing requirement for new developer accounts.

## Privacy

- All data in an on-device SQLite database encrypted at rest (SQLCipher). No accounts, no analytics, no network
  calls, and no Internet permission. Full policy: `PRIVACY.md`.
- Backups are AES-256-GCM encrypted with your passphrase (PBKDF2-SHA256, 600k iterations, header authenticated)
  and written only where you point the system file picker. The app-lock state (PIN hash, salt, attempt counters)
  is never exported and never restored.
- Progress photos are encrypted at rest and excluded from backups and Android auto-backup.
- The v2 "AI future look" toggle is a stub that only records the preference and is clearly labelled as
  sending a photo to the cloud; no cloud call exists in v1.
