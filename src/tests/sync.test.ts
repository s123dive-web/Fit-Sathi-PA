import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildAlarms, MAX_MOTIVATION_TIMES_PER_DAY } from '../services/sync';
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

  it('marks only supplements and the workout as exact alarms; every other reminder is inexact', () => {
    const alarms = buildAlarms(sample, habitsFromProfile(sample));
    for (const a of alarms) {
      if (a.kind === 'supplement' || a.kind === 'workout') expect(a.exact).toBe(true);
      else expect(a.exact).toBe(false);
    }
    expect(alarms.filter((a) => a.exact).length).toBeLessThanOrEqual(4);
  });

  it('renders alarm copy through i18n (no hardcoded English fallback keys leak)', () => {
    const alarms = buildAlarms(sample, habitsFromProfile(sample));
    for (const a of alarms) {
      expect(a.title).not.toMatch(/^alarms\./);
      expect(a.body).not.toMatch(/^alarms\./);
      expect(a.title.length).toBeGreaterThan(0);
    }
    expect(MAX_MOTIVATION_TIMES_PER_DAY).toBe(2);
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

  it('rests a weekly habit reminder until next Monday once the week target is met', () => {
    const gym = {
      ...habitsFromProfile(sample)[0],
      id: 'h_gym',
      kind: 'custom' as const,
      schedule: { type: 'times_per_week' as const, timesPerWeek: 2 },
      reminderEnabled: true,
      reminderTime: '18:00',
      archived: false,
    };
    const log = (date: string) => ({ habitId: 'h_gym', date, status: 'done' as const, loggedAt: date });
    // 2026-11-18 is a Wednesday; its week starts Mon 16 and the next one Mon 23.
    const open = buildAlarms(sample, [gym], { today: '2026-11-18', logs: [log('2026-11-16')] }).find((a) => a.id === 'hab:h_gym');
    expect(open?.notBefore).toBeUndefined();
    const met = buildAlarms(sample, [gym], { today: '2026-11-18', logs: [log('2026-11-16'), log('2026-11-17')] }).find((a) => a.id === 'hab:h_gym');
    expect(met?.notBefore).toBe('2026-11-23');
  });
});
