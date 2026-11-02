import Ajv, { type ErrorObject } from 'ajv';
import addFormats from 'ajv-formats';
import schema from '../schema/profile.schema.json';
import type { Habit, HHMM, Profile, Weekday } from '../types';
import { newId } from './ids';
import { todayISO } from './dates';

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

/** Validate unknown JSON against the profile schema plus a few semantic checks. */
export function validateProfile(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!validateFn(input)) {
    for (const e of validateFn.errors ?? []) errors.push(formatError(e));
    return { ok: false, errors };
  }
  const p = input as Profile;
  if (p.fasting.enabled && p.fasting.start === p.fasting.end) {
    errors.push('fasting: start and end cannot be the same time');
  }
  if (p.sleep.start === p.sleep.end) errors.push('sleep: start and end cannot be the same time');
  if (p.workout.start === p.workout.end) errors.push('workout: start and end cannot be the same time');
  const ids = new Set<string>();
  for (const s of p.supplements) {
    if (ids.has(s.id)) errors.push(`supplements: duplicate id "${s.id}"`);
    ids.add(s.id);
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, profile: p, errors: [] };
}

export function parseProfileJson(text: string): ValidationResult {
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

/** Flat, human-readable diff between two profiles (used before an import overwrites). */
export function diffProfiles(before: Profile | null, after: Profile): DiffEntry[] {
  const out: DiffEntry[] = [];
  const flatten = (obj: unknown, prefix: string, into: Map<string, unknown>) => {
    if (obj === null || obj === undefined) return;
    if (Array.isArray(obj)) {
      if (prefix === 'supplements') {
        for (const s of obj as Profile['supplements']) into.set(`supplements[${s.id}]`, `${s.name} · ${s.dose} · ${s.time}${s.alarm ? ' · alarm' : ''}`);
        return;
      }
      into.set(prefix, obj);
      return;
    }
    if (typeof obj === 'object') {
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        flatten(v, prefix ? `${prefix}.${k}` : k, into);
      }
      return;
    }
    into.set(prefix, obj);
  };
  const a = new Map<string, unknown>();
  const b = new Map<string, unknown>();
  if (before) flatten(before, '', a);
  flatten(after, '', b);
  const keys = new Set([...a.keys(), ...b.keys()]);
  for (const k of [...keys].sort()) {
    const va = a.get(k);
    const vb = b.get(k);
    const sa = stringify(va);
    const sb = stringify(vb);
    if (sa === sb) continue;
    out.push({
      path: k,
      before: sa,
      after: sb,
      kind: va === undefined ? 'added' : vb === undefined ? 'removed' : 'changed',
    });
  }
  return out;
}

export function emptyProfile(): Profile {
  return {
    schemaVersion: 1,
    name: '',
    age: 30,
    sex: 'other',
    city: '',
    height: { value: 170, unit: 'cm' },
    currentWeightKg: 70,
    targetWeightKg: 70,
    activityLevel: 'light',
    dietType: 'vegetarian',
    fasting: { enabled: false, start: '20:00', end: '12:00' },
    sleep: { start: '23:00', end: '06:30' },
    waterTargetMl: 2500,
    supplements: [],
    workout: { start: '07:00', end: '07:45', days: [1, 2, 3, 4, 5] },
    appearanceGoals: '',
    photoConsent: false,
    preferences: {
      weightUnit: 'kg',
      theme: 'system',
      waterReminderIntervalMin: 90,
      habitReminderTime: '20:30',
      fastingNotifications: true,
      waterReminders: true,
    },
  };
}

export function exportProfileJson(profile: Profile): string {
  return JSON.stringify(profile, null, 2);
}

/** Starter habits derived from the profile. Only created when the user opts in during onboarding. */
export function starterHabits(profile: Profile): Habit[] {
  const today = todayISO();
  const habits: Habit[] = [];
  let order = 0;
  const mk = (
    name: string,
    emoji: string,
    color: string,
    kind: Habit['kind'],
    schedule: Habit['schedule'],
    reminderTime: HHMM | null,
  ): Habit => ({
    id: newId('hab'),
    name,
    emoji,
    color,
    kind,
    schedule,
    reminderTime,
    reminderEnabled: reminderTime !== null,
    pinned: true,
    archived: false,
    createdAt: today,
    sortOrder: order++,
    xp: 10,
  });
  const days: Weekday[] = profile.workout.days.length ? profile.workout.days : [1, 2, 3, 4, 5];
  habits.push(mk('Workout', '🏋️', '#f97316', 'workout', { type: 'weekdays', weekdays: days }, profile.workout.start));
  if (profile.fasting.enabled) {
    habits.push(mk('Kept fasting window', '⏳', '#8b5cf6', 'fasting', { type: 'daily' }, null));
  }
  habits.push(mk(`In bed by ${profile.sleep.start}`, '😴', '#0ea5e9', 'sleep', { type: 'daily' }, profile.sleep.start));
  habits.push(mk('10k steps / walk', '🚶', '#22c55e', 'generic', { type: 'times_per_week', timesPerWeek: 5 }, null));
  habits.push(mk('No sugar in tea/coffee', '🍵', '#e11d48', 'generic', { type: 'daily' }, null));
  return habits;
}
