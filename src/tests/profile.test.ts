import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { diffProfiles, habitsFromProfile, habitsToProfile, parseProfileJson, supplementId, validateProfile } from '../utils/profile';
import type { Profile } from '../types';

const sample = JSON.parse(readFileSync(new URL('../../sample/suresh_profile.json', import.meta.url), 'utf8')) as Profile;

describe('profile schema', () => {
  it('accepts the shipped sample profile and fills supplement ids', () => {
    const r = validateProfile(sample);
    expect(r.ok).toBe(true);
    expect(r.profile?.user.name).toBe('Suresh');
    expect(r.profile?.supplements.map((s) => s.time)).toEqual(['06:40', '13:55', '17:45']);
    const ids = r.profile!.supplements.map((s) => s.id);
    expect(new Set(ids).size).toBe(3); // two "Sea buckthorn juice" entries get distinct ids via time
    expect(ids[0]).toBe(supplementId({ name: 'Sea buckthorn juice', time: '06:40' }));
  });

  it('rejects bad times and unknown fields', () => {
    const bad = { ...sample, fasting: { enabled: true, eatStart: '25:00', eatEnd: '19:00' }, extra: 1 };
    const r = validateProfile(bad);
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => e.includes('fasting.eatStart'))).toBe(true);
    expect(r.errors.some((e) => e.includes('unknown field'))).toBe(true);
  });

  it('rejects missing required fields', () => {
    const { water: _omit, ...rest } = sample;
    void _omit;
    const r = validateProfile(rest);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toContain('water');
  });

  it('rejects duplicate supplements (same name + time)', () => {
    const r = validateProfile({ ...sample, supplements: [sample.supplements[0], sample.supplements[0]] });
    expect(r.ok).toBe(false);
  });

  it('rejects weekday habits without days', () => {
    const r = validateProfile({ ...sample, habits: [{ name: 'X', schedule: 'weekdays' }] });
    expect(r.ok).toBe(false);
  });

  it('reports JSON syntax errors', () => {
    expect(parseProfileJson('{ nope').ok).toBe(false);
  });

  it('diffs changed, added and removed values', () => {
    const next: Profile = { ...sample, user: { ...sample.user, targetWeightKg: 68, cuisine: undefined }, supplements: sample.supplements.slice(1) };
    const d = diffProfiles(sample, next);
    expect(d.find((x) => x.path === 'user.targetWeightKg')?.kind).toBe('changed');
    expect(d.find((x) => x.path.startsWith('supplements[sup_sea_buckthorn_juice_0640]'))?.kind).toBe('removed');
    expect(d.find((x) => x.path === 'user.cuisine')?.kind).toBe('removed');
  });

  it('converts profile habits to app habits and back', () => {
    const habits = habitsFromProfile(sample);
    expect(habits).toHaveLength(sample.habits.length);
    const workout = habits.find((h) => h.name === '45-min home workout');
    expect(workout?.kind).toBe('workout');
    expect(workout?.schedule.type).toBe('daily');
    expect(workout?.reminderTime).toBe('05:30');
    const cricket = habits.find((h) => h.name.startsWith('Weekend cricket'));
    expect(cricket?.schedule).toEqual({ type: 'times_per_week', timesPerWeek: 1 });
    const round = habitsToProfile(habits);
    expect(round.map((h) => [h.name, h.schedule, h.targetPerWeek])).toEqual(sample.habits.map((h) => [h.name, h.schedule, h.targetPerWeek]));
  });
});
