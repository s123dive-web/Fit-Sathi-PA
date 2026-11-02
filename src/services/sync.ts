import type { Habit, ISODate, PendingNativeAction, Profile, Settings } from '../types';
import { habitRepo, profileRepo, settingsRepo, supplementRepo, waterRepo, xpRepo } from '../db/repos';
import { hhmmToMinutes, parseHHMM, todayISO } from '../logic/dates';
import { habitActiveOn } from '../logic/schedule';
import { FitAlarms, FitWidget, type AlarmSpec, type PinnedItem, type WidgetItem } from '../native/plugins';
import { notifyChange, toast } from '../store/appStore';

/** Build the complete alarm set from profile + habits. Pure, unit-tested. */
export function buildAlarms(profile: Profile, habits: Habit[]): AlarmSpec[] {
  const alarms: AlarmSpec[] = [];
  const prefs = profile.preferences ?? {};

  for (const s of profile.supplements) {
    if (!s.alarm) continue;
    const { h, m } = parseHHMM(s.time);
    alarms.push({
      id: `sup:${s.id}`,
      kind: 'supplement',
      refId: s.id,
      title: `${s.name}`,
      body: s.dose ? `Time for ${s.name} — ${s.dose}` : `Time for ${s.name}`,
      hour: h,
      minute: m,
      days: [],
      actions: ['done', 'snooze'],
      alarmClock: true,
    });
  }

  for (const hb of habits) {
    if (hb.archived || !hb.reminderEnabled || !hb.reminderTime) continue;
    const { h, m } = parseHHMM(hb.reminderTime);
    const days = hb.schedule.type === 'weekdays' ? (hb.schedule.weekdays ?? []) : [];
    alarms.push({
      id: `hab:${hb.id}`,
      kind: 'habit',
      refId: hb.id,
      title: `${hb.emoji} ${hb.name}`,
      body: 'Tap to mark done, or skip for a planned rest.',
      hour: h,
      minute: m,
      days,
      actions: ['done', 'skip', 'snooze'],
    });
  }

  // Evening catch-up reminder for anything still open.
  if (prefs.habitReminderTime) {
    const { h, m } = parseHHMM(prefs.habitReminderTime);
    alarms.push({
      id: 'habits:evening',
      kind: 'habit',
      refId: '*',
      title: 'Evening check-in',
      body: 'Tick off today\'s habits before the day ends.',
      hour: h,
      minute: m,
      days: [],
      actions: [],
    });
  }

  if (prefs.waterReminders !== false) {
    const interval = prefs.waterReminderIntervalMin ?? 90;
    const wake = hhmmToMinutes(profile.sleep.end);
    const sleep = hhmmToMinutes(profile.sleep.start);
    const awakeLen = (sleep - wake + 1440) % 1440 || 1440;
    for (let t = interval; t < awakeLen - 30; t += interval) {
      const mins = (wake + t) % 1440;
      alarms.push({
        id: `water:${mins}`,
        kind: 'water',
        refId: 'water',
        title: 'Water break 💧',
        body: 'Have a glass of water (+250 ml).',
        hour: Math.floor(mins / 60),
        minute: mins % 60,
        days: [],
        actions: ['add'],
      });
    }
  }

  if (profile.fasting.enabled && prefs.fastingNotifications !== false) {
    const s = parseHHMM(profile.fasting.start);
    const e = parseHHMM(profile.fasting.end);
    alarms.push({
      id: 'fast:start',
      kind: 'fasting',
      refId: 'fasting',
      title: 'Eating window closes',
      body: `Fasting starts now until ${profile.fasting.end}.`,
      hour: s.h,
      minute: s.m,
      days: [],
      actions: [],
    });
    alarms.push({
      id: 'fast:end',
      kind: 'fasting',
      refId: 'fasting',
      title: 'Fast complete 🎉',
      body: 'Your eating window is open.',
      hour: e.h,
      minute: e.m,
      days: [],
      actions: [],
    });
  }
  return alarms;
}

let syncing = false;
let queued = false;

/** Push alarms, pinned notification and widget state to the native layer. Safe to call often. */
export async function syncNative(): Promise<void> {
  if (syncing) {
    queued = true;
    return;
  }
  syncing = true;
  try {
    const [profile, settings, habits] = await Promise.all([profileRepo.get(), settingsRepo.get(), habitRepo.all()]);
    if (!profile || !settings.onboarded) return;
    const today = todayISO();
    const [logs, supLogs, water, xpToday] = await Promise.all([
      habitRepo.logsBetween(today, today),
      supplementRepo.logsOn(today),
      waterRepo.totalOn(today),
      xpRepo.totalOn(today),
    ]);
    const doneHabits = new Set(logs.filter((l) => l.status === 'done' || l.status === 'skip').map((l) => l.habitId));
    const doneSups = new Set(supLogs.map((l) => l.supplementId));

    const todaysHabits = habits.filter((h) => habitActiveOn(h, today));
    const pinned: PinnedItem[] = [
      ...todaysHabits.filter((h) => h.pinned).map((h) => ({ id: h.id, kind: 'habit' as const, title: `${h.emoji} ${h.name}`, done: doneHabits.has(h.id) })),
      ...profile.supplements.map((s) => ({ id: s.id, kind: 'supplement' as const, title: `💊 ${s.name}`, done: doneSups.has(s.id) })),
    ];
    const widgetItems: WidgetItem[] = [
      ...todaysHabits.map((h) => ({ id: h.id, kind: 'habit' as const, emoji: h.emoji, title: h.name, done: doneHabits.has(h.id) })),
      ...profile.supplements.map((s) => ({ id: s.id, kind: 'supplement' as const, emoji: '💊', title: s.name, done: doneSups.has(s.id) })),
    ];

    await Promise.allSettled([
      FitAlarms.syncAlarms({ alarms: buildAlarms(profile, habits) }),
      FitAlarms.updatePinned({
        enabled: settings.pinnedNotificationEnabled,
        title: `FitSaathi · ${pinned.filter((p) => p.done).length}/${pinned.length} done`,
        date: today,
        items: pinned,
      }),
      FitWidget.update({ date: today, items: widgetItems, waterMl: water, waterTargetMl: profile.waterTargetMl, xpToday }),
    ]);
  } catch (e) {
    console.warn('syncNative failed', e);
  } finally {
    syncing = false;
    if (queued) {
      queued = false;
      void syncNative();
    }
  }
}

/** Apply actions taken from notifications / widget while the web layer was not running. */
export async function consumePendingActions(): Promise<number> {
  const { actions } = await FitAlarms.getPendingActions();
  if (!actions.length) return 0;
  await FitAlarms.clearPendingActions();
  for (const a of actions) await applyNativeAction(a, false);
  if (actions.length) {
    notifyChange();
    void syncNative();
  }
  return actions.length;
}

export async function applyNativeAction(a: PendingNativeAction, notify = true): Promise<void> {
  const { setHabitStatus, toggleSupplement, addWater } = await import('./actions');
  const date: ISODate = a.date || todayISO();
  if (a.kind === 'habit' && (a.action === 'done' || a.action === 'skip')) {
    await setHabitStatus(a.refId, date, a.action, { silent: true });
  } else if (a.kind === 'supplement' && a.action === 'done') {
    await toggleSupplement(a.refId, date, true);
  } else if (a.kind === 'water' && a.action === 'add') {
    const profile = await profileRepo.get();
    await addWater(date, 250, profile?.waterTargetMl ?? 2500);
  }
  if (notify) {
    toast('Updated from notification', 'success');
    notifyChange();
  }
}

export function settingsAllowPinned(settings: Settings): boolean {
  return settings.pinnedNotificationEnabled;
}
