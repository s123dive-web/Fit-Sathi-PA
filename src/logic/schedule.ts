import type { Habit, HabitSchedule, ISODate } from '../types';
import { isoWeekday } from './dates';

/** Whether a habit is expected on a given day (for daily / weekday schedules). times_per_week is always "available". */
export function isScheduledOn(schedule: HabitSchedule, date: ISODate): boolean {
  switch (schedule.type) {
    case 'daily':
      return true;
    case 'weekdays':
      return (schedule.weekdays ?? []).includes(isoWeekday(date));
    case 'times_per_week':
      return true;
    default:
      return true;
  }
}

/** Expected completions per 7 days, used for frequency-aware decay. */
export function weeklyFrequency(schedule: HabitSchedule): number {
  switch (schedule.type) {
    case 'daily':
      return 7;
    case 'weekdays':
      return Math.max(1, (schedule.weekdays ?? []).length);
    case 'times_per_week':
      return Math.min(7, Math.max(1, schedule.timesPerWeek ?? 3));
    default:
      return 7;
  }
}

export function describeSchedule(schedule: HabitSchedule): string {
  switch (schedule.type) {
    case 'daily':
      return 'Every day';
    case 'times_per_week':
      return `${schedule.timesPerWeek ?? 3}× per week`;
    case 'weekdays': {
      const labels = ['', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
      const days = [...(schedule.weekdays ?? [])].sort();
      if (days.length === 7) return 'Every day';
      return days.map((d) => labels[d]).join(' · ');
    }
    default:
      return '';
  }
}

export function habitActiveOn(habit: Habit, date: ISODate): boolean {
  if (habit.archived) return false;
  if (date < habit.createdAt) return false;
  return isScheduledOn(habit.schedule, date);
}
