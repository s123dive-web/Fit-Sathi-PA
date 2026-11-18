import { getDb } from '../db/database';
import { FitBackup } from '../native/plugins';
import { todayISO } from '../utils/dates';

type Row = Record<string, unknown>;
type Dump = Record<string, Row[]>;

export const CSV_HEADER = ['date', 'type', 'item', 'value', 'unit', 'detail'] as const;

/** Quote a cell; text that a spreadsheet would run as a formula (= + - @) is prefixed with an apostrophe. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s = String(v);
  if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const num = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const round1 = (v: unknown): number => Math.round(num(v) * 10) / 10;

/**
 * One long table, one row per logged fact, sorted by date: easy to filter or pivot in any spreadsheet.
 * Water is summed per day; everything else is one row per entry. Pure, unit-tested.
 */
export function buildCsv(dump: Dump): string {
  const habitName = new Map((dump.habits ?? []).map((h) => [String(h.id), String(h.name ?? '')]));
  const supName = new Map((dump.supplements ?? []).map((s) => [String(s.id), String(s.name ?? '')]));
  const rows: unknown[][] = [];

  for (const l of dump.habit_logs ?? []) rows.push([l.date, 'habit', habitName.get(String(l.habit_id)) ?? l.habit_id, l.status, '', l.note ?? '']);
  for (const l of dump.supplement_logs ?? []) rows.push([l.date, 'supplement', supName.get(String(l.supplement_id)) ?? l.supplement_id, 'taken', '', '']);
  const water = new Map<string, number>();
  for (const l of dump.water_logs ?? []) water.set(String(l.date), (water.get(String(l.date)) ?? 0) + num(l.ml));
  for (const [date, ml] of water) rows.push([date, 'water', '', ml, 'ml', '']);
  for (const l of dump.weight_logs ?? []) rows.push([l.date, 'weight', '', num(l.kg), 'kg', '']);
  for (const l of dump.meal_logs ?? []) {
    const detail = `time ${String(l.time ?? '')}; servings ${num(l.servings)}; protein ${round1(l.protein_g)} g; carbs ${round1(l.carbs_g)} g; fat ${round1(l.fat_g)} g`;
    rows.push([l.date, 'meal', l.food_name, Math.round(num(l.kcal)), 'kcal', detail]);
  }
  for (const l of dump.steps ?? []) rows.push([l.date, 'steps', '', num(l.steps), 'steps', '']);

  rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])) || String(a[1]).localeCompare(String(b[1])));
  return [CSV_HEADER.join(','), ...rows.map((r) => r.map(csvCell).join(','))].join('\r\n') + '\r\n';
}

/** Save the logs as a CSV through the system file picker. The leading BOM makes Excel read it as UTF-8. */
export async function exportCsv(): Promise<boolean> {
  const db = await getDb();
  const csv = buildCsv(await db.exportAll());
  const res = await FitBackup.saveDocument({ filename: `fitsaathi-logs-${todayISO()}.csv`, mimeType: 'text/csv', data: String.fromCharCode(0xfeff) + csv });
  return res.saved;
}
