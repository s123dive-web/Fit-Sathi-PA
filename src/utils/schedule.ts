import type { Habit, HabitLog, HabitSchedule, ISODate } from '../types';
import { addDays, isoWeekday, weekStart } from './dates';

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

export interface WeekProgress {
  done: number;
  target: number;
  met: boolean;
}

/**
 * Progress of an "N times per week" habit in the Mon–Sun week containing `date`; null for other schedules.
 * `logs` may hold other habits' or other weeks' entries only if pre-filtered to this habit.
 */
export function weekProgress(schedule: HabitSchedule, logs: Pick<HabitLog, 'date' | 'status'>[], date: ISODate): WeekProgress | null {
  if (schedule.type !== 'times_per_week') return null;
  const from = weekStart(date);
  const to = addDays(from, 6);
  const target = weeklyFrequency(schedule);
  const done = logs.filter((l) => l.status === 'done' && l.date >= from && l.date <= to).length;
  return { done, target, met: done >= target };
}

/**
 * Whether the habit still asks for attention on `date`. A weekly habit whose target is already met and that
 * has no entry on `date` is not due: it must not count as an open item on Today, the widget or the notification.
 */
export function habitDueOn(habit: Habit, logs: Pick<HabitLog, 'date' | 'status'>[], date: ISODate): boolean {
  if (!habitActiveOn(habit, date)) return false;
  const wp = weekProgress(habit.schedule, logs, date);
  if (!wp || !wp.met) return true;
  return logs.some((l) => l.date === date);
}
