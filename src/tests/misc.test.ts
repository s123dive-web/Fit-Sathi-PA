import { describe, expect, it } from 'vitest';
import { addDays, diffDays, isoWeekday, weekStart, hhmmToMinutes, minutesToHHMM } from '../logic/dates';
import { levelFromXp, xpForLevel } from '../logic/xp';
import { nutritionTargets } from '../logic/nutrition';
import { computeInsights } from '../logic/insights';
import { readFileSync } from 'node:fs';
import type { Profile, WeeklySummary } from '../types';

const sample = JSON.parse(readFileSync(new URL('../../sample/suresh_profile.json', import.meta.url), 'utf8')) as Profile;

describe('dates', () => {
  it('ISO weekday and week start', () => {
    expect(isoWeekday('2026-01-05')).toBe(1); // Monday
    expect(isoWeekday('2026-01-11')).toBe(7); // Sunday
    expect(weekStart('2026-01-11')).toBe('2026-01-05');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(diffDays('2026-01-01', '2026-02-01')).toBe(31);
    expect(minutesToHHMM(hhmmToMinutes('23:45') + 30)).toBe('00:15');
  });
});

describe('xp levels', () => {
  it('levels grow quadratically', () => {
    expect(xpForLevel(2)).toBe(200);
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(200).level).toBe(2);
    expect(levelFromXp(449).level).toBe(2);
    expect(levelFromXp(450).level).toBe(3);
  });
});

describe('nutrition', () => {
  it('uses explicit profile targets when present', () => {
    const t = nutritionTargets(sample);
    expect(t.kcal).toBe(1800);
    expect(t.proteinG).toBe(120);
    expect(t.source).toBe('profile');
  });
  it('computes a deficit when losing weight', () => {
    const t = nutritionTargets({ ...sample, nutritionTargets: undefined });
    expect(t.source).toBe('computed');
    expect(t.deficitKcal).toBe(500);
    expect(t.kcal).toBeGreaterThan(1200);
    expect(t.proteinG).toBe(Math.round(1.6 * 74));
  });
});

describe('insights', () => {
  const wk = (i: number, workouts: number, delta: number): WeeklySummary => ({
    weekStart: `2026-0${1 + Math.floor(i / 4)}-0${1 + (i % 4)}`,
    weekEnd: '',
    habitsPct: 70,
    avgWaterMl: 2500,
    workoutsDone: workouts,
    weightDeltaKg: delta,
    avgKcal: null,
    avgProteinG: null,
    xpEarned: 0,
    generatedAt: '',
  });
  it('finds the workouts correlation', () => {
    const weeks = [wk(0, 6, -0.6), wk(1, 6, -0.5), wk(2, 2, 0.1), wk(3, 3, -0.1)];
    const ins = computeInsights(weeks, 3000);
    const w = ins.find((i) => i.id === 'workouts6');
    expect(w).toBeDefined();
    expect(w?.title).toContain('≥6 workouts');
    expect(w?.sentiment).toBe('positive');
  });
  it('asks for more data when there is nothing to compare', () => {
    expect(computeInsights([], 3000)[0].id).toBe('need_more');
  });
});
