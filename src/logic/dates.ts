import type { HHMM, ISODate, Weekday } from '../types';

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

export function toISODate(d: Date): ISODate {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO(now: Date = new Date()): ISODate {
  return toISODate(now);
}

export function parseISODate(iso: ISODate): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

export function addDays(iso: ISODate, days: number): ISODate {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function diffDays(a: ISODate, b: ISODate): number {
  const ms = parseISODate(b).getTime() - parseISODate(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** ISO weekday: 1 = Monday ... 7 = Sunday */
export function isoWeekday(iso: ISODate): Weekday {
  const js = parseISODate(iso).getDay(); // 0 = Sunday
  return (js === 0 ? 7 : js) as Weekday;
}

/** Monday of the ISO week containing `iso`. */
export function weekStart(iso: ISODate): ISODate {
  const wd = isoWeekday(iso);
  return addDays(iso, -(wd - 1));
}

export function weekEnd(iso: ISODate): ISODate {
  return addDays(weekStart(iso), 6);
}

export function eachDay(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  let cur = from;
  let guard = 0;
  while (cur <= to && guard < 20_000) {
    out.push(cur);
    cur = addDays(cur, 1);
    guard += 1;
  }
  return out;
}

export function parseHHMM(t: HHMM): { h: number; m: number } {
  const [h, m] = t.split(':').map(Number);
  return { h, m };
}

export function hhmmToMinutes(t: HHMM): number {
  const { h, m } = parseHHMM(t);
  return h * 60 + m;
}

export function minutesToHHMM(mins: number): HHMM {
  const m = ((mins % 1440) + 1440) % 1440;
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

export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(sec)}`;
}

export function formatDateShort(iso: ISODate): string {
  const d = parseISODate(iso);
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

export function formatDateLong(iso: ISODate): string {
  const d = parseISODate(iso);
  return d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
  7: 'Sun',
};

export function nowHHMM(now: Date = new Date()): HHMM {
  return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}
