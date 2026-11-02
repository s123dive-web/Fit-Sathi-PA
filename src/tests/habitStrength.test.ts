import { describe, expect, it } from 'vitest';
import { completionStats, computeStreaks, computeStrength, multiplier } from '../utils/habitStrength';
import type { HabitLog } from '../types';

const log = (date: string, status: HabitLog['status']): HabitLog => ({ habitId: 'h', date, status, loggedAt: `${date}T08:00:00Z` });

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
    const sched = { type: 'times_per_week' as const, timesPerWeek: 3 };
    const logs = [log('2026-01-05', 'done'), log('2026-01-06', 'done'), log('2026-01-07', 'done')];
    const midWeek = computeStrength(sched, logs, '2026-01-05', '2026-01-10').score;
    const nextWeek = computeStrength(sched, logs, '2026-01-05', '2026-01-12').score;
    expect(nextWeek).toBeCloseTo(midWeek, 6); // target met → no decay at week close
    const short = computeStrength(sched, logs.slice(0, 1), '2026-01-05', '2026-01-12').score;
    const shortMid = computeStrength(sched, logs.slice(0, 1), '2026-01-05', '2026-01-10').score;
    expect(short).toBeLessThan(shortMid);
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

  it('weekly habits count weeks meeting target', () => {
    const sched = { type: 'times_per_week' as const, timesPerWeek: 2 };
    const logs = [log('2026-01-05', 'done'), log('2026-01-06', 'done'), log('2026-01-12', 'done'), log('2026-01-13', 'done')];
    const s = computeStreaks(sched, logs, '2026-01-05', '2026-01-20'); // third week in progress
    expect(s.unit).toBe('weeks');
    expect(s.current).toBe(2);
  });
});

describe('completion stats', () => {
  it('excludes skipped days from the denominator', () => {
    const logs = [log('2026-01-01', 'done'), log('2026-01-02', 'skip'), log('2026-01-03', 'miss')];
    const st = completionStats({ type: 'daily' }, logs, '2026-01-01', '2026-01-04');
    expect(st.scheduled).toBe(4);
    expect(st.skipped).toBe(1);
    expect(st.done).toBe(1);
    expect(st.missed).toBe(1); // 01-04 is "today" and not counted as missed
    expect(st.percent).toBe(33);
  });
});

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
