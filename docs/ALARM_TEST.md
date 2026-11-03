# Alarm test log

Target: the four exact alarms from `sample/suresh_profile.json` fire at the exact minute, the Done action
ticks the item, and alarms survive a reboot.

| #   | Alarm                       | Expected time | Expected behaviour                                                                                                                          | Result  |
| --- | --------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Sea buckthorn juice         | 06:40 daily   | Full-screen alarm, sound + vibration; Done ticks supplement `sup_sea_buckthorn_juice_0640`                                                  | NOT RUN |
| 2   | Sea buckthorn oil capsule   | 13:55 daily   | Same; Done ticks `sup_sea_buckthorn_oil_capsule_1355`                                                                                       | NOT RUN |
| 3   | Sea buckthorn juice         | 17:45 daily   | Same; Done ticks `sup_sea_buckthorn_juice_1745`                                                                                             | NOT RUN |
| 4   | Workout                     | 05:30 daily   | Full-screen alarm; Done ticks the workout habit                                                                                             | NOT RUN |
| 5   | Fasting warning             | 18:30 daily   | Heads-up notification "Eating window closes in 30 min"                                                                                      | NOT RUN |
| 6   | Motivational                | 08:00 / 20:00 | Notification with rendered template (no `{braces}`)                                                                                         | NOT RUN |
| 7   | Reboot                      | —             | After reboot all alarms re-armed (BootReceiver)                                                                                             | NOT RUN |
| 8   | Snooze                      | —             | Snooze re-fires after 10 min                                                                                                                | NOT RUN |
| 9   | Live action handshake       | —             | With the app in the foreground, tap **+250 ml** on a water notification → Today shows **one** +250 ml (not two)                             | NOT RUN |
| 10  | Stored action               | —             | With the app killed, tap **Done** on a supplement notification → reopen → the tick is applied once, toast "Updated from notification"       | NOT RUN |
| 11  | Full-screen intent (API 34) | —             | Without the full-screen grant the alarm shows as a heads-up banner with Done/Snooze; after granting in Settings it launches `AlarmActivity` | NOT RUN |
| 12  | Second alarm while ringing  | —             | A second alarm while `AlarmActivity` is open rebinds to the new alarm and the first sound stops                                             | NOT RUN |
| 13  | Exact-alarm toggle          | —             | Revoke then re-grant "Alarms & reminders" in Settings → `dumpsys alarm` shows the 4 exact alarms re-armed without opening the app           | NOT RUN |

Status: **NOT RUN** — this build environment has no Android SDK or emulator and cannot download one
(see `DEVIATIONS.md` #1). What _was_ verified without a device:

- `src/tests/sync.test.ts` asserts the alarm set contains exactly 06:40, 13:55, 17:45 (supplements, full-screen,
  alarm-clock) and 05:30 (workout, every day), plus the 18:30 fasting warning.
- Headless-Chromium run of the production web build (import sample → Today) shows the `alarms` table populated
  with those alarms, 28 motivational slots (14 days × 2) and the water reminders.

## Procedure (run on device / emulator, API 26+)

1. `npm run cap:sync && cd android && ./gradlew installDebug`
2. Open the app → Import profile JSON → pick `sample/suresh_profile.json` → confirm.
3. On Android 12+: Profile → "Allow exact alarms" if the banner appears; allow notifications.
4. `adb shell dumpsys alarm | grep com.fitsaathi.app` → expect the four exact alarms (`setAlarmClock`) plus the
   inexact reminders (`setWindow`, 10-minute window).
5. For each of 06:40, 13:55, 17:45, 05:30:
   `adb shell "date $(date +%m%d)HHMM$(date +%Y)"` set to one minute before, or use the emulator's extended controls,
   then wait for the minute. Expect full-screen `AlarmActivity` with sound and vibration.
   Tap **Done** → the tick appears on Today (and in the pinned notification) without opening the app first.
6. Tap **Snooze** on one alarm → it returns after 10 minutes.
7. `adb reboot` → after unlock, `dumpsys alarm` lists the alarms again.
8. Record results in the table above.
