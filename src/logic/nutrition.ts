import type { ActivityLevel, Profile } from '../types';
import { heightToCm } from './units';

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/** Mifflin-St Jeor BMR. Uses a midpoint constant when sex is unspecified. */
export function bmr(profile: Profile): number {
  const cm = heightToCm(profile.height);
  const base = 10 * profile.currentWeightKg + 6.25 * cm - 5 * profile.age;
  if (profile.sex === 'male') return base + 5;
  if (profile.sex === 'female') return base - 161;
  return base - 78;
}

export function tdee(profile: Profile): number {
  return bmr(profile) * ACTIVITY_FACTOR[profile.activityLevel];
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
 * Daily targets. If the profile has explicit targets, they win. Otherwise:
 * - deficit of 500 kcal/day when losing, surplus of 300 when gaining, else maintenance
 * - protein 1.6 g/kg of target weight, fat 25% of kcal, carbs the remainder.
 */
export function nutritionTargets(profile: Profile): NutritionTargets {
  const maintenance = tdee(profile);
  const diff = profile.targetWeightKg - profile.currentWeightKg;
  let deficit = 0;
  if (diff < -0.5) deficit = 500;
  else if (diff > 0.5) deficit = -300;
  let kcal = Math.round(Math.max(1200, maintenance - deficit));
  let proteinG = Math.round(1.6 * profile.targetWeightKg);
  let source: NutritionTargets['source'] = 'computed';
  if (profile.nutritionTargets?.kcal) {
    kcal = profile.nutritionTargets.kcal;
    source = 'profile';
  }
  if (profile.nutritionTargets?.proteinG) {
    proteinG = profile.nutritionTargets.proteinG;
    source = 'profile';
  }
  const fatG = Math.round((kcal * 0.25) / 9);
  const carbsG = Math.max(0, Math.round((kcal - proteinG * 4 - fatG * 9) / 4));
  return { kcal, proteinG, carbsG, fatG, deficitKcal: deficit, source };
}
