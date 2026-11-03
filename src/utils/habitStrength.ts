import type { HabitLog, HabitSchedule, HabitStatus, ISODate } from '../types';
import { addDays, diffDays, eachDay, isoWeekday, todayISO, weekStart } from './dates';
import { isScheduledOn, weeklyFrequency } from './schedule';

/**
 * Loop Habit Tracker-style habit strength.
 *
 * score(t) = score(t-1) * m + (checked ? (1 - m) : 0)
 * where m = 0.5 ^ (sqrt(frequency) / 13), frequency = expected completions per day.
 *
 * - A completion raises the score towards 1.
 * - A missed scheduled day decays the score towards 0 (gently; never a hard reset).
 * - A "skip" (planned rest) leaves the score untouched.
 * - For "N times per week" habits, decay is applied at week end for each missing completion,
 *   so the user is free to pick which days to do it.
 */
export function multiplier(schedule: HabitSchedule): number {
  const freqPerDay = weeklyFrequency(schedule) / 7;
  return Math.pow(0.5, Math.sqrt(freqPerDay) / 13);
}

/**
 * Weekly target for a week of which only `daysInWeek` of the 7 days fall inside the window
 * (habit created mid-week, stats window starting mid-week): target × days / 7, rounded up, min 1.
 */
export function proratedTarget(target: number, daysInWeek: number): number {
  if (daysInWeek <= 0) return 0;
  if (daysInWeek >= 7) return target;
  return Math.max(1, Math.ceil((target * daysInWeek) / 7));
}

export interface StrengthResult {
  score: number; // 0..1
  percent: number; // 0..100
}

export function computeStrength(schedule: HabitSchedule, logs: HabitLog[], createdAt: ISODate, today: ISODate): StrengthResult {
  if (today < createdAt) return { score: 0, percent: 0 };
  const m = multiplier(schedule);
  const byDate = new Map<ISODate, HabitStatus>();
  for (const l of logs) byDate.set(l.date, l.status);

  let score = 0;
  const days = eachDay(createdAt, today);

  if (schedule.type === 'times_per_week') {
    const target = weeklyFrequency(schedule);
    // The first (partial) week only expects its share of the target: a habit created on a
    // Friday must not decay for the Mon–Thu on which it did not exist yet.
    let weekTarget = proratedTarget(target, 8 - isoWeekday(createdAt));
    let weekDone = 0;
    let weekSkips = 0;
    for (const d of days) {
      const st = byDate.get(d);
      if (st === 'done') {
        score = score * m + (1 - m);
        weekDone += 1;
      } else if (st === 'skip') {
        weekSkips += 1;
      }
      const isWeekEnd = isoWeekday(d) === 7;
      const isLastDay = d === today;
      if (isWeekEnd && !isLastDay) {
        // Week closed: decay for each missing completion (skips count as planned rest).
        const missing = Math.max(0, weekTarget - weekDone - weekSkips);
        for (let i = 0; i < missing; i += 1) score *= m;
        weekDone = 0;
        weekSkips = 0;
        weekTarget = target;
      }
    }
    return { score, percent: Math.round(score * 100) };
  }

  for (const d of days) {
    if (!isScheduledOn(schedule, d)) continue;
    const st = byDate.get(d);
    if (st === 'done') {
      score = score * m + (1 - m);
    } else if (st === 'skip') {
      // planned rest, no change
    } else if (st === 'miss' || d < today) {
      // missed: explicit (today included) or implicit (unlogged past day)
      score *= m;
    }
    // today without a log: no change yet
  }
  return { score, percent: Math.round(score * 100) };
}

export interface StreakResult {
  current: number;
  best: number;
  unit: 'days' | 'weeks';
}

/**
 * Streaks. Skips never break a streak (and never extend it).
 * - daily / weekdays: consecutive scheduled days marked done. An unlogged today is pending and
 *   does not break the streak; an explicit "miss" on today does.
 * - times_per_week: consecutive weeks meeting the target (current week counts once met).
 */
export function computeStreaks(schedule: HabitSchedule, logs: HabitLog[], createdAt: ISODate, today: ISODate): StreakResult {
  const byDate = new Map<ISODate, HabitStatus>();
  for (const l of logs) byDate.set(l.date, l.status);

  if (schedule.type === 'times_per_week') {
    const target = weeklyFrequency(schedule);
    const weeks: { start: ISODate; done: number; closed: boolean }[] = [];
    let ws = weekStart(createdAt);
    const thisWeek = weekStart(today);
    while (ws <= thisWeek) {
      let done = 0;
      for (let i = 0; i < 7; i += 1) {
        const d = addDays(ws, i);
        if (byDate.get(d) === 'done') done += 1;
      }
      weeks.push({ start: ws, done, closed: ws < thisWeek });
      ws = addDays(ws, 7);
    }
    let best = 0;
    let run = 0;
    for (const w of weeks) {
      if (w.done >= target) {
        run += 1;
        best = Math.max(best, run);
      } else if (w.closed) {
        run = 0;
      }
    }
    // current: count back from the latest week
    let current = 0;
    for (let i = weeks.length - 1; i >= 0; i -= 1) {
      const w = weeks[i];
      if (w.done >= target) current += 1;
      else if (!w.closed)
        continue; // current week not yet met: look at previous weeks
      else break;
    }
    return { current, best, unit: 'weeks' };
  }

  let best = 0;
  let run = 0;
  for (const d of eachDay(createdAt, today)) {
    if (!isScheduledOn(schedule, d)) continue;
    const st = byDate.get(d);
    if (st === 'done') {
      run += 1;
      best = Math.max(best, run);
    } else if (st === 'skip') {
      // keep run
    } else if (st === 'miss' || d < today) {
      run = 0;
    }
  }
  // current streak: walk backwards from today
  let current = 0;
  let d = today;
  let guard = 0;
  while (d >= createdAt && guard < 5000) {
    guard += 1;
    if (isScheduledOn(schedule, d)) {
      const st = byDate.get(d);
      if (st === 'done') current += 1;
      else if (st === 'skip') {
        // continue
      } else if (st === 'miss') {
        break; // an explicit miss ends the streak, even when it is today's
      } else if (d === today) {
        // today not yet logged; don't break
      } else break;
    }
    d = addDays(d, -1);
  }
  return { current, best, unit: 'days' };
}

export interface CompletionStats {
  scheduled: number;
  done: number;
  skipped: number;
  missed: number;
  percent: number; // done / (scheduled - skipped)
}

/**
 * Completion statistics over [from, to].
 * - Days after `today` are not scheduled yet and never count; an unlogged `today` is pending and
 *   does not count either (a logged today does).
 * - times_per_week: a week that only partly lies inside the window is charged a prorated target;
 *   a week still in progress (ends on or after `today`) is never charged misses.
 */
export function completionStats(schedule: HabitSchedule, logs: HabitLog[], from: ISODate, to: ISODate, today: ISODate = todayISO()): CompletionStats {
  const byDate = new Map<ISODate, HabitStatus>();
  for (const l of logs) byDate.set(l.date, l.status);
  let scheduled = 0;
  let done = 0;
  let skipped = 0;
  let missed = 0;
  const last = to < today ? to : today;
  if (last >= from) {
    if (schedule.type === 'times_per_week') {
      const target = weeklyFrequency(schedule);
      let ws = weekStart(from);
      const lastWs = weekStart(last);
      while (ws <= lastWs) {
        const we = addDays(ws, 6);
        const first = ws < from ? from : ws;
        const wTarget = proratedTarget(target, diffDays(first, we) + 1);
        let wDone = 0;
        let wSkip = 0;
        for (let i = 0; i < 7; i += 1) {
          const d = addDays(ws, i);
          if (d < from || d > last) continue;
          const st = byDate.get(d);
          if (st === 'done') wDone += 1;
          if (st === 'skip') wSkip += 1;
        }
        const inProgress = we >= today;
        const wScheduled = inProgress ? Math.min(wTarget, wDone + wSkip) : wTarget;
        const wDoneCounted = Math.min(wScheduled, wDone);
        scheduled += wScheduled;
        done += wDoneCounted;
        skipped += Math.min(wScheduled - wDoneCounted, wSkip);
        ws = addDays(ws, 7);
      }
      missed = Math.max(0, scheduled - done - skipped);
    } else {
      for (const d of eachDay(from, last)) {
        if (!isScheduledOn(schedule, d)) continue;
        const st = byDate.get(d);
        if (st === undefined && d === today) continue; // pending, not yet due
        scheduled += 1;
        if (st === 'done') done += 1;
        else if (st === 'skip') skipped += 1;
        else missed += 1;
      }
    }
  }
  const denom = Math.max(0, scheduled - skipped);
  const percent = denom === 0 ? 0 : Math.round((done / denom) * 100);
  return { scheduled, done, skipped, missed, percent };
}
