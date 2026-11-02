import type { Habit, ISODate, PendingNativeAction, Profile } from '../types';
import { alarmRepo, habitRepo, notificationLogRepo, pointsRepo, profileRepo, settingsRepo, supplementRepo, waterRepo, weightRepo } from '../db/repos';
import { addDays, dayNamesToWeekdays, hhmmToMinutes, parseHHMM, todayISO, weekStart } from '../utils/dates';
import { fastingWarningTime } from '../utils/fasting';
import { habitActiveOn } from '../utils/schedule';
import { completionStats, computeStreaks } from '../utils/habitStrength';
import { projectToTarget } from '../utils/projection';
import { pickQuotes, renderQuote, type QuoteContext } from '../utils/quotes';
import { FitAlarms, FitWidget, type AlarmSpec, type PinnedItem, type WidgetItem } from '../native/plugins';
import { notifyChange, toast } from '../store/appStore';
import { t } from '../i18n';

const MOTIVATION_HORIZON_DAYS = 14;

/** Build the recurring alarm set from profile + habits. Pure, unit-tested. */
export function buildAlarms(profile: Profile, habits: Habit[]): AlarmSpec[] {
  const alarms: AlarmSpec[] = [];
  const n = profile.notifications;

  if (n.supplementAlarms !== false) {
    for (const s of profile.supplements) {
      if (!s.alarm) continue;
      const { h, m } = parseHHMM(s.time);
      alarms.push({
        id: `sup:${s.id}`,
        kind: 'supplement',
        refId: s.id,
        title: s.name,
        body: s.dose ? `Time for ${s.name} — ${s.dose}` : `Time for ${s.name}`,
        hour: h,
        minute: m,
        days: [],
        actions: ['done', 'snooze'],
        alarmClock: true,
        fullScreen: true,
      });
    }
  }

  if (profile.workout.enabled && profile.workout.alarm && n.workoutAlarm !== false) {
    const { h, m } = parseHHMM(profile.workout.start);
    const days = dayNamesToWeekdays(profile.workout.days);
    const workoutHabit = habits.find((x) => x.kind === 'workout' && !x.archived);
    alarms.push({
      id: 'workout',
      kind: 'workout',
      refId: workoutHabit?.id ?? 'workout',
      title: 'Workout time 🏋️',
      body: `${profile.workout.start}–${profile.workout.end}${profile.workout.location ? ` · ${profile.workout.location}` : ''}`,
      hour: h,
      minute: m,
      days: days.length === 7 ? [] : days,
      actions: workoutHabit ? ['done', 'skip', 'snooze'] : ['snooze'],
      alarmClock: true,
      fullScreen: true,
    });
  }

  if (n.habitReminders !== false) {
    for (const hb of habits) {
      if (hb.archived || !hb.reminderEnabled || !hb.reminderTime) continue;
      const { h, m } = parseHHMM(hb.reminderTime);
      const days = hb.schedule.type === 'weekdays' ? (hb.schedule.weekdays ?? []) : [];
      alarms.push({
        id: `hab:${hb.id}`,
        kind: 'habit',
        refId: hb.id,
        title: `${hb.emoji} ${hb.name}`,
        body: 'Tap Done, or Skip for a planned rest.',
        hour: h,
        minute: m,
        days,
        actions: ['done', 'skip', 'snooze'],
      });
    }
    if (n.eveningCheckIn) {
      const { h, m } = parseHHMM(n.eveningCheckIn);
      alarms.push({
        id: 'habits:evening',
        kind: 'habit',
        refId: '*',
        title: 'Evening check-in',
        body: "Tick off today's habits before the day ends.",
        hour: h,
        minute: m,
        days: [],
        actions: [],
      });
    }
  }

  if (n.waterReminders !== false) {
    const interval = n.waterReminderIntervalMin ?? 90;
    const wake = hhmmToMinutes(profile.sleep.wake);
    const bed = hhmmToMinutes(profile.sleep.bedtime);
    const awakeLen = (bed - wake + 1440) % 1440 || 1440;
    for (let tMin = interval; tMin < awakeLen - 30; tMin += interval) {
      const mins = (wake + tMin) % 1440;
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

  if (profile.fasting.enabled && n.fastingWindow !== false) {
    const warnMin = n.fastingWarningMinutesBefore ?? 30;
    if (warnMin > 0) {
      const w = parseHHMM(fastingWarningTime(profile.fasting, warnMin));
      alarms.push({
        id: 'fast:warn',
        kind: 'fasting',
        refId: 'fasting',
        title: `Eating window closes in ${warnMin} min`,
        body: `Finish dinner before ${profile.fasting.eatEnd}.`,
        hour: w.h,
        minute: w.m,
        days: [],
        actions: [],
      });
    }
    const close = parseHHMM(profile.fasting.eatEnd);
    const open = parseHHMM(profile.fasting.eatStart);
    alarms.push({
      id: 'fast:close',
      kind: 'fasting',
      refId: 'fasting',
      title: 'Eating window closed',
      body: `Fasting until ${profile.fasting.eatStart}. You've got this.`,
      hour: close.h,
      minute: close.m,
      days: [],
      actions: [],
    });
    alarms.push({
      id: 'fast:open',
      kind: 'fasting',
      refId: 'fasting',
      title: 'Fast complete 🎉',
      body: 'Your eating window is open.',
      hour: open.h,
      minute: open.m,
      days: [],
      actions: [],
    });
  }
  return alarms;
}

/** Context for quote placeholders, computed from current data. */
export async function quoteContext(profile: Profile, habits: Habit[], today: ISODate): Promise<QuoteContext> {
  const logs = await habitRepo.allLogs();
  let streak = 0;
  let bestStreak = 0;
  let scheduled = 0;
  let done = 0;
  const ws = weekStart(today);
  for (const h of habits) {
    if (h.archived) continue;
    const hl = logs.filter((l) => l.habitId === h.id);
    const s = computeStreaks(h.schedule, hl, h.createdAt, today);
    if (s.unit === 'days') {
      streak = Math.max(streak, s.current);
      bestStreak = Math.max(bestStreak, s.best);
    }
    const st = completionStats(h.schedule, hl, h.createdAt > ws ? h.createdAt : ws, today);
    scheduled += Math.max(0, st.scheduled - st.skipped);
    done += st.done;
  }
  const proj = projectToTarget(await weightRepo.all(), profile.user.targetWeightKg, today);
  const latest = proj.latestMa7 ?? profile.user.currentWeightKg;
  return {
    name: profile.user.name.split(' ')[0],
    streak,
    bestStreak,
    daysToTarget: proj.status === 'on_track' ? proj.daysToTarget : null,
    kgLeft: Math.max(0, Math.round(Math.abs(latest - profile.user.targetWeightKg) * 10) / 10),
    weekCompletion: scheduled === 0 ? 0 : Math.round((done / scheduled) * 100),
    targetKg: profile.user.targetWeightKg,
    eatStart: profile.fasting.eatStart,
  };
}

/**
 * Plan motivational notifications for the next 14 days as one-shot alarms.
 * Quotes rotate without repeating inside a 14-day window (notification_log keeps the history).
 * Already-planned future slots keep their quote; only the text is re-rendered with fresh numbers.
 */
export async function buildMotivationAlarms(profile: Profile, habits: Habit[], today: ISODate): Promise<AlarmSpec[]> {
  const m = profile.notifications.motivational;
  if (!m.enabled || m.times.length === 0) {
    await notificationLogRepo.deleteFrom(`${today}T00:00`, 'motivation');
    return [];
  }
  const ctx = await quoteContext(profile, habits, today);
  const windowStart = `${addDays(today, -MOTIVATION_HORIZON_DAYS)}T00:00`;
  const history = await notificationLogRepo.since(windowStart);
  const planned = new Map(history.filter((h) => h.kind === 'motivation').map((h) => [h.scheduledFor, h.refId]));
  const recentlyUsed = history.filter((h) => h.kind === 'motivation').map((h) => h.refId);

  const slots: { date: ISODate; time: string; key: string }[] = [];
  for (let i = 0; i < MOTIVATION_HORIZON_DAYS; i += 1) {
    const d = addDays(today, i);
    for (const time of m.times) slots.push({ date: d, time, key: `${d}T${time}` });
  }
  const missing = slots.filter((s) => !planned.has(s.key));
  const fresh = pickQuotes(missing.length, recentlyUsed, `${today}:${profile.user.name}`);
  const alarms: AlarmSpec[] = [];
  let fi = 0;
  for (const s of slots) {
    let quoteId = planned.get(s.key);
    if (!quoteId) {
      quoteId = fresh[fi++]?.id;
      if (!quoteId) continue;
      await notificationLogRepo.add({ kind: 'motivation', refId: quoteId, scheduledFor: s.key, body: '' });
    }
    const q = (await import('../utils/quotes')).QUOTES.find((x) => x.id === quoteId);
    if (!q) continue;
    const { h, min } = { h: parseHHMM(s.time).h, min: parseHHMM(s.time).m };
    alarms.push({
      id: `motiv:${s.key}`,
      kind: 'motivation',
      refId: quoteId,
      title: 'FitSaathi',
      body: renderQuote(q.text, ctx),
      hour: h,
      minute: min,
      days: [],
      date: s.date,
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
      pointsRepo.totalOn(today),
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

    const alarms = [...buildAlarms(profile, habits), ...(await buildMotivationAlarms(profile, habits, today))];
    await alarmRepo.replaceAll(alarms);

    await Promise.allSettled([
      FitAlarms.syncAlarms({ alarms }),
      FitAlarms.updatePinned({
        enabled: profile.notifications.pinnedChecklist !== false,
        title: `FitSaathi · ${pinned.filter((p) => p.done).length}/${pinned.length} done`,
        date: today,
        items: pinned,
      }),
      FitWidget.update({ date: today, items: widgetItems, waterMl: water, waterTargetMl: profile.water.targetMl, xpToday }),
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
  notifyChange();
  void syncNative();
  return actions.length;
}

export async function applyNativeAction(a: PendingNativeAction, notify = true): Promise<void> {
  const { setHabitStatus, toggleSupplement, addWater } = await import('./actions');
  const date: ISODate = a.date || todayISO();
  if (a.kind === 'habit' && (a.action === 'done' || a.action === 'skip')) {
    if (a.refId === 'workout') {
      const workout = (await habitRepo.all()).find((h) => h.kind === 'workout');
      if (workout) await setHabitStatus(workout.id, date, a.action, { silent: true });
    } else {
      await setHabitStatus(a.refId, date, a.action, { silent: true });
    }
  } else if (a.kind === 'supplement' && a.action === 'done') {
    await toggleSupplement(a.refId, date, true);
  } else if (a.kind === 'water' && a.action === 'add') {
    const profile = await profileRepo.get();
    await addWater(date, 250, profile?.water.targetMl ?? 2500);
  }
  if (notify) {
    toast(t('errors.updatedFromNotification'), 'success');
    notifyChange();
  }
}
