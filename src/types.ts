/** Shared domain types for FitSaathi. Everything is per-user; nothing is hardcoded to the owner. */

export type ISODate = string; // YYYY-MM-DD (local)
export type HHMM = string; // 24h "HH:MM"
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1 = Monday ... 7 = Sunday

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type DietType =
  | 'vegetarian'
  | 'eggetarian'
  | 'non_vegetarian'
  | 'vegan'
  | 'jain'
  | 'other';
export type HeightUnit = 'cm' | 'ft_in';
export type WeightUnit = 'kg' | 'lb';
export type Sex = 'male' | 'female' | 'other';

export interface Supplement {
  id: string;
  name: string;
  dose: string;
  time: HHMM;
  alarm: boolean;
}

export interface Profile {
  schemaVersion: 1;
  name: string;
  age: number;
  sex?: Sex;
  city?: string;
  height: { value: number; unit: HeightUnit }; // for ft_in, value is total inches
  currentWeightKg: number;
  targetWeightKg: number;
  activityLevel: ActivityLevel;
  dietType: DietType;
  /** Fasting window: fast begins at `start`, eating resumes at `end` (may wrap past midnight). */
  fasting: { enabled: boolean; start: HHMM; end: HHMM };
  sleep: { start: HHMM; end: HHMM };
  waterTargetMl: number;
  supplements: Supplement[];
  workout: { start: HHMM; end: HHMM; days: Weekday[] };
  appearanceGoals: string;
  photoConsent: boolean;
  nutritionTargets?: { kcal?: number; proteinG?: number };
  preferences?: {
    weightUnit?: WeightUnit;
    theme?: 'system' | 'light' | 'dark';
    waterReminderIntervalMin?: number;
    habitReminderTime?: HHMM;
    fastingNotifications?: boolean;
    waterReminders?: boolean;
  };
}

export type HabitScheduleType = 'daily' | 'times_per_week' | 'weekdays';

export interface HabitSchedule {
  type: HabitScheduleType;
  timesPerWeek?: number; // for times_per_week
  weekdays?: Weekday[]; // for weekdays
}

export type HabitKind = 'generic' | 'workout' | 'fasting' | 'sleep' | 'custom';

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  kind: HabitKind;
  schedule: HabitSchedule;
  reminderTime: HHMM | null;
  reminderEnabled: boolean;
  pinned: boolean; // shown in persistent notification / widget
  archived: boolean;
  createdAt: ISODate;
  sortOrder: number;
  xp: number;
}

export type HabitStatus = 'done' | 'skip' | 'miss';

export interface HabitLog {
  habitId: string;
  date: ISODate;
  status: HabitStatus;
  note?: string;
  loggedAt: string; // ISO timestamp
}

export interface SupplementLog {
  supplementId: string;
  date: ISODate;
  takenAt: string;
}

export interface WaterLog {
  id: string;
  date: ISODate;
  ml: number;
  loggedAt: string;
}

export interface WeightEntry {
  id: string;
  date: ISODate;
  kg: number;
  loggedAt: string;
}

export interface FoodItem {
  id: string;
  name: string;
  nameLocal?: string;
  category: string;
  servingLabel: string;
  servingGrams: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  vegetarian: boolean;
  custom: boolean;
}

export interface MealLog {
  id: string;
  date: ISODate;
  time: HHMM;
  foodId: string;
  foodName: string;
  servings: number;
  kcal: number;
  proteinG: number;
  carbsG: number;
  fatG: number;
  outsideFastingWindow: boolean;
  loggedAt: string;
}

export interface ProgressPhoto {
  id: string;
  date: ISODate;
  storageKey: string; // handle into encrypted storage
  weightKg: number | null;
  note: string;
  createdAt: string;
}

export interface StepsEntry {
  date: ISODate;
  steps: number;
  source: 'health_connect' | 'manual';
  updatedAt: string;
}

export interface WeeklySummary {
  weekStart: ISODate; // Monday
  weekEnd: ISODate; // Sunday
  habitsPct: number;
  avgWaterMl: number;
  workoutsDone: number;
  weightDeltaKg: number | null;
  avgKcal: number | null;
  avgProteinG: number | null;
  xpEarned: number;
  generatedAt: string;
}

export interface XpEvent {
  id: string;
  date: ISODate;
  amount: number;
  reason: string;
  loggedAt: string;
}

export interface Settings {
  onboarded: boolean;
  theme: 'system' | 'light' | 'dark';
  weightUnit: WeightUnit;
  healthConnectEnabled: boolean;
  futureLookCloudEnabled: boolean; // v2 stub: default OFF
  lastWeeklySummaryFor: ISODate | null;
  pinnedNotificationEnabled: boolean;
  installedAt: string;
}

export interface PendingNativeAction {
  kind: 'habit' | 'supplement' | 'water';
  refId: string;
  action: 'done' | 'skip' | 'snooze' | 'add';
  date: ISODate;
  ts: number;
}
