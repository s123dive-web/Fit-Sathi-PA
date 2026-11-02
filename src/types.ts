/** Shared domain types for FitSaathi. Everything is per-user; nothing is hardcoded to the owner. */

export type ISODate = string; // YYYY-MM-DD (local calendar day)
export type HHMM = string; // 24h "HH:MM"
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7; // ISO: 1 = Monday ... 7 = Sunday
export type DayName = 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';
export type DietType = 'veg' | 'egg' | 'non-veg' | 'vegan' | 'jain' | 'other';
export type HeightUnit = 'cm' | 'ft_in';
export type WeightUnit = 'kg' | 'lb';
export type Sex = 'male' | 'female' | 'other';
export type Theme = 'system' | 'light' | 'dark';

export interface Supplement {
  id: string; // stable id (generated from name + time when absent in an import)
  name: string;
  dose: string;
  time: HHMM;
  alarm: boolean;
}

export type ProfileHabitSchedule = 'daily' | 'weekly' | 'weekdays';

/** Habit definition as it appears in the profile JSON (used to seed habits). */
export interface ProfileHabit {
  name: string;
  schedule: ProfileHabitSchedule;
  targetPerWeek?: number; // for 'weekly'
  days?: DayName[]; // for 'weekdays'
  emoji?: string;
  reminder?: HHMM;
}

export interface TypicalMeals {
  breakfast?: string[];
  lunch?: string[];
  dinner?: string[];
  snacks?: string[];
  protein?: { chickenPerWeek?: number; eggs?: string; fishPerWeek?: number };
  drinks?: { teaWithSugarCups?: number; coffeeCups?: number };
}

export interface NotificationPrefs {
  motivational: { enabled: boolean; times: HHMM[] };
  fastingWarningMinutesBefore: number;
  supplementAlarms?: boolean;
  workoutAlarm?: boolean;
  habitReminders?: boolean;
  eveningCheckIn?: HHMM | null;
  waterReminders?: boolean;
  waterReminderIntervalMin?: number;
  fastingWindow?: boolean;
  pinnedChecklist?: boolean;
}

export interface Profile {
  schemaVersion: 1;
  user: {
    name: string;
    age: number;
    sex?: Sex;
    city?: string;
    heightCm: number;
    currentWeightKg: number;
    targetWeightKg: number;
    activityLevel: ActivityLevel;
    dietType: DietType;
    cuisine?: string;
    appearanceGoals: string;
  };
  /** Eating window. Fasting runs from eatEnd to eatStart (wraps past midnight). */
  fasting: { enabled: boolean; eatStart: HHMM; eatEnd: HHMM };
  sleep: { bedtime: HHMM; wake: HHMM };
  water: { targetMl: number };
  workout: { enabled: boolean; start: HHMM; end: HHMM; days: DayName[]; location?: string; alarm: boolean };
  supplements: Supplement[];
  habits: ProfileHabit[];
  typicalMeals?: TypicalMeals;
  notifications: NotificationPrefs;
  privacy: { photoConsent: boolean; driveBackup: boolean; futureLookCloud: boolean };
  nutritionTargets?: { kcal?: number; proteinG?: number };
  preferences?: { heightUnit?: HeightUnit; weightUnit?: WeightUnit; theme?: Theme };
}

export type HabitScheduleType = 'daily' | 'times_per_week' | 'weekdays';

export interface HabitSchedule {
  type: HabitScheduleType;
  timesPerWeek?: number;
  weekdays?: Weekday[];
}

export type HabitKind = 'generic' | 'workout' | 'fasting' | 'sleep' | 'water' | 'custom';

export interface Habit {
  id: string;
  name: string;
  emoji: string;
  color: string;
  kind: HabitKind;
  schedule: HabitSchedule;
  reminderTime: HHMM | null;
  reminderEnabled: boolean;
  pinned: boolean;
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
  loggedAt: string;
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
  path: string; // handle into encrypted storage
  takenAt: string;
  weightKg: number | null;
  note: string;
}

export interface StepsEntry {
  date: ISODate;
  steps: number;
  source: 'health_connect' | 'manual';
  updatedAt: string;
}

export interface WeeklySummary {
  weekStart: ISODate;
  weekEnd: ISODate;
  habitsPct: number;
  avgWaterMl: number;
  workoutsDone: number;
  weightDeltaKg: number | null;
  avgKcal: number | null;
  avgProteinG: number | null;
  xpEarned: number;
  generatedAt: string;
}

export interface PointsEntry {
  id: string;
  date: ISODate;
  amount: number;
  reason: string;
  loggedAt: string;
}

export interface NotificationLogEntry {
  id: string;
  kind: 'motivation' | 'alarm' | 'reminder';
  refId: string; // quote id / alarm id
  scheduledFor: string; // ISO timestamp (local)
  body: string;
  createdAt: string;
}

export interface Settings {
  onboarded: boolean;
  theme: Theme;
  weightUnit: WeightUnit;
  heightUnit: HeightUnit;
  healthConnectEnabled: boolean;
  lastWeeklySummaryFor: ISODate | null;
  installedAt: string;
}

export interface PendingNativeAction {
  kind: 'habit' | 'supplement' | 'water';
  refId: string;
  action: 'done' | 'skip' | 'snooze' | 'add';
  date: ISODate;
  ts: number;
}
