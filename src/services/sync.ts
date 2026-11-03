import type { Habit, ISODate, PendingNativeAction, Profile } from '../types';
import { alarmRepo, habitRepo, notificationLogRepo, pointsRepo, profileRepo, settingsRepo, supplementRepo, waterRepo, weightRepo } from '../db/repos';
import { addDays, dayNamesToWeekdays, hhmmToMinutes, parseHHMM, todayISO, weekStart } from '../utils/dates';
import { fastingWarningTime } from '../utils/fasting';
import { habitActiveOn } from '../utils/schedule';
import { completionStats, computeStreaks } from '../utils/habitStrength';
import { goalDirection, projectToTarget } from '../utils/projection';
import { pickQuotes, QUOTES, renderQuote, type QuoteContext } from '../utils/quotes';
import { FitAlarms, FitWidget, type AlarmSpec, type PinnedItem, type WidgetItem } from '../native/plugins';
import { notifyChange, toast } from '../store/appStore';
import { t } from '../i18n';

const MOTIVATION_HORIZON_DAYS = 14;
/** The 64-template pool guarantees no repeat inside 14 days for at most 2 slots/day (64 ≥ 2 × 2 × 14). */
export const MAX_MOTIVATION_TIMES_PER_DAY = 2;

/**
 * Build the recurring alarm set from profile + habits. Pure, unit-tested.
 * Only supplements and the workout are exact (user-visible alarm clocks); everything else is an inexact reminder
 * so the app respects Android's exact-alarm policy and the battery.
 */
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
        body: s.dose ? t('alarms.supplementBodyDose', { name: s.name, dose: s.dose }) : t('alarms.supplementBody', { name: s.name }),
        hour: h,
        minute: m,
        days: [],
        actions: ['done', 'snooze'],
        alarmClock: true,
        fullScreen: true,
        exact: true,
      });
    }
  }

  if (profile.workout.enabled && profile.workout.alarm && n.workoutAlarm !== false) {
    const { h, m } = parseHHMM(profile.workout.start);
    const days = dayNamesToWeekdays(profile.workout.days);
    const workoutHabit = habits.find((x) => x.kind === 'workout' && !x.archived);
    const bodyParams = { start: profile.workout.start, end: profile.workout.end, location: profile.workout.location ?? '' };
    alarms.push({
      id: 'workout',
      kind: 'workout',
      refId: workoutHabit?.id ?? 'workout',
      title: t('alarms.workoutTitle'),
      body: profile.workout.location ? t('alarms.workoutBodyAt', bodyParams) : t('alarms.workoutBody', bodyParams),
      hour: h,
      minute: m,
      days: days.length === 7 ? [] : days,
      actions: workoutHabit ? ['done', 'skip', 'snooze'] : ['snooze'],
      alarmClock: true,
      fullScreen: true,
      exact: true,
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
        body: t('alarms.habitBody'),
        hour: h,
        minute: m,
        days,
        actions: ['done', 'skip', 'snooze'],
        exact: false,
      });
    }
    if (n.eveningCheckIn) {
      const { h, m } = parseHHMM(n.eveningCheckIn);
      alarms.push({
        id: 'habits:evening',
        kind: 'habit',
        refId: '*',
        title: t('alarms.eveningTitle'),
        body: t('alarms.eveningBody'),
        hour: h,
        minute: m,
        days: [],
        actions: [],
        exact: false,
      });
    }
  }

  if (n.waterReminders !== false) {
    const interval = Math.max(30, n.waterReminderIntervalMin ?? 90);
    const wake = hhmmToMinutes(profile.sleep.wake);
    const bed = hhmmToMinutes(profile.sleep.bedtime);
    const awakeLen = (bed - wake + 1440) % 1440 || 1440;
    for (let tMin = interval; tMin < awakeLen - 30; tMin += interval) {
      const mins = (wake + tMin) % 1440;
      alarms.push({
        id: `water:${mins}`,
        kind: 'water',
        refId: 'water',
        title: t('alarms.waterTitle'),
        body: t('alarms.waterBody'),
        hour: Math.floor(mins / 60),
        minute: mins % 60,
        days: [],
        actions: ['add'],
        exact: false,
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
        title: t('alarms.fastWarnTitle', { min: warnMin }),
        body: t('alarms.fastWarnBody', { time: profile.fasting.eatEnd }),
        hour: w.h,
        minute: w.m,
        days: [],
        actions: [],
        exact: false,
      });
    }
    const close = parseHHMM(profile.fasting.eatEnd);
    const open = parseHHMM(profile.fasting.eatStart);
    alarms.push({
      id: 'fast:close',
      kind: 'fasting',
      refId: 'fasting',
      title: t('alarms.fastCloseTitle'),
      body: t('alarms.fastCloseBody', { time: profile.fasting.eatStart }),
      hour: close.h,
      minute: close.m,
      days: [],
      actions: [],
      exact: false,
    });
    alarms.push({
      id: 'fast:open',
      kind: 'fasting',
      refId: 'fasting',
      title: t('alarms.fastOpenTitle'),
      body: t('alarms.fastOpenBody'),
      hour: open.h,
      minute: open.m,
      days: [],
      actions: [],
      exact: false,
    });
  }
  return alarms;
}

/** Context for quote placeholders, computed from current data. */
export async function quoteContext(profile: Profile, habits: Habit[], today: ISODate): Promise<QuoteContext> {
  const logs = await habitRepo.logsBetween(addDays(today, -400), today);
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
    const st = completionStats(h.schedule, hl, h.createdAt > ws ? h.createdAt : ws, today, today);
    scheduled += Math.max(0, st.scheduled - st.skipped);
    done += st.done;
  }
  const goal = goalDirection(profile.user.currentWeightKg, profile.user.targetWeightKg);
  const proj = projectToTarget(await weightRepo.all(), profile.user.targetWeightKg, today, { goal });
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
    eatEnd: profile.fasting.eatEnd,
    wake: profile.sleep.wake,
  };
}

/**
 * Plan motivational notifications for the next 14 days as one-shot alarms.
 * Quotes rotate without repeating inside a 14-day window (notification_log keeps the history).
 * Already-planned future slots keep their quote; only the text is re-rendered with fresh numbers.
 */
export async function buildMotivationAlarms(profile: Profile, habits: Habit[], today: ISODate): Promise<AlarmSpec[]> {
  const m = profile.notifications.motivational;
  const times = [...new Set(m.times)].sort().slice(0, MAX_MOTIVATION_TIMES_PER_DAY);
  if (!m.enabled || times.length === 0) {
    await notificationLogRepo.deleteFrom(`${today}T00:00`, 'motivation');
    return [];
  }
  const ctx = await quoteContext(profile, habits, today);
  const windowStart = `${addDays(today, -MOTIVATION_HORIZON_DAYS)}T00:00`;
  const history = (await notificationLogRepo.since(windowStart)).filter((h) => h.kind === 'motivation');
  const planned = new Map(history.map((h) => [h.scheduledFor, h.refId]));
  // Only slots that have already fired count as "recently used"; future planned slots are reused as-is.
  const recentlyUsed = history.filter((h) => h.scheduledFor < `${today}T00:00`).map((h) => h.refId);

  const slots: { date: ISODate; time: string; key: string }[] = [];
  for (let i = 0; i < MOTIVATION_HORIZON_DAYS; i += 1) {
    const d = addDays(today, i);
    for (const time of times) slots.push({ date: d, time, key: `${d}T${time}` });
  }
  const missing = slots.filter((s) => !planned.has(s.key));
  const avoid = [...recentlyUsed, ...slots.filter((s) => planned.has(s.key)).map((s) => planned.get(s.key) as string)];
  const fresh = pickQuotes(missing.length, avoid, `${today}:${profile.user.name}`);
  const alarms: AlarmSpec[] = [];
  let fi = 0;
  for (const s of slots) {
    let quoteId = planned.get(s.key);
    if (!quoteId) {
      quoteId = fresh[fi++]?.id;
      if (!quoteId) continue;
      await notificationLogRepo.add({ kind: 'motivation', refId: quoteId, scheduledFor: s.key, body: '' });
    }
    const q = QUOTES.find((x) => x.id === quoteId);
    if (!q) continue;
    const { h, m: min } = parseHHMM(s.time);
    alarms.push({
      id: `motiv:${s.key}`,
      kind: 'motivation',
      refId: quoteId,
      title: t('alarms.motivationTitle'),
      body: renderQuote(q.text, ctx),
      hour: h,
      minute: min,
      days: [],
      date: s.date,
      actions: [],
      exact: false,
    });
  }
  return alarms;
}

let syncing = false;
let queued = false;
let debounceTimer: ReturnType<typeof setTimeout> | null = null;
const SYNC_DEBOUNCE_MS = 400;

/**
 * Debounced native sync for user actions: several quick taps collapse into one rebuild of the alarm set,
 * one pinned-notification update and one widget update.
 */
export function scheduleSync(delayMs = SYNC_DEBOUNCE_MS): void {
  if (debounceTimer) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debounceTimer = null;
    void syncNative();
  }, delayMs);
}

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
        title: t('alarms.pinnedTitle', { done: pinned.filter((p) => p.done).length, total: pinned.length }),
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

/* ---------------- native actions (notification buttons, widget taps) ---------------- */

/**
 * Timestamps of actions already applied in this process. The native layer delivers an action either live (event)
 * or stored (drained on resume), never both, but we also dedupe here so a retry or an older native build cannot
 * apply the same tap twice.
 */
const appliedTs: number[] = [];
const APPLIED_LIMIT = 500;

function markApplied(ts: number): boolean {
  if (!Number.isFinite(ts)) return true;
  if (appliedTs.includes(ts)) return false;
  appliedTs.push(ts);
  if (appliedTs.length > APPLIED_LIMIT) appliedTs.splice(0, appliedTs.length - APPLIED_LIMIT);
  return true;
}

/** @internal test hook */
export function _resetAppliedActions(): void {
  appliedTs.length = 0;
}

async function drainNativeActions(): Promise<PendingNativeAction[]> {
  // Prefer the atomic drain; fall back to get + clear for an older native build.
  if (typeof FitAlarms.drainPendingActions === 'function') {
    try {
      return (await FitAlarms.drainPendingActions()).actions ?? [];
    } catch {
      /* fall through */
    }
  }
  const { actions } = await FitAlarms.getPendingActions();
  if (actions.length) await FitAlarms.clearPendingActions();
  return actions;
}

/** Apply actions taken from notifications / widget while the web layer was not running. */
export async function consumePendingActions(): Promise<number> {
  const actions = await drainNativeActions();
  if (!actions.length) return 0;
  let applied = 0;
  for (const a of actions) {
    try {
      if (await applyNativeAction(a, false)) applied += 1;
    } catch (e) {
      console.warn('pending action failed', a, e);
      toast(t('errors.actionFailed'), 'error');
    }
  }
  if (applied) {
    notifyChange();
    scheduleSync(0);
  }
  return applied;
}

/** Returns false when the action was a duplicate and skipped. */
export async function applyNativeAction(a: PendingNativeAction, notify = true): Promise<boolean> {
  if (!markApplied(a.ts)) return false;
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
  } else {
    return false;
  }
  if (notify) {
    toast(t('errors.updatedFromNotification'), 'success');
    notifyChange();
  }
  return true;
}
