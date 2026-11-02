import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addDays, dayNamesToWeekdays, diffDays, hhmmToMinutes, isoWeekday, minutesToHHMM, weekStart } from '../utils/dates';
import { levelFromXp, xpForLevel } from '../utils/xp';
import { nutritionTargets } from '../utils/nutrition';
import { computeInsights } from '../utils/insights';
import { cmToFtIn, ftInToCm } from '../utils/units';
import { isMilestone } from '../utils/milestones';
import type { Profile, WeeklySummary } from '../types';

const sample = JSON.parse(readFileSync(new URL('../../sample/suresh_profile.json', import.meta.url), 'utf8')) as Profile;

describe('dates', () => {
  it('ISO weekday and week start', () => {
    expect(isoWeekday('2026-01-05')).toBe(1);
    expect(isoWeekday('2026-01-11')).toBe(7);
    expect(weekStart('2026-01-11')).toBe('2026-01-05');
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
    expect(diffDays('2026-01-01', '2026-02-01')).toBe(31);
    expect(minutesToHHMM(hhmmToMinutes('23:45') + 30)).toBe('00:15');
    expect(dayNamesToWeekdays(['sun', 'mon', 'mon'])).toEqual([1, 7]);
  });
});

describe('units', () => {
  it('converts cm to ft/in and back', () => {
    expect(cmToFtIn(174)).toEqual({ ft: 5, inch: 9 });
    expect(Math.round(ftInToCm(5, 9))).toBe(175);
  });
});

describe('xp levels & milestones', () => {
  it('levels grow quadratically', () => {
    expect(xpForLevel(2)).toBe(200);
    expect(levelFromXp(0).level).toBe(1);
    expect(levelFromXp(200).level).toBe(2);
    expect(levelFromXp(450).level).toBe(3);
  });
  it('milestones are 7/21/30/60/90', () => {
    expect([7, 21, 30, 60, 90].every(isMilestone)).toBe(true);
    expect(isMilestone(8)).toBe(false);
  });
});

describe('nutrition', () => {
  it('computes a deficit for the sample (76 → 65 kg)', () => {
    const t = nutritionTargets(sample);
    expect(t.source).toBe('computed');
    expect(t.deficitKcal).toBe(500);
    expect(t.kcal).toBeGreaterThan(1200);
    expect(t.proteinG).toBe(Math.round(1.6 * 65));
  });
  it('uses explicit targets when present', () => {
    const t = nutritionTargets({ ...sample, nutritionTargets: { kcal: 1800, proteinG: 120 } });
    expect(t.kcal).toBe(1800);
    expect(t.proteinG).toBe(120);
    expect(t.source).toBe('profile');
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
    const ins = computeInsights([wk(0, 6, -0.6), wk(1, 6, -0.5), wk(2, 2, 0.1), wk(3, 3, -0.1)], 3000);
    const w = ins.find((i) => i.id === 'workouts6');
    expect(w?.title).toContain('≥6 workouts');
    expect(w?.sentiment).toBe('positive');
  });
  it('asks for more data when there is nothing to compare', () => {
    expect(computeInsights([], 3000)[0].id).toBe('need_more');
  });
});
