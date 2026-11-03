# FitSaathi — Requirements checklist (acceptance contract)

Status legend: **DONE** implemented and verified in this repo · **PARTIAL** implemented with a stated gap · **MISSING** not implemented · **BLOCKED** cannot be verified in this environment (see DEVIATIONS.md).
Each line names the file(s) that implement it.

## 0. Context

1. DONE — Offline-first; no backend, analytics or cloud calls. `src/**` (no fetch/XHR anywhere), `android/app/src/main/AndroidManifest.xml`
2. DONE — Nothing hardcoded to the owner; all personal data comes from the profile JSON. `src/utils/profile.ts`, `sample/suresh_profile.json`
3. DONE — Stack: React 18 + Vite + TypeScript, Capacitor 6, @capacitor-community/sqlite, Tailwind, Recharts. `package.json`
4. DONE — Only optional network paths are Drive backup (via system picker) and the v2 future-look toggle (stub). `src/services/backup.ts`, `src/screens/Progress.tsx`

## 1. Onboarding & Profile

5. DONE — First launch: "Import profile JSON" or "Fill manually". `src/screens/Onboarding.tsx`
6. DONE — Fields: name, age, height (cm / ft-in), current & target weight, activity level, diet type, fasting window, sleep window, water target, supplements (name, dose, time, alarm), workout slot (start/end/days), appearance goals, photo consent. `src/components/ProfileForm.tsx`, `src/types.ts`
7. DONE — Profile screen edits every field later. `src/screens/ProfileScreen.tsx` (Edit mode)
8. DONE — Export profile JSON from Profile. `src/screens/ProfileScreen.tsx` → `exportProfileJson`
9. DONE — Import validates the schema and shows a diff before overwrite. `src/components/ProfileImport.tsx`, `src/utils/profile.ts` (`validateProfile`, `diffProfiles`)
10. DONE — JSON Schema at `/src/schema/profile.schema.json`.
11. DONE — `/sample/suresh_profile.json` prefilled with the supplied data.

## 2. Today screen

12. DONE — Habit checklist with one-tap done / skip / miss; skip does not break streaks. `src/screens/Today.tsx`, `src/utils/habitStrength.ts`
13. DONE — Supplements block: per-supplement tick, time and streak. `src/screens/Today.tsx`
14. DONE — Water counter (+250 ml taps). `src/screens/Today.tsx` (`WaterCard`), `src/services/actions.ts`
15. DONE — Weight quick-entry. `src/screens/Today.tsx` (`WeightCard`)
16. DONE — Fasting-window live timer with countdown to the eating-window close. `src/screens/Today.tsx` (`FastingCard`), `src/utils/fasting.ts`
17. DONE — Steps from Health Connect, read-only, permission-gated, graceful fallback. `src/services/health.ts`, `android/.../plugins/FitHealthConnectPlugin.kt`
18. DONE — XP for each completion with instant animation. `src/services/actions.ts`, `src/components/ui.tsx` (`Overlays`), `src/utils/xp.ts`

## 3. Habits screen

19. DONE — Unlimited habits; schedules: daily, X per week, specific weekdays. `src/screens/Habits.tsx` (`HabitEditor`)
20. DONE — Loop strength score with gentle decay (no hard reset). `src/utils/habitStrength.ts` (`computeStrength`)
21. DONE — Calendar heat-grid, streak, best streak, completion %. `src/components/HeatGrid.tsx`, `src/utils/habitStrength.ts`
22. DONE — Pinned persistent notification with tick buttons. `android/.../alarms/Notifications.kt` (`refreshPinned`), `src/services/sync.ts`
23. DONE — Home-screen widget (Android App Widget). `android/.../widget/HabitWidgetProvider.kt`, `res/layout/widget_habits.xml`, `res/xml/habit_widget_info.xml`

## 4. Food screen

24. DONE — Indian food DB seeded with jowar bhakri, chapati, poha, idli, dal, rice, sabzi/curries, chicken curry, eggs, tea with sugar, coffee (+ more). `src/data/indianFoods.ts`
25. DONE — Per-item kcal, protein, carbs, fat, standard serving. `src/data/indianFoods.ts`
26. DONE — Log meals by time; auto-flag entries outside the fasting window. `src/screens/Food.tsx`, `src/services/actions.ts` (`logMeal`)
27. DONE — Daily totals vs target; weekly protein average. `src/screens/Food.tsx`, `src/utils/nutrition.ts`

## 5. Progress screen

28. DONE — Weight trend line with 7-day moving average. `src/utils/projection.ts`, `src/screens/Progress.tsx`
29. DONE — Goal projection line with estimated date to reach target. `src/utils/projection.ts` (`projectToTarget`, `buildTrendSeries`)
30. DONE — Weekly summary card (auto every Sunday): habits %, avg water, workouts, weight delta. `src/services/weekly.ts`, `src/screens/Progress.tsx`
31. DONE — Correlation insights, rule-based, on-device. `src/utils/insights.ts`
32. DONE — Progress photos via camera, encrypted in app-private storage, before/now compare, timeline, never leave device. `src/services/photos.ts`, `android/.../plugins/FitSecurePhotosPlugin.kt`, `src/screens/Progress.tsx` (`Photos`)
33. DONE — Future-look v1: text projection + photo timeline. `src/screens/Progress.tsx` (`FutureLookCard`)
34. DONE — Future-look v2: opt-in cloud toggle, default OFF, labelled "sends photo to cloud", stub only. `src/screens/Progress.tsx`, `privacy.futureLookCloud` in schema

## 6. Notifications & alarms

35. DONE — AlarmManager exact alarms (`setExactAndAllowWhileIdle` / `setAlarmClock`). `android/.../alarms/AlarmScheduler.kt`
36. DONE — SCHEDULE_EXACT_ALARM permission handling (check + settings deep link + inexact fallback). `AlarmScheduler.kt`, `FitAlarmsPlugin.kt`, `src/screens/ProfileScreen.tsx`
37. DONE — Per-supplement alarms from profile (06:40, 13:55, 17:45 in the sample). `src/services/sync.ts` (`buildAlarms`), verified in `src/tests/sync.test.ts`
38. DONE — Workout alarm 05:30 daily (from `workout.start` / `workout.days` / `workout.alarm`). `src/services/sync.ts`
39. DONE — Fasting-window reminder 30 min before eating window closes (18:30 for 19:00). `src/services/sync.ts`, `src/utils/fasting.ts` (`fastingWarningTime`)
40. DONE — Full-screen intent + sound + vibration for alarms. `android/.../alarms/AlarmActivity.kt`, `Notifications.kt`, manifest `USE_FULL_SCREEN_INTENT`
41. DONE — Snooze 10 min. `AlarmScheduler.snooze`, `ActionReceiver`, `AlarmActivity`
42. DONE — "Done" action ticks directly from the notification / full-screen alarm. `ActionReceiver.kt` → pending actions → `src/services/sync.ts` (`consumePendingActions`, `applyNativeAction`)
43. DONE — Persist alarms across reboot (BOOT_COMPLETED) and app updates (MY_PACKAGE_REPLACED). `android/.../alarms/Receivers.kt` (`BootReceiver`), `AlarmStore.kt`
44. DONE — Motivational notifications 2× per day (08:00, 20:00 from profile). `src/services/sync.ts` (`buildMotivationAlarms`)
45. DONE — Template engine with {name}, {streak}, {daysToTarget}, {kgLeft}, {bestStreak}, {weekCompletion}. `src/utils/quotes.ts` (`renderQuote`, `quoteContext`)
46. DONE — 60+ templates in `/src/data/quotes.json` mixing generic and "future-you" lines (64 shipped).
47. DONE — Rotation without repeats inside 14 days. `src/utils/quotes.ts` (`pickQuotes`), `notification_log` table, `src/tests/quotes.test.ts`
48. DONE — All notification channels user-toggleable in Settings (supplements, workout, habit reminders, evening check-in, water, fasting, motivational, pinned). `src/screens/ProfileScreen.tsx`

## 7. Backup & privacy

49. DONE — Full local encrypted backup (AES-256-GCM, PBKDF2 passphrase) to a file. `src/services/backup.ts`, `src/utils/crypto.ts`
50. DONE — Optional Google Drive via Storage Access Framework; user picks the folder; no Drive API scopes. `android/.../plugins/FitBackupPlugin.kt`
51. DONE — Restore with schema-version check and migration hook. `src/services/backup.ts` (`parseBackup`, `unpackBackup`), `src/db/migrations/index.ts` (`BACKUP_MIGRATIONS`)
52. DONE — No analytics / crash-reporting SDKs. `package.json`, `android/app/build.gradle`
53. DONE — INTERNET declared but no call is made anywhere; cloud paths gated behind toggles (and stubbed). manifest, `src/**`
54. DONE — Photos encrypted at rest and excluded from auto-backup (`allowBackup="false"`, `fullBackupContent`, `dataExtractionRules`). manifest, `res/xml/backup_rules.xml`, `res/xml/data_extraction_rules.xml`

## 8. UI / UX

55. PARTIAL — Material 3 look: Tailwind-based Material-style surfaces, rounded cards, FAB-like buttons, dynamic light/dark; not the official Material 3 component library (see DEVIATIONS.md #3). `src/index.css`, `tailwind.config.js`
56. DONE — Dark + light themes, system default. `src/App.tsx` (`applyTheme`), `src/screens/ProfileScreen.tsx`
57. DONE — Bottom nav: Today, Habits, Food, Progress, Profile. `src/components/TabBar.tsx`
58. DONE — Big tap targets (≥48dp): buttons, inputs, ticks and nav items use `min-h-[48px]` / 48px ticks. `src/index.css`, `src/components/ui.tsx`
59. DONE — One-tap completion. `src/screens/Today.tsx`
60. DONE — Haptic feedback on ticks / water / milestones. `src/utils/haptics.ts` (@capacitor/haptics)
61. DONE — Confetti / XP micro-animation on streak milestones 7, 21, 30, 60, 90. `src/utils/milestones.ts`, `src/services/actions.ts`, `src/components/ui.tsx`
62. DONE — Home-screen widget with today's habits + supplements as tappable ticks. `android/.../widget/HabitWidgetProvider.kt`
63. DONE — All UI strings in one i18n file; English default; structure ready for Hindi/Marathi. `src/i18n/en.json`, `src/i18n/index.ts`

## 9. Data model

64. DONE — Tables: profile, habits, habit_logs(date, status done|skip|miss), supplements, supplement_logs, water_logs, weight_logs, food_items, meal_logs, photos(path, taken_at, note), alarms, notification_log, settings, points_ledger, weekly_summaries (+ steps). `src/db/migrations/001_initial.sql`
65. DONE — Every table has created_at / updated_at. `src/db/migrations/001_initial.sql`
66. DONE — Migrations via versioned SQL files in `/src/db/migrations`. `src/db/migrations/index.ts`, `src/db/database.ts` (`migrate`)

## 10. Engineering standards

67. DONE — TypeScript strict, ESLint + Prettier, no `any` (`@typescript-eslint/no-explicit-any: error`). `tsconfig.app.json`, `eslint.config.js`, `.prettierrc`
68. DONE — State: Zustand. `src/store/appStore.ts`
69. DONE — Charts: Recharts. `src/screens/Progress.tsx`
70. DONE — Dates: date-fns, local-day storage, display in device zone (Asia/Kolkata for the owner). `src/utils/dates.ts`
71. DONE — Vitest unit tests: habit strength, streak/skip, fasting window, goal projection, JSON import validation, quote rotation (+ alarms, backup, nutrition, insights). `src/tests/*.test.ts`
72. DONE — React Testing Library component tests for Today and Onboarding. `src/tests/components/*.test.tsx`
73. BLOCKED — Capacitor Android project checked in; Gradle `assembleDebug` / `assembleRelease` not run here (no Android SDK, Google download host blocked). `android/`, DEVIATIONS.md #1
74. DONE — Folder layout `/src/{screens,components,db,store,services,data,schema,utils,i18n}`, `/android`, `/sample`, `/docs`.

## 11. App lock (added 2026-11-03 on request)

81. DONE — 4-digit PIN lock: set / confirm, change (after verifying current), disable (after verifying). PIN stored only as PBKDF2-SHA256 hash + salt. `src/utils/pin.ts`, `src/services/security.ts`, `src/components/PinDialog.tsx`, `src/screens/ProfileScreen.tsx` (Security card)
82. DONE — Fingerprint / face unlock via androidx BiometricPrompt, opt-in after PIN verification; PIN always remains the fallback. `android/.../plugins/FitBiometricPlugin.kt`, `src/screens/LockScreen.tsx`
83. DONE — Lock on launch and after a configurable background timeout (immediately / 1 / 5 / 15 min); content hidden behind the lock screen. `src/store/lockStore.ts`, `src/App.tsx`
84. DONE — Brute-force cooldowns: 5 wrong → 30 s, 8 → 5 min, 10+ → 30 min; attempts persisted. `src/services/security.ts` (`attemptPin`)
85. DONE — "Forgot PIN" path: erase all data and start again (no account to recover from), with confirmation. `src/screens/LockScreen.tsx`
86. DONE — Tests: PIN hashing/verification, cooldown schedule, lock store timing, LockScreen wrong/right PIN and cooldown. `src/tests/pin.test.ts`, `src/tests/components/LockScreen.test.tsx`

## Execution plan artefacts

75. DONE — `/docs/REQUIREMENTS.md` (this file).
76. BLOCKED — `/docs/ALARM_TEST.md`: procedure written; results require a device/emulator. DEVIATIONS.md #1
77. DONE — `/docs/SELF_CHECK_REPORT.md` with per-step results (device steps marked NOT RUN).
78. DONE — `/docs/DEVIATIONS.md`.
79. BLOCKED — Debug and release APKs in `/android/app/build/outputs/apk/`. DEVIATIONS.md #1
80. DONE — README with build steps and JSON import instructions. `README.md`
