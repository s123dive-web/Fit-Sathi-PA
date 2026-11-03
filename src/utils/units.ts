import type { WeightUnit } from '../types';

export function kgToLb(kg: number): number {
  return kg * 2.2046226218;
}
export function lbToKg(lb: number): number {
  return lb / 2.2046226218;
}
export function cmToInches(cm: number): number {
  return cm / 2.54;
}
export function inchesToCm(inches: number): number {
  return inches * 2.54;
}

export function cmToFtIn(cm: number): { ft: number; inch: number } {
  const total = Math.round(cmToInches(cm));
  return { ft: Math.floor(total / 12), inch: total % 12 };
}

export function ftInToCm(ft: number, inch: number): number {
  return Math.round(inchesToCm(ft * 12 + inch) * 10) / 10;
}

export function formatHeight(cm: number, unit: 'cm' | 'ft_in'): string {
  if (unit === 'cm') return `${Math.round(cm)} cm`;
  const { ft, inch } = cmToFtIn(cm);
  return `${ft}′ ${inch}″`;
}

export function formatWeight(kg: number, unit: WeightUnit, digits = 1): string {
  if (unit === 'lb') return `${kgToLb(kg).toFixed(digits)} lb`;
  return `${kg.toFixed(digits)} kg`;
}

export function displayWeight(kg: number, unit: WeightUnit): number {
  return unit === 'lb' ? Math.round(kgToLb(kg) * 10) / 10 : Math.round(kg * 10) / 10;
}

export function parseWeightInput(value: number, unit: WeightUnit): number {
  return unit === 'lb' ? lbToKg(value) : value;
}

/** Body-mass index, or null when the inputs cannot give one (height or weight missing / non-positive). */
export function bmi(kg: number, cm: number): number | null {
  if (!Number.isFinite(kg) || !Number.isFinite(cm) || kg <= 0 || cm <= 0) return null;
  const m = cm / 100;
  return Math.round((kg / (m * m)) * 10) / 10;
}
