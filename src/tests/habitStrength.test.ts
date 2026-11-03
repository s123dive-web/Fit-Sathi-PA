import { describe, expect, it } from 'vitest';
import { completionStats, computeStreaks, computeStrength, multiplier, proratedTarget } from '../utils/habitStrength';
import type { HabitLog } from '../types';

const log = (date: string, status: HabitLog['status']): HabitLog => ({ habitId: 'h', date, status, loggedAt: `${date}T08:00:00Z` });

// 2026-01-05 is a Monday; 2026-01-11 a Sunday.
const weekly3 = { type: 'times_per_week' as const, timesPerWeek: 3 };
const monToFri = { type: 'weekdays' as const, weekdays: [1, 2, 3, 4, 5] as (1 | 2 | 3 | 4 | 5)[] };

describe('Loop-style strength', () => {
  it('multiplier is gentler for lower-frequency habits', () => {
    expect(multiplier({ type: 'daily' })).toBeLessThan(multiplier({ type: 'times_per_week', timesPerWeek: 2 }));
    expect(multiplier({ type: 'daily' })).toBeCloseTo(Math.pow(0.5, 1 / 13), 6);
  });

  it('rises with completions and never exceeds 1', () => {
    const logs = Array.from({ length: 60 }, (_, i) => log(shift('2026-01-01', i), 'done'));
    const r = computeStrength({ type: 'daily' }, logs, '2026-01-01', '2026-03-01');
    expect(r.score).toBeGreaterThan(0.9);
    expect(r.score).toBeLessThanOrEqual(1);
  });

  it('decays gently on a miss instead of resetting', () => {
    const logs = Array.from({ length: 30 }, (_, i) => log(shift('2026-01-01', i), 'done'));
    const before = computeStrength({ type: 'daily' }, logs, '2026-01-01', '2026-01-30').score;
    const after = computeStrength({ type: 'daily' }, logs, '2026-01-01', '2026-02-02').score; // 2 missed days
    expect(after).toBeLessThan(before);
    expect(after).toBeGreaterThan(before * 0.8);
  });

  it('skip does not change the score', () => {
    const logs = Array.from({ length: 10 }, (_, i) => log(shift('2026-01-01', i), 'done'));
    const base = computeStrength({ type: 'daily' }, logs, '2026-01-01', '2026-01-10').score;
    const withSkip = computeStrength({ type: 'daily' }, [...logs, log('2026-01-11', 'skip')], '2026-01-01', '2026-01-12').score;
    expect(withSkip).toBeCloseTo(base, 6);
  });

  it('weekday habits ignore unscheduled days', () => {
    // Mon/Wed/Fri only; 2026-01-05 is a Monday
    const sched = { type: 'weekdays' as const, weekdays: [1, 3, 5] as (1 | 3 | 5)[] };
    const logs = [log('2026-01-05', 'done'), log('2026-01-07', 'done'), log('2026-01-09', 'done')];
    const r = computeStrength(sched, logs, '2026-01-05', '2026-01-11'); // Sat/Sun unscheduled
    const rFull = computeStrength(sched, logs, '2026-01-05', '2026-01-09');
    expect(r.score).toBeCloseTo(rFull.score, 6);
  });

  it('times-per-week decays only at week end for missing completions', () => {
    const logs = [log('2026-01-05', 'done'), log('2026-01-06', 'done'), log('2026-01-07', 'done')];
    const midWeek = computeStrength(weekly3, logs, '2026-01-05', '2026-01-10').score;
    const nextWeek = computeStrength(weekly3, logs, '2026-01-05', '2026-01-12').score;
    expect(nextWeek).toBeCloseTo(midWeek, 6); // target met → no decay at week close
    const short = computeStrength(weekly3, logs.slice(0, 1), '2026-01-05', '2026-01-12').score;
    const shortMid = computeStrength(weekly3, logs.slice(0, 1), '2026-01-05', '2026-01-10').score;
    expect(short).toBeLessThan(shortMid);
  });

  it('H3: prorates the first partial week of a times-per-week habit created mid-week', () => {
    // Created on Friday 01-09: only Fri/Sat/Sun exist → target ceil(3 × 3/7) = 2, both done → no decay at week close.
    const logs = [log('2026-01-09', 'done'), log('2026-01-10', 'done')];
    const beforeClose = computeStrength(weekly3, logs, '2026-01-09', '2026-01-10').score;
    const afterClose = computeStrength(weekly3, logs, '2026-01-09', '2026-01-13').score;
    expect(afterClose).toBeCloseTo(beforeClose, 6);
    // One completion in that partial week is still one short → decays once.
    const oneDone = computeStrength(weekly3, logs.slice(0, 1), '2026-01-09', '2026-01-13').score;
    expect(oneDone).toBeLessThan(computeStrength(weekly3, logs.slice(0, 1), '2026-01-09', '2026-01-10').score);
    expect(proratedTarget(3, 3)).toBe(2);
    expect(proratedTarget(1, 1)).toBe(1);
    expect(proratedTarget(5, 7)).toBe(5);
    expect(proratedTarget(5, 0)).toBe(0);
  });

  it('H4: an explicit miss logged today decays strength', () => {
    const done = [log('2026-01-05', 'done'), log('2026-01-06', 'done')];
    const pending = computeStrength({ type: 'daily' }, done, '2026-01-05', '2026-01-07').score;
    const missed = computeStrength({ type: 'daily' }, [...done, log('2026-01-07', 'miss')], '2026-01-05', '2026-01-07').score;
    expect(missed).toBeLessThan(pending);
    expect(missed).toBeCloseTo(pending * multiplier({ type: 'daily' }), 6);
  });
});

describe('streaks', () => {
  it('counts consecutive done days and skips keep the streak', () => {
    const logs = [log('2026-01-01', 'done'), log('2026-01-02', 'done'), log('2026-01-03', 'skip'), log('2026-01-04', 'done')];
    const s = computeStreaks({ type: 'daily' }, logs, '2026-01-01', '2026-01-04');
    expect(s.current).toBe(3);
    expect(s.best).toBe(3);
    expect(s.unit).toBe('days');
  });

  it('a miss breaks the streak but best is kept', () => {
    const logs = [log('2026-01-01', 'done'), log('2026-01-02', 'done'), log('2026-01-03', 'miss'), log('2026-01-04', 'done')];
    const s = computeStreaks({ type: 'daily' }, logs, '2026-01-01', '2026-01-04');
    expect(s.current).toBe(1);
    expect(s.best).toBe(2);
  });

  it('today pending does not break the streak', () => {
    const logs = [log('2026-01-01', 'done'), log('2026-01-02', 'done')];
    const s = computeStreaks({ type: 'daily' }, logs, '2026-01-01', '2026-01-03');
    expect(s.current).toBe(2);
  });

  it('H4: an explicit miss logged today breaks the current streak', () => {
    const logs = [log('2026-01-01', 'done'), log('2026-01-02', 'done'), log('2026-01-03', 'miss')];
    const s = computeStreaks({ type: 'daily' }, logs, '2026-01-01', '2026-01-03');
    expect(s.current).toBe(0);
    expect(s.best).toBe(2);
  });

  it('weekday (Mon–Fri) streaks carry across a weekend', () => {
    const week1 = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'].map((d) => log(d, 'done'));
    // Saturday and Sunday are unscheduled and unlogged.
    expect(computeStreaks(monToFri, week1, '2026-01-05', '2026-01-10').current).toBe(5);
    expect(computeStreaks(monToFri, week1, '2026-01-05', '2026-01-11').current).toBe(5);
    const s = computeStreaks(monToFri, [...week1, log('2026-01-12', 'done')], '2026-01-05', '2026-01-12');
    expect(s.current).toBe(6);
    expect(s.best).toBe(6);
    // Missing Monday after the weekend breaks it; Tuesday restarts.
    const t = computeStreaks(monToFri, [...week1, log('2026-01-13', 'done')], '2026-01-05', '2026-01-13');
    expect(t.current).toBe(1);
    expect(t.best).toBe(5);
  });

  it('weekly habits count weeks meeting target', () => {
    const sched = { type: 'times_per_week' as const, timesPerWeek: 2 };
    const logs = [log('2026-01-05', 'done'), log('2026-01-06', 'done'), log('2026-01-12', 'done'), log('2026-01-13', 'done')];
    const s = computeStreaks(sched, logs, '2026-01-05', '2026-01-20'); // third week in progress
    expect(s.unit).toBe('weeks');
    expect(s.current).toBe(2);
  });
});

describe('completion stats', () => {
  it('excludes skipped days from the denominator and ignores an unlogged today', () => {
    const logs = [log('2026-01-01', 'done'), log('2026-01-02', 'skip'), log('2026-01-03', 'miss')];
    const st = completionStats({ type: 'daily' }, logs, '2026-01-01', '2026-01-04', '2026-01-04');
    expect(st.scheduled).toBe(3); // 01-04 is today and unlogged → not due yet
    expect(st.skipped).toBe(1);
    expect(st.done).toBe(1);
    expect(st.missed).toBe(1);
    expect(st.percent).toBe(50);
  });

  it('a fully past range counts every scheduled day (unlogged past days are misses)', () => {
    const logs = [log('2026-01-01', 'done'), log('2026-01-02', 'skip'), log('2026-01-03', 'miss')];
    const st = completionStats({ type: 'daily' }, logs, '2026-01-01', '2026-01-04', '2026-02-01');
    expect(st).toEqual({ scheduled: 4, done: 1, skipped: 1, missed: 2, percent: 33 });
  });

  it('C2: days after today never count as scheduled (live "this week" with to = Sunday)', () => {
    const logs = [log('2026-01-05', 'done'), log('2026-01-06', 'done'), log('2026-01-07', 'done')];
    const st = completionStats({ type: 'daily' }, logs, '2026-01-05', '2026-01-11', '2026-01-07');
    expect(st.scheduled).toBe(3);
    expect(st.done).toBe(3);
    expect(st.percent).toBe(100);
    // A whole range in the future is simply empty.
    expect(completionStats({ type: 'daily' }, logs, '2026-01-12', '2026-01-18', '2026-01-07').scheduled).toBe(0);
  });

  it('H2: an unlogged today is not scheduled, a logged today is', () => {
    const logs = [log('2026-01-05', 'done'), log('2026-01-06', 'done'), log('2026-01-07', 'done')];
    const pending = completionStats({ type: 'daily' }, logs, '2026-01-05', '2026-01-08', '2026-01-08');
    expect(pending.scheduled).toBe(3);
    expect(pending.percent).toBe(100);
    const doneToday = completionStats({ type: 'daily' }, [...logs, log('2026-01-08', 'done')], '2026-01-05', '2026-01-08', '2026-01-08');
    expect(doneToday.scheduled).toBe(4);
    expect(doneToday.done).toBe(4);
    const missedToday = completionStats({ type: 'daily' }, [...logs, log('2026-01-08', 'miss')], '2026-01-05', '2026-01-08', '2026-01-08');
    expect(missedToday.scheduled).toBe(4);
    expect(missedToday.missed).toBe(1);
    expect(missedToday.percent).toBe(75);
  });

  it('defaults `today` to the real date (a range in the past is unaffected)', () => {
    const logs = [log('2026-01-05', 'done'), log('2026-01-06', 'done')];
    expect(completionStats({ type: 'daily' }, logs, '2026-01-05', '2026-01-06')).toEqual(
      completionStats({ type: 'daily' }, logs, '2026-01-05', '2026-01-06', '2026-06-01'),
    );
  });

  it('H3: prorates a times-per-week target when the window starts mid-week', () => {
    // Window Fri 01-09 → Sun 01-11 (3 of 7 days): target ceil(3 × 3/7) = 2.
    const logs = [log('2026-01-09', 'done'), log('2026-01-10', 'done')];
    const st = completionStats(weekly3, logs, '2026-01-09', '2026-01-11', '2026-01-20');
    expect(st.scheduled).toBe(2);
    expect(st.done).toBe(2);
    expect(st.percent).toBe(100);
    // A single day in range still expects at least one.
    const one = completionStats(weekly3, [], '2026-01-11', '2026-01-11', '2026-01-20');
    expect(one.scheduled).toBe(1);
    expect(one.missed).toBe(1);
  });

  it('H3: a week in progress is never charged misses', () => {
    const logs = [log('2026-01-12', 'done'), log('2026-01-13', 'done')];
    const live = completionStats(weekly3, logs, '2026-01-12', '2026-01-18', '2026-01-14');
    expect(live).toEqual({ scheduled: 2, done: 2, skipped: 0, missed: 0, percent: 100 });
    expect(completionStats(weekly3, [], '2026-01-12', '2026-01-18', '2026-01-14').scheduled).toBe(0);
    // Skips in the live week count as scheduled-but-skipped, never as misses.
    const withSkip = completionStats(weekly3, [...logs, log('2026-01-14', 'skip')], '2026-01-12', '2026-01-18', '2026-01-14');
    expect(withSkip).toEqual({ scheduled: 3, done: 2, skipped: 1, missed: 0, percent: 100 });
    // Doing more than the target in the live week never exceeds it.
    const extra = [...logs, log('2026-01-14', 'done'), log('2026-01-15', 'done')];
    expect(completionStats(weekly3, extra, '2026-01-12', '2026-01-18', '2026-01-15').scheduled).toBe(3);
    // Once the week has closed the full target is due.
    const closed = completionStats(weekly3, logs.slice(0, 1), '2026-01-12', '2026-01-18', '2026-01-20');
    expect(closed).toEqual({ scheduled: 3, done: 1, skipped: 0, missed: 2, percent: 33 });
  });

  it('weekday schedules only count their days across a weekend', () => {
    const logs = ['2026-01-05', '2026-01-06', '2026-01-07', '2026-01-08', '2026-01-09'].map((d) => log(d, 'done'));
    const st = completionStats(monToFri, logs, '2026-01-05', '2026-01-11', '2026-01-20');
    expect(st.scheduled).toBe(5);
    expect(st.percent).toBe(100);
    // Sunday as today, unlogged: nothing due, still 100 %.
    expect(completionStats(monToFri, logs, '2026-01-05', '2026-01-11', '2026-01-11').percent).toBe(100);
  });
});

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
