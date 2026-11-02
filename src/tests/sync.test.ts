import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildAlarms } from '../services/sync';
import { habitsFromProfile, validateProfile } from '../utils/profile';
import type { Profile } from '../types';

const raw = JSON.parse(readFileSync(new URL('../../sample/suresh_profile.json', import.meta.url), 'utf8')) as Profile;
const sample = validateProfile(raw).profile!;

describe('alarm set from profile + habits', () => {
  it('creates the three supplement alarms at 06:40, 13:55 and 17:45 as full-screen alarm clocks', () => {
    const sup = buildAlarms(sample, []).filter((a) => a.kind === 'supplement');
    expect(sup.map((a) => `${a.hour}:${a.minute}`)).toEqual(['6:40', '13:55', '17:45']);
    for (const a of sup) {
      expect(a.alarmClock).toBe(true);
      expect(a.fullScreen).toBe(true);
      expect(a.actions).toContain('done');
      expect(a.actions).toContain('snooze');
    }
  });

  it('creates the daily 05:30 workout alarm', () => {
    const w = buildAlarms(sample, habitsFromProfile(sample)).find((a) => a.kind === 'workout');
    expect(w?.hour).toBe(5);
    expect(w?.minute).toBe(30);
    expect(w?.days).toEqual([]); // every day
    expect(w?.fullScreen).toBe(true);
    expect(w?.actions).toContain('done');
  });

  it('warns 30 minutes before the eating window closes (18:30 for 19:00)', () => {
    const warn = buildAlarms(sample, []).find((a) => a.id === 'fast:warn');
    expect(warn?.hour).toBe(18);
    expect(warn?.minute).toBe(30);
    expect(buildAlarms(sample, []).some((a) => a.id === 'fast:close' && a.hour === 19)).toBe(true);
    expect(buildAlarms(sample, []).some((a) => a.id === 'fast:open' && a.hour === 12)).toBe(true);
  });

  it('spaces water reminders within waking hours', () => {
    const water = buildAlarms(sample, []).filter((a) => a.kind === 'water');
    expect(water.length).toBeGreaterThan(5);
    for (const w of water) {
      const mins = w.hour * 60 + w.minute;
      expect(mins).toBeGreaterThan(6 * 60);
      expect(mins).toBeLessThan(22 * 60 + 30);
    }
  });

  it('honours every channel toggle', () => {
    const off: Profile = {
      ...sample,
      notifications: {
        ...sample.notifications,
        supplementAlarms: false,
        workoutAlarm: false,
        waterReminders: false,
        fastingWindow: false,
        habitReminders: false,
      },
    };
    const alarms = buildAlarms(off, habitsFromProfile(off));
    expect(alarms).toHaveLength(0);
  });
});
