import { addDays as dfAddDays, differenceInCalendarDays, eachDayOfInterval, format, getISODay, parseISO, startOfISOWeek } from 'date-fns';
import type { DayName, HHMM, ISODate, Weekday } from '../types';

/**
 * Dates are stored as local calendar days (YYYY-MM-DD) and local HH:MM.
 * The device's zone (Asia/Kolkata for the owner) is used for all display; timestamps are ISO strings.
 */

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toISODate(d: Date): ISODate {
  return format(d, 'yyyy-MM-dd');
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function parseISODate(iso: ISODate): Date {
  return parseISO(iso); // date-only ISO strings parse as local midnight
}

export function addDays(iso: ISODate, days: number): ISODate {
  return toISODate(dfAddDays(parseISODate(iso), days));
}

export function diffDays(a: ISODate, b: ISODate): number {
  return differenceInCalendarDays(parseISODate(b), parseISODate(a));
}

/** ISO weekday: 1 = Monday ... 7 = Sunday */
export function isoWeekday(iso: ISODate): Weekday {
  return getISODay(parseISODate(iso)) as Weekday;
}

export function weekStart(iso: ISODate): ISODate {
  return toISODate(startOfISOWeek(parseISODate(iso)));
}

export function weekEnd(iso: ISODate): ISODate {
  return addDays(weekStart(iso), 6);
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  if (to < from) return [];
  return eachDayOfInterval({ start: parseISODate(from), end: parseISODate(to) }).map(toISODate);
}

const HHMM_RE = /^(\d{1,2}):(\d{2})$/;

/** True for a well-formed 24-hour "HH:MM" (a single-digit hour is tolerated). */
export function isValidHHMM(t: unknown): t is HHMM {
  if (typeof t !== 'string') return false;
  const m = HHMM_RE.exec(t);
  if (!m) return false;
  return Number(m[1]) < 24 && Number(m[2]) < 60;
}

/** Parse "HH:MM". Malformed input (screens call this on raw user input) yields 00:00 rather than NaN. */
export function parseHHMM(t: HHMM): { h: number; m: number } {
  if (!isValidHHMM(t)) return { h: 0, m: 0 };
  const [h, m] = t.split(':').map(Number);
  return { h, m };
}

export function hhmmToMinutes(t: HHMM): number {
  const { h, m } = parseHHMM(t);
  return h * 60 + m;
}

export function minutesToHHMM(mins: number): HHMM {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

export function minutesOfDay(d: Date): number {
  return d.getHours() * 60 + d.getMinutes() + d.getSeconds() / 60;
}

export function formatHHMM12(t: HHMM): string {
  const { h, m } = parseHHMM(t);
  const suffix = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${pad2(m)} ${suffix}`;
}

let hour12Override: boolean | null = null;

/** Whether the device prefers a 12-hour clock (Intl); overridable for tests / settings. */
export function prefers12h(): boolean {
  if (hour12Override !== null) return hour12Override;
  try {
    const opts = new Intl.DateTimeFormat(undefined, { hour: 'numeric' }).resolvedOptions();
    return opts.hour12 ?? (opts.hourCycle === 'h12' || opts.hourCycle === 'h11');
  } catch {
    return false;
  }
}

export function setHour12Override(v: boolean | null): void {
  hour12Override = v;
}

/** The one user-facing time formatter: honours the device 12/24 h preference. */
export function formatTime(t: HHMM): string {
  return prefers12h() ? formatHHMM12(t) : t;
}

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

export function formatDateShort(iso: ISODate): string {
  return format(parseISODate(iso), 'd MMM');
}

export function formatDateLong(iso: ISODate): string {
  return format(parseISODate(iso), 'EEE, d MMM yyyy');
}

export const WEEKDAY_LABELS: Record<Weekday, string> = { 1: 'Mon', 2: 'Tue', 3: 'Wed', 4: 'Thu', 5: 'Fri', 6: 'Sat', 7: 'Sun' };

const DAY_NAMES: DayName[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function dayNameToWeekday(d: DayName): Weekday {
  return (DAY_NAMES.indexOf(d) + 1) as Weekday;
}

export function weekdayToDayName(w: Weekday): DayName {
  return DAY_NAMES[w - 1];
}

export function dayNamesToWeekdays(days: DayName[]): Weekday[] {
  return [...new Set(days.map(dayNameToWeekday))].sort((a, b) => a - b) as Weekday[];
}

export function nowHHMM(now: Date = new Date()): HHMM {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
