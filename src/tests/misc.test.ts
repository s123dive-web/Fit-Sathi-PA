import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { addDays, dayNamesToWeekdays, diffDays, hhmmToMinutes, isValidHHMM, isoWeekday, minutesToHHMM, parseHHMM, weekStart } from '../utils/dates';
import { levelFromXp, xpForLevel } from '../utils/xp';
import { bmr, MIN_KCAL, nutritionTargets, tdee } from '../utils/nutrition';
import { computeInsights, MIN_WEEKS_PER_SIDE } from '../utils/insights';
import { bmi, cmToFtIn, ftInToCm } from '../utils/units';
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

  it('parseHHMM tolerates malformed input instead of producing NaN', () => {
    expect(parseHHMM('07:05')).toEqual({ h: 7, m: 5 });
    expect(parseHHMM('9:05')).toEqual({ h: 9, m: 5 });
    for (const bad of ['', 'abc', '25:00', '12:60', '12', '12:', ':30', '1:2', '12:30:00']) {
      expect(parseHHMM(bad)).toEqual({ h: 0, m: 0 });
      expect(hhmmToMinutes(bad)).toBe(0);
      expect(isValidHHMM(bad)).toBe(false);
    }
    expect(isValidHHMM('23:59')).toBe(true);
    expect(isValidHHMM('00:00')).toBe(true);
    expect(isValidHHMM(undefined)).toBe(false);
    expect(isValidHHMM(1230)).toBe(false);
  });
});

describe('units', () => {
  it('converts cm to ft/in and back', () => {
    expect(cmToFtIn(174)).toEqual({ ft: 5, inch: 9 });
    expect(Math.round(ftInToCm(5, 9))).toBe(175);
  });

  it('bmi returns null for impossible inputs', () => {
    expect(bmi(70, 175)).toBe(22.9);
    expect(bmi(70, 0)).toBeNull();
    expect(bmi(70, -170)).toBeNull();
    expect(bmi(0, 170)).toBeNull();
    expect(bmi(NaN, 170)).toBeNull();
  });
});

describe('xp levels & milestones', () => {
  it('H13: level 1 progress runs 0 → 100 % over 0..50 XP', () => {
    expect(xpForLevel(1)).toBe(0);
    expect(xpForLevel(2)).toBe(50);
    expect(xpForLevel(3)).toBe(200);
    expect(levelFromXp(0)).toMatchObject({ level: 1, currentLevelXp: 0, nextLevelXp: 50, progress: 0 });
    expect(levelFromXp(25).progress).toBeCloseTo(0.5, 6);
    expect(levelFromXp(49).level).toBe(1);
    expect(levelFromXp(50)).toMatchObject({ level: 2, progress: 0 });
    expect(levelFromXp(200).level).toBe(3);
    expect(levelFromXp(450).level).toBe(4);
    expect(levelFromXp(NaN).level).toBe(1);
    expect(levelFromXp(-5).progress).toBe(0);
  });
  it('level thresholds are strictly increasing', () => {
    for (let n = 1; n < 100; n += 1) expect(xpForLevel(n + 1)).toBeGreaterThan(xpForLevel(n));
    for (let xp = 0; xp < 2000; xp += 7) {
      const l = levelFromXp(xp);
      expect(l.currentLevelXp).toBeLessThanOrEqual(xp);
      expect(l.nextLevelXp).toBeGreaterThan(xp);
      expect(l.progress).toBeGreaterThanOrEqual(0);
      expect(l.progress).toBeLessThan(1);
    }
  });
  it('milestones are 7/21/30/60/90', () => {
    expect([7, 21, 30, 60, 90].every(isMilestone)).toBe(true);
    expect(isMilestone(8)).toBe(false);
  });
});

describe('nutrition', () => {
  const base: Profile = {
    ...sample,
    user: { ...sample.user, sex: 'male', age: 30, heightCm: 175, currentWeightKg: 70, targetWeightKg: 65, activityLevel: 'sedentary' },
    nutritionTargets: undefined,
  };
  const withUser = (u: Partial<Profile['user']>): Profile => ({ ...base, user: { ...base.user, ...u } });

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
  it('uses the Mifflin-St Jeor constants', () => {
    expect(bmr(base)).toBeCloseTo(10 * 70 + 6.25 * 175 - 5 * 30 + 5, 6); // 1648.75
    expect(bmr(withUser({ sex: 'female' }))).toBeCloseTo(1648.75 - 5 - 161, 6);
    expect(bmr(withUser({ sex: 'other' }))).toBeCloseTo(1648.75 - 5 - 78, 6);
  });
  it('applies the activity factors', () => {
    const b = bmr(base);
    expect(tdee(withUser({ activityLevel: 'sedentary' }))).toBeCloseTo(b * 1.2, 6);
    expect(tdee(withUser({ activityLevel: 'light' }))).toBeCloseTo(b * 1.375, 6);
    expect(tdee(withUser({ activityLevel: 'moderate' }))).toBeCloseTo(b * 1.55, 6);
    expect(tdee(withUser({ activityLevel: 'active' }))).toBeCloseTo(b * 1.725, 6);
    expect(tdee(withUser({ activityLevel: 'very_active' }))).toBeCloseTo(b * 1.9, 6);
  });
  it('adds a 300 kcal surplus when gaining and nothing when maintaining', () => {
    const gain = nutritionTargets(withUser({ targetWeightKg: 75 }));
    expect(gain.deficitKcal).toBe(-300);
    expect(gain.kcal).toBe(Math.round(tdee(withUser({ targetWeightKg: 75 })) + 300));
    const keep = nutritionTargets(withUser({ targetWeightKg: 70.3 }));
    expect(keep.deficitKcal).toBe(0);
    expect(keep.kcal).toBe(Math.round(tdee(base)));
  });
  it('never goes below the 1200 kcal floor', () => {
    const tiny = nutritionTargets(withUser({ sex: 'female', age: 80, heightCm: 150, currentWeightKg: 42, targetWeightKg: 38, activityLevel: 'sedentary' }));
    expect(tiny.kcal).toBe(MIN_KCAL);
    expect(nutritionTargets({ ...base, nutritionTargets: { kcal: 800 } }).kcal).toBe(MIN_KCAL);
  });
  it('clamps protein to 35 % of the kcal target', () => {
    const t = nutritionTargets({ ...base, nutritionTargets: { kcal: 1200, proteinG: 400 } });
    expect(t.proteinG).toBe(105);
    expect(t.proteinG * 4).toBeLessThanOrEqual(t.kcal * 0.35);
    // 1.6 g/kg of a 120 kg target would be 192 g: far more than 35 % of a ~1300 kcal day allows.
    const heavyTarget = nutritionTargets(
      withUser({ sex: 'female', age: 80, heightCm: 150, currentWeightKg: 45, targetWeightKg: 120, activityLevel: 'sedentary' }),
    );
    expect(heavyTarget.proteinG).toBe(Math.floor((heavyTarget.kcal * 0.35) / 4));
    expect(heavyTarget.proteinG).toBeLessThan(192);
    expect(heavyTarget.carbsG).toBeGreaterThanOrEqual(0);
  });
  it('never returns negative or NaN targets', () => {
    const broken = nutritionTargets(withUser({ currentWeightKg: NaN, heightCm: NaN, targetWeightKg: -10 }));
    for (const v of [broken.kcal, broken.proteinG, broken.carbsG, broken.fatG]) {
      expect(Number.isFinite(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
    }
    expect(broken.kcal).toBe(MIN_KCAL);
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
  const eight = [wk(0, 6, -0.6), wk(1, 6, -0.5), wk(2, 6, -0.4), wk(3, 7, -0.5), wk(4, 2, 0.1), wk(5, 3, -0.1), wk(6, 1, 0.2), wk(7, 0, 0)];

  it('finds the workouts correlation and reports the sample size', () => {
    const ins = computeInsights(eight, 3000);
    const w = ins.find((i) => i.id === 'workouts6');
    expect(w?.title).toContain('≥6 workouts');
    expect(w?.sentiment).toBe('positive');
    expect(w?.weeksA).toBe(4);
    expect(w?.weeksB).toBe(4);
    expect(w?.detail).toContain('4 vs 4 weeks');
  });
  it('H6: needs at least 4 weeks on each side', () => {
    expect(MIN_WEEKS_PER_SIDE).toBe(4);
    const six = [wk(0, 6, -0.6), wk(1, 6, -0.5), wk(2, 6, -0.4), wk(3, 2, 0.1), wk(4, 3, -0.1), wk(5, 1, 0.2)];
    expect(computeInsights(six, 3000).find((i) => i.id === 'workouts6')).toBeUndefined();
    expect(computeInsights(eight, 3000).find((i) => i.id === 'workouts6')).toBeDefined();
  });
  it('H6: gaining weeks are positive for a gain goal', () => {
    const gaining = [wk(0, 6, 0.5), wk(1, 6, 0.4), wk(2, 6, 0.6), wk(3, 7, 0.5), wk(4, 2, 0.1), wk(5, 3, 0), wk(6, 1, 0.2), wk(7, 0, 0.1)];
    const lose = computeInsights(gaining, 3000);
    expect(lose.find((i) => i.id === 'workouts6')?.sentiment).toBe('negative');
    expect(lose.find((i) => i.id === 'recent')?.sentiment).toBe('negative');
    const gain = computeInsights(gaining, 3000, { goal: 'gain' });
    expect(gain.find((i) => i.id === 'workouts6')?.sentiment).toBe('positive');
    expect(gain.find((i) => i.id === 'recent')?.sentiment).toBe('positive');
  });
  it('H6: steady weeks are positive for a maintain goal', () => {
    const steady = [wk(0, 6, 0.05), wk(1, 6, -0.05), wk(2, 6, 0.1), wk(3, 7, 0), wk(4, 2, 0.6), wk(5, 3, 0.5), wk(6, 1, -0.7), wk(7, 0, 0.8)];
    const m = computeInsights(steady, 3000, { goal: 'maintain' });
    expect(m.find((i) => i.id === 'workouts6')?.sentiment).toBe('positive');
    expect(m.find((i) => i.id === 'recent')?.sentiment).toBe('negative'); // last 4 weeks swing ±0.5–0.8
  });
  it('asks for more data when there is nothing to compare', () => {
    expect(computeInsights([], 3000)[0].id).toBe('need_more');
  });
});
