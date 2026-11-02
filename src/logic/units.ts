import type { HeightUnit, WeightUnit } from '../types';

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

export function heightToCm(height: { value: number; unit: HeightUnit }): number {
  return height.unit === 'cm' ? height.value : inchesToCm(height.value);
}

export function formatHeight(height: { value: number; unit: HeightUnit }): string {
  if (height.unit === 'cm') return `${Math.round(height.value)} cm`;
  const ft = Math.floor(height.value / 12);
  const inch = Math.round(height.value - ft * 12);
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

export function bmi(kg: number, cm: number): number {
  const m = cm / 100;
  return Math.round((kg / (m * m)) * 10) / 10;
}
