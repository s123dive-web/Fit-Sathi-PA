import type { ActivityLevel, Profile } from '../types';

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Hard floor for a computed daily kcal target. */
export const MIN_KCAL = 1200;
/** Protein never exceeds this share of the kcal target (4 kcal/g). */
export const MAX_PROTEIN_KCAL_SHARE = 0.35;

function finite(n: number, fallback = 0): number {
  return Number.isFinite(n) ? n : fallback;
}

/** Mifflin-St Jeor BMR. Uses a midpoint constant when sex is unspecified. */
export function bmr(profile: Profile): number {
  const u = profile.user;
  const base = 10 * finite(u.currentWeightKg) + 6.25 * finite(u.heightCm) - 5 * finite(u.age);
  if (u.sex === 'male') return base + 5;
  if (u.sex === 'female') return base - 161;
  return base - 78;
}

export function tdee(profile: Profile): number {
  return bmr(profile) * (ACTIVITY_FACTOR[profile.user.activityLevel] ?? ACTIVITY_FACTOR.light);
}

export interface NutritionTargets {
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  deficitKcal: number;
  source: 'profile' | 'computed';
}

/**
 * Daily targets. Explicit profile targets win. Otherwise:
 * deficit 500 kcal/day when losing, surplus 300 when gaining; protein 1.6 g/kg of target weight;
 * fat 25 % of kcal; carbs the remainder. kcal never drops below MIN_KCAL and protein is clamped so
 * its calories stay within MAX_PROTEIN_KCAL_SHARE of the kcal target; no target is ever negative or NaN.
 */
export function nutritionTargets(profile: Profile): NutritionTargets {
  const maintenance = finite(tdee(profile), MIN_KCAL);
  const diff = finite(profile.user.targetWeightKg) - finite(profile.user.currentWeightKg);
  let deficit = 0;
  if (diff < -0.5) deficit = 500;
  else if (diff > 0.5) deficit = -300;
  let kcal = Math.round(Math.max(MIN_KCAL, maintenance - deficit));
  let proteinG = Math.round(1.6 * Math.max(0, finite(profile.user.targetWeightKg)));
  let source: NutritionTargets['source'] = 'computed';
  if (profile.nutritionTargets?.kcal && Number.isFinite(profile.nutritionTargets.kcal)) {
    kcal = Math.max(MIN_KCAL, Math.round(profile.nutritionTargets.kcal));
    source = 'profile';
  }
  if (profile.nutritionTargets?.proteinG && Number.isFinite(profile.nutritionTargets.proteinG)) {
    proteinG = Math.max(0, Math.round(profile.nutritionTargets.proteinG));
    source = 'profile';
  }
  const maxProteinG = Math.floor((kcal * MAX_PROTEIN_KCAL_SHARE) / 4);
  proteinG = Math.min(proteinG, maxProteinG);
  const fatG = Math.round((kcal * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, carbsG, fatG, deficitKcal: deficit, source };
}

export function isVegetarianDiet(diet: Profile['user']['dietType']): boolean {
  return diet === 'veg' || diet === 'vegan' || diet === 'jain';
}
