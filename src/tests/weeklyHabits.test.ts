import { describe, expect, it } from 'vitest';
import type { Habit, HabitLog } from '../types';
import { habitDueOn, weekProgress } from '../utils/schedule';

const habit = (schedule: Habit['schedule'], createdAt = '2026-01-01'): Habit => ({
  id: 'h1',
  name: 'Gym',
  emoji: '🏋️',
  color: '#000',
  kind: 'custom',
  schedule,
  reminderTime: null,
  reminderEnabled: false,
  pinned: true,
  archived: false,
  createdAt,
  sortOrder: 0,
  xp: 10,
});
const log = (date: string, status: HabitLog['status'] = 'done'): HabitLog => ({ habitId: 'h1', date, status, loggedAt: date });

// 2026-11-16 is a Monday; the week runs to Sunday 2026-11-22.
describe('weekly (N× per week) habits', () => {
  const weekly = habit({ type: 'times_per_week', timesPerWeek: 2 });

  it('counts only done entries inside the Mon–Sun week', () => {
    const logs = [log('2026-11-15'), log('2026-11-16'), log('2026-11-17', 'skip'), log('2026-11-22')];
    expect(weekProgress(weekly.schedule, logs, '2026-11-18')).toEqual({ done: 2, target: 2, met: true });
    expect(weekProgress(weekly.schedule, logs, '2026-11-15')).toEqual({ done: 1, target: 2, met: false });
  });

  it('is null for daily and weekday schedules', () => {
    expect(weekProgress({ type: 'daily' }, [], '2026-11-18')).toBeNull();
    expect(weekProgress({ type: 'weekdays', weekdays: [1] }, [], '2026-11-18')).toBeNull();
  });

  it('is due until the weekly target is met, then drops off days without an entry', () => {
    expect(habitDueOn(weekly, [log('2026-11-16')], '2026-11-18')).toBe(true);
    const met = [log('2026-11-16'), log('2026-11-17')];
    expect(habitDueOn(weekly, met, '2026-11-18')).toBe(false);
    // the day that completed the target still shows (as done)
    expect(habitDueOn(weekly, met, '2026-11-17')).toBe(true);
    // a new week starts open again
    expect(habitDueOn(weekly, met, '2026-11-23')).toBe(true);
  });

  it('daily habits stay due every day; nothing is due before the start date', () => {
    expect(habitDueOn(habit({ type: 'daily' }), [log('2026-11-17')], '2026-11-18')).toBe(true);
    expect(habitDueOn(habit({ type: 'daily' }, '2026-11-19'), [], '2026-11-18')).toBe(false);
  });
});
