import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { diffProfiles, parseProfileJson, starterHabits, validateProfile } from '../logic/profile';
import type { Profile } from '../types';

const sample = JSON.parse(readFileSync(new URL('../../sample/suresh_profile.json', import.meta.url), 'utf8')) as Profile;

describe('profile schema', () => {
  it('accepts the shipped sample profile', () => {
    const r = validateProfile(sample);
    expect(r.ok).toBe(true);
    expect(r.profile?.name).toBe('Suresh');
    expect(r.profile?.supplements[0].time).toBe('06:40');
  });

  it('rejects bad times and unknown fields', () => {
    const bad = { ...sample, fasting: { enabled: true, start: '25:00', end: '12:00' }, extra: 1 };
    const r = validateProfile(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('fasting.start'))).toBe(true);
    expect(r.errors.some((e) => e.includes('unknown field'))).toBe(true);
  });

  it('rejects missing required fields', () => {
    const { waterTargetMl: _omit, ...rest } = sample;
    void _omit;
    const r = validateProfile(rest);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('waterTargetMl');
  });

  it('rejects duplicate supplement ids', () => {
    const r = validateProfile({ ...sample, supplements: [sample.supplements[0], sample.supplements[0]] });
    expect(r.ok).toBe(false);
  });

  it('reports JSON syntax errors', () => {
    expect(parseProfileJson('{ nope').ok).toBe(false);
  });

  it('diffs changed, added and removed values', () => {
    const next: Profile = { ...sample, targetWeightKg: 72, supplements: sample.supplements.slice(1), city: undefined };
    const d = diffProfiles(sample, next);
    expect(d.find((x) => x.path === 'targetWeightKg')?.kind).toBe('changed');
    expect(d.find((x) => x.path.startsWith('supplements[sup_morning_juice]'))?.kind).toBe('removed');
    expect(d.find((x) => x.path === 'city')?.kind).toBe('removed');
  });

  it('derives starter habits from the profile', () => {
    const habits = starterHabits(sample);
    const workout = habits.find((h) => h.kind === 'workout');
    expect(workout?.schedule.type).toBe('weekdays');
    expect(workout?.schedule.weekdays).toEqual(sample.workout.days);
    expect(workout?.reminderTime).toBe(sample.workout.start);
    expect(habits.some((h) => h.kind === 'fasting')).toBe(true);
  });
});
