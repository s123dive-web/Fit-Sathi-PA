# FitSaathi — personal fitness & habit assistant (Android, offline-first)

FitSaathi is a fully offline Android app: habits (Loop-style strength), supplements with exact alarms,
water, weight trend + goal projection, Indian food log with fasting-window checks, weekly summaries,
rule-based insights, encrypted progress photos, a pinned checklist notification and a home-screen widget.

Nothing is hardcoded to a person. The owner's data is loaded through a profile JSON
(`sample/suresh_profile.json`) validated against `src/schema/profile.schema.json`.

Stack: **React 18 + Vite + TypeScript**, **Capacitor 6**, **@capacitor-community/sqlite**,
**Tailwind CSS**, **Recharts**. No backend, no analytics, no cloud calls.

---

## Quick start

```bash
npm install
npm run dev            # web preview at http://localhost:5173 (SQLite runs in-browser via jeep-sqlite)
npm test               # vitest unit tests (logic layer)
npm run build          # tsc + vite build → dist/
npm run cap:sync       # build + copy web assets + sync native plugins into android/
npm run cap:open       # open android/ in Android Studio
npm run android:assemble   # build + gradle assembleDebug → android/app/build/outputs/apk/debug/
```

Requirements for the Android build: Android Studio (or command-line SDK) with **compileSdk 34**,
JDK 17, Gradle 8.2 (wrapper included). `minSdk` is 26 because of Health Connect.

On first launch choose **Import profile JSON** (pick the file, or paste it) or **Fill manually**.

---

## Project layout

```
src/
  types.ts                 domain types
  schema/profile.schema.json   JSON Schema (draft-07) for the profile import/export
  db/database.ts           SQLite connection + schema (web: jeep-sqlite + sql-wasm)
  db/repos.ts              repositories: profile, habits, logs, water, weight, foods, meals, photos, steps, summaries, xp
  logic/                   pure, unit-tested logic
    habitStrength.ts       Loop algorithm (strength, streaks, completion %)
    fasting.ts             fasting window state machine + "outside window" check
    projection.ts          7-day MA, OLS slope, ETA to target, chart series
    insights.ts            Daylio-style rule-based correlations (on-device)
    nutrition.ts           Mifflin-St Jeor BMR / TDEE / targets
    profile.ts             validation (ajv), diff before overwrite, starter habits
    xp.ts, dates.ts, schedule.ts, units.ts
  data/indianFoods.ts      seed food DB (Maharashtrian staples)
  services/                side-effecting orchestration
    actions.ts             done/skip/miss, supplements, water, weight, meals (+XP)
    sync.ts                builds the alarm set, pushes pinned notification + widget, consumes native actions
    weekly.ts              auto weekly summary every closed week
    health.ts              Health Connect steps (read-only)
    backup.ts              full-DB JSON backup/restore through the system file picker
    photos.ts              camera → encrypted private storage
  native/plugins.ts        Capacitor plugin contracts (FitAlarms, FitWidget, FitHealthConnect, FitSecurePhotos, FitBackup)
  native/web.ts            web fallbacks so `npm run dev` works in a browser
  screens/                 Onboarding, Today, Habits, Food, Progress (+Photos), ProfileScreen
  components/              UI primitives, HeatGrid, ProfileForm, ProfileImport
  tests/                   vitest specs
android/app/src/main/java/com/fitsaathi/app/
  MainActivity.java        registers the custom plugins
  alarms/                  AlarmSpec, AlarmScheduler (AlarmManager exact), receivers (fire / action / boot), Notifications, stores
  plugins/                 the five Capacitor plugins (Kotlin)
  widget/HabitWidgetProvider.kt   AppWidget with one-tap ticks
  photos/                  (reserved)
sample/suresh_profile.json  prefilled sample profile
```

---

## Feature map → requirements

| # | Requirement | Where |
|---|-------------|-------|
| 1 | Onboarding: import JSON or fill manually; every field editable later; export; import validates schema and shows diff | `screens/Onboarding.tsx`, `components/ProfileForm.tsx`, `components/ProfileImport.tsx`, `logic/profile.ts` |
| 2 | Today: habit done/skip/miss, supplements with streaks, +250 ml water, weight quick-entry, live fasting timer, Health Connect steps, XP burst | `screens/Today.tsx`, `services/actions.ts` |
| 3 | Habits: unlimited, daily / N×week / weekdays, Loop strength with gentle decay, heat-grid, streak/best/%, pinned notification + widget | `screens/Habits.tsx`, `logic/habitStrength.ts`, `android/.../Notifications.kt`, `widget/` |
| 4 | Food: seeded Indian DB (jowar bhakri, chapati, poha, idli, dal, rice, sabzi, chicken curry, eggs, tea with sugar, coffee…), log by time, auto-flag outside fasting window, daily totals vs target, weekly protein average, custom foods | `screens/Food.tsx`, `data/indianFoods.ts`, `logic/nutrition.ts` |
| 5 | Progress: weight line + 7-day MA + projection line with ETA, weekly summary card (auto every Sunday), rule-based insights, encrypted photos with before/now compare and timeline, future-look v1 text + v2 cloud toggle stub (default OFF) | `screens/Progress.tsx`, `logic/projection.ts`, `logic/insights.ts`, `services/weekly.ts`, `services/photos.ts`, `FitSecurePhotosPlugin.kt` |
| 6 | Exact alarms (AlarmManager `setExactAndAllowWhileIdle` / `setAlarmClock`), `SCHEDULE_EXACT_ALARM` handling, reboot persistence, per-supplement alarms, habit reminders, water reminders in waking hours, fasting open/close, notification action buttons (Done / Skip / Snooze / +250 ml) | `services/sync.ts` (`buildAlarms`), `android/.../alarms/*` |
| 7 | Backup/restore via the system document picker (user can choose Google Drive); no API keys, no OAuth, nothing uploaded by the app | `services/backup.ts`, `FitBackupPlugin.kt` |
| 8 | Settings: theme, units, notification toggles, pinned notification, Health Connect connect, erase data | `screens/ProfileScreen.tsx` |

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
meal 2, photo 15. Level `n` needs `50·n²` XP.

---

## Native plugin contract

All five plugins are declared in `src/native/plugins.ts` and implemented in Kotlin under
`android/app/src/main/java/com/fitsaathi/app/plugins/`.

| Plugin | Methods | Notes |
|--------|---------|-------|
| `FitAlarms` | `canScheduleExactAlarms`, `requestExactAlarmPermission`, `requestNotificationPermission`, `syncAlarms({alarms})`, `updatePinned({enabled,title,date,items})`, `getPendingActions`, `clearPendingActions`, event `action` | Alarm definitions persist in SharedPreferences; `BootReceiver` re-arms them after reboot / app update / time change. Each alarm re-arms itself for the next occurrence when it fires. Notification buttons and widget taps are stored as pending actions and applied by the web layer on resume (or immediately via the `action` event when the app is open). |
| `FitWidget` | `update({date,items,waterMl,waterTargetMl,xpToday})` | Snapshot → SharedPreferences → `AppWidgetManager`. Rows tap to mark done; chip adds +250 ml. |
| `FitHealthConnect` | `isAvailable`, `hasPermission`, `requestPermission`, `readSteps({date})` | Read-only `READ_STEPS`. Graceful statuses: `not_installed`, `update_required`, `unsupported`, permission denied. |
| `FitSecurePhotos` | `save({base64})`, `load({key})`, `remove({key})` | AES-256-GCM with a non-exportable Android Keystore key, files in `filesDir/photos`. `allowBackup=false` so photos are never backed up off-device. |
| `FitBackup` | `saveDocument({filename,mimeType,data})`, `openDocument({mimeTypes})` | `ACTION_CREATE_DOCUMENT` / `ACTION_OPEN_DOCUMENT`. |

Web fallbacks (`src/native/web.ts`): in-page timers + Notification API, WebCrypto AES-GCM in IndexedDB,
download / file input. Health Connect reports `unsupported`.

---

## Profile JSON

See `src/schema/profile.schema.json`. Times are `HH:MM` (24 h), weekdays are ISO (1 = Mon … 7 = Sun).
`fasting.start` is when the fast begins (eating window closes); `fasting.end` is when eating resumes.
Height is `{ value, unit: "cm" | "ft_in" }` (for `ft_in`, `value` is total inches).

Export from Profile → *Export JSON*. Import from Profile → *Import JSON…*: the file is validated and a
field-by-field diff is shown before anything is overwritten.

---

## Testing

`npm test` runs 39 vitest specs covering strength/streak/completion maths, fasting window, projection,
schema validation + diff + starter habits, alarm-set generation, dates, XP, nutrition and insights.

The web build was also driven end-to-end in headless Chromium (onboarding import → Today ticks →
Habits → Food log → Progress → Profile → reload persistence) with no console errors.

The Android project (Kotlin plugins, widget, receivers) must be compiled with the Android SDK in
Android Studio; it is not compiled by `npm run build`.

---

## Privacy

- All data in an on-device SQLite database. No accounts, no analytics, no network calls.
- Backups are written only where the user points the system file picker.
- Progress photos are encrypted at rest and excluded from backups and Android auto-backup.
- The v2 "AI future look" toggle is a stub that only records the preference and is clearly labelled as
  sending a photo to the cloud; no cloud call exists in v1.
