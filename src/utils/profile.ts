import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import schema from '../schema/profile.schema.json';
import type { Habit, Profile, ProfileHabit, Supplement } from '../types';
import { newId } from './ids';
import { dayNamesToWeekdays, hhmmToMinutes, todayISO, weekdayToDayName } from './dates';

const ajv = new Ajv({ allErrors: true, strict: false });
addFormats(ajv);
const validateFn = ajv.compile<Profile>(schema);

export interface ValidationResult {
  ok: boolean;
  profile?: Profile;
  errors: string[];
}

function formatError(e: ErrorObject): string {
  const path = e.instancePath ? e.instancePath.replace(/^\//, '').replace(/\//g, '.') : '(root)';
  if (e.keyword === 'additionalProperties') {
    return `${path}: unknown field "${(e.params as { additionalProperty: string }).additionalProperty}"`;
  }
  if (e.keyword === 'required') {
    return `${path}: missing "${(e.params as { missingProperty: string }).missingProperty}"`;
  }
  return `${path}: ${e.message ?? 'invalid'}`;
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
}

/** Stable supplement id derived from name + time, so logs survive re-imports of the same file. */
export function supplementId(s: { name: string; time: string }): string {
  return `sup_${slug(s.name)}_${s.time.replace(':', '')}`;
}

/**
 * Ids for a whole supplement list. Names that differ only in punctuation ("Omega 3" vs "omega-3")
 * share a slug, so a repeated generated id gets an index suffix instead of colliding. Explicit ids
 * are kept as given (validateProfile reports duplicates among them).
 */
export function supplementIds(list: { id?: string; name: string; time: string }[]): string[] {
  const seen = new Map<string, number>();
  return list.map((s) => {
    if (s.id !== undefined) return s.id;
    const base = supplementId(s);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

/** Case/whitespace-insensitive key used to detect the same supplement listed twice at one time. */
function supplementKey(s: { id?: string; name: string; time: string }): string {
  return s.id ?? `${s.name.trim().toLowerCase().replace(/\s+/g, ' ')}@${s.time}`;
}

/** Largest profile JSON text accepted by parseProfileJson (characters, ≈ bytes for ASCII). */
export const MAX_PROFILE_JSON_CHARS = 256 * 1024;

/** Fill in generated ids and defaults; returns a deep copy. */
export function normalizeProfile(input: Profile): Profile {
  const p: Profile = JSON.parse(JSON.stringify(input));
  const supIds = supplementIds(p.supplements);
  p.supplements = p.supplements.map((s, i) => ({ ...s, id: supIds[i] }));
  if (p.user.city === '') delete p.user.city;
  if (p.user.cuisine === '') delete p.user.cuisine;
  if (p.workout.location === '') delete p.workout.location;
  if (p.nutritionTargets) {
    if (!p.nutritionTargets.kcal) delete p.nutritionTargets.kcal;
    if (!p.nutritionTargets.proteinG) delete p.nutritionTargets.proteinG;
    if (Object.keys(p.nutritionTargets).length === 0) delete p.nutritionTargets;
  }
  return p;
}

/** Validate unknown JSON against the profile schema plus semantic checks. */
export function validateProfile(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!validateFn(input)) {
    for (const e of validateFn.errors ?? []) errors.push(formatError(e));
    return { ok: false, errors };
  }
  const p = input as Profile;
  if (p.fasting.enabled && p.fasting.eatStart === p.fasting.eatEnd) errors.push('fasting: eatStart and eatEnd cannot be the same time');
  if (p.sleep.bedtime === p.sleep.wake) errors.push('sleep: bedtime and wake cannot be the same time');
  if (p.workout.enabled && hhmmToMinutes(p.workout.start) === hhmmToMinutes(p.workout.end)) errors.push('workout: start and end cannot be the same time');
  if (p.workout.enabled && p.workout.days.length === 0) errors.push('workout: at least one day is required when enabled');
  const keys = new Set<string>();
  for (const s of p.supplements) {
    const key = supplementKey(s);
    if (keys.has(key)) errors.push(`supplements: duplicate "${s.name}" at ${s.time}`);
    keys.add(key);
  }
  for (const h of p.habits) {
    if (h.schedule === 'weekdays' && !h.days?.length) errors.push(`habits: "${h.name}" uses weekdays but has no days`);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, profile: normalizeProfile(p), errors: [] };
}

export function parseProfileJson(text: string): ValidationResult {
  if (text.length > MAX_PROFILE_JSON_CHARS) {
    return { ok: false, errors: [`Profile file is too large (${Math.round(text.length / 1024)} KB; the limit is ${MAX_PROFILE_JSON_CHARS / 1024} KB)`] };
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (e) {
    return { ok: false, errors: [`Not valid JSON: ${(e as Error).message}`] };
  }
  return validateProfile(parsed);
}

export interface DiffEntry {
  path: string;
  before: string;
  after: string;
  kind: 'added' | 'removed' | 'changed';
}

function stringify(v: unknown): string {
  if (v === undefined) return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/** Flat, human-readable diff between two profiles (shown before an import overwrites). */
export function diffProfiles(before: Profile | null, after: Profile): DiffEntry[] {
  const out: DiffEntry[] = [];
  const flatten = (obj: unknown, prefix: string, into: Map<string, unknown>) => {
    if (obj === null || obj === undefined) return;
    if (Array.isArray(obj)) {
      if (prefix === 'supplements') {
        const list = obj as Supplement[];
        const ids = supplementIds(list);
        list.forEach((s, i) => into.set(`supplements[${ids[i]}]`, `${s.name} · ${s.dose} · ${s.time}${s.alarm ? ' · alarm' : ''}`));
        return;
      }
      if (prefix === 'habits') {
        // Keyed by slug, with an index suffix when two habits share one, so neither entry is swallowed.
        const seen = new Map<string, number>();
        for (const h of obj as ProfileHabit[]) {
          const base = slug(h.name);
          const n = (seen.get(base) ?? 0) + 1;
          seen.set(base, n);
          into.set(
            `habits[${n === 1 ? base : `${base}#${n}`}]`,
            `${h.name} · ${h.schedule}${h.targetPerWeek ? ` ${h.targetPerWeek}×/wk` : ''}${h.days ? ` ${h.days.join(',')}` : ''}`,
          );
        }
        return;
      }
      into.set(prefix, obj);
      return;
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) flatten(v, prefix ? `${prefix}.${k}` : k, into);
      return;
    }
    into.set(prefix, obj);
  };
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  if (before) flatten(before, '', a);
  flatten(after, '', b);
  for (const k of [...new Set([...a.keys(), ...b.keys()])].sort()) {
    const va = a.get(k);
    const vb = b.get(k);
    const sa = stringify(va);
    const sb = stringify(vb);
    if (sa === sb) continue;
    out.push({ path: k, before: sa, after: sb, kind: va === undefined ? 'added' : vb === undefined ? 'removed' : 'changed' });
  }
  return out;
}

export function emptyProfile(): Profile {
  return {
    schemaVersion: 1,
    user: {
      name: '',
      age: 30,
      sex: 'other',
      heightCm: 170,
      currentWeightKg: 70,
      targetWeightKg: 70,
      activityLevel: 'light',
      dietType: 'veg',
      appearanceGoals: '',
    },
    fasting: { enabled: false, eatStart: '12:00', eatEnd: '20:00' },
    sleep: { bedtime: '23:00', wake: '06:30' },
    water: { targetMl: 2500 },
    workout: { enabled: true, start: '07:00', end: '07:45', days: ['mon', 'tue', 'wed', 'thu', 'fri'], alarm: false },
    supplements: [],
    habits: [],
    notifications: {
      motivational: { enabled: true, times: ['08:00', '20:00'] },
      fastingWarningMinutesBefore: 30,
      supplementAlarms: true,
      workoutAlarm: true,
      habitReminders: true,
      eveningCheckIn: '20:30',
      waterReminders: true,
      waterReminderIntervalMin: 90,
      fastingWindow: true,
      pinnedChecklist: true,
    },
    privacy: { photoConsent: false, driveBackup: false, futureLookCloud: false },
    preferences: { heightUnit: 'cm', weightUnit: 'kg', theme: 'system' },
  };
}

export function exportProfileJson(profile: Profile): string {
  return JSON.stringify(profile, null, 2);
}

const EMOJI_HINTS: [RegExp, string][] = [
  [/workout|gym|exercise|train/i, '🏋️'],
  [/walk|steps|run|jog|cricket|sport|activity/i, '🏃'],
  [/water|hydrat/i, '💧'],
  [/sleep|bed|wake/i, '⏰'],
  [/fast|dinner|breakfast|IF\b/i, '⏳'],
  [/read|book/i, '📖'],
  [/meditat|yoga|breath/i, '🧘'],
  [/sugar|tea|coffee/i, '🍵'],
];

const COLORS = ['#22a566', '#f97316', '#8b5cf6', '#0ea5e9', '#e11d48', '#eab308', '#14b8a6', '#6366f1'];

/** Convert the profile's habit list into app habits (used at onboarding / import). */
export function habitsFromProfile(profile: Profile, startOrder = 0): Habit[] {
  const today = todayISO();
  return profile.habits.map((h, i) => {
    const emoji = h.emoji ?? EMOJI_HINTS.find(([re]) => re.test(h.name))?.[1] ?? '✅';
    const kind: Habit['kind'] = /workout|gym|exercise/i.test(h.name)
      ? 'workout'
      : /water/i.test(h.name)
        ? 'water'
        : /fast|IF\b|dinner before|skip breakfast/i.test(h.name)
          ? 'fasting'
          : /sleep|bed|wake/i.test(h.name)
            ? 'sleep'
            : 'generic';
    const reminder = h.reminder ?? (kind === 'workout' && profile.workout.enabled ? profile.workout.start : null);
    return {
      id: newId('hab'),
      name: h.name,
      emoji,
      color: COLORS[(startOrder + i) % COLORS.length],
      kind,
      schedule:
        h.schedule === 'weekly'
          ? { type: 'times_per_week', timesPerWeek: h.targetPerWeek ?? 1 }
          : h.schedule === 'weekdays'
            ? { type: 'weekdays', weekdays: dayNamesToWeekdays(h.days ?? []) }
            : { type: 'daily' },
      reminderTime: reminder,
      reminderEnabled: !!h.reminder,
      pinned: true,
      archived: false,
      createdAt: today,
      sortOrder: startOrder + i,
      xp: 10,
    };
  });
}

/** Write current app habits back into the profile JSON shape (for export). */
export function habitsToProfile(habits: Habit[]): ProfileHabit[] {
  return habits
    .filter((h) => !h.archived)
    .map((h) => {
      const out: ProfileHabit = { name: h.name, schedule: 'daily', emoji: h.emoji };
      if (h.schedule.type === 'times_per_week') {
        out.schedule = 'weekly';
        out.targetPerWeek = h.schedule.timesPerWeek ?? 1;
      } else if (h.schedule.type === 'weekdays') {
        out.schedule = 'weekdays';
        out.days = (h.schedule.weekdays ?? []).map(weekdayToDayName);
      }
      if (h.reminderEnabled && h.reminderTime) out.reminder = h.reminderTime;
      return out;
    });
}
