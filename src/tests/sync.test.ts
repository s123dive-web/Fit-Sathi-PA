import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildAlarms } from '../services/sync';
import { starterHabits } from '../logic/profile';
import type { Profile } from '../types';

const sample = JSON.parse(readFileSync(new URL('../../sample/suresh_profile.json', import.meta.url), 'utf8')) as Profile;

describe('alarm set from profile + habits', () => {
  it('creates one alarm per supplement with alarm=true, at the right time', () => {
    const alarms = buildAlarms(sample, []);
    const sup = alarms.filter((a) => a.kind === 'supplement');
    expect(sup).toHaveLength(sample.supplements.filter((s) => s.alarm).length);
    const juice = sup.find((a) => a.refId === 'sup_morning_juice');
    expect(juice?.hour).toBe(6);
    expect(juice?.minute).toBe(40);
    expect(juice?.alarmClock).toBe(true);
  });

  it('adds habit reminders only when enabled, with weekday restriction', () => {
    const habits = starterHabits(sample);
    const alarms = buildAlarms(sample, habits);
    const workout = alarms.find((a) => a.id.startsWith('hab:') && a.title.includes('Workout'));
    expect(workout?.days).toEqual(sample.workout.days);
    expect(workout?.actions).toContain('skip');
  });

  it('spaces water reminders within waking hours and adds fasting edges', () => {
    const alarms = buildAlarms(sample, []);
    const water = alarms.filter((a) => a.kind === 'water');
    expect(water.length).toBeGreaterThan(5);
    for (const w of water) {
      const mins = w.hour * 60 + w.minute;
      expect(mins).toBeGreaterThan(6 * 60); // after wake 06:00
      expect(mins).toBeLessThan(22 * 60 + 30); // before sleep 22:30
    }
    expect(alarms.some((a) => a.id === 'fast:start' && a.hour === 20)).toBe(true);
    expect(alarms.some((a) => a.id === 'fast:end' && a.hour === 12)).toBe(true);
  });

  it('honours preference toggles', () => {
    const p: Profile = { ...sample, preferences: { ...sample.preferences, waterReminders: false, fastingNotifications: false } };
    const alarms = buildAlarms(p, []);
    expect(alarms.some((a) => a.kind === 'water')).toBe(false);
    expect(alarms.some((a) => a.kind === 'fasting')).toBe(false);
  });
});
