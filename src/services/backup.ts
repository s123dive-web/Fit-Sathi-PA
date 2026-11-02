import { getDb, TABLES } from '../db/database';
import { FitBackup } from '../native/plugins';
import { notifyChange } from '../store/appStore';
import { todayISO } from '../logic/dates';

export interface BackupFile {
  app: 'fitsaathi';
  format: 1;
  exportedAt: string;
  tables: Record<string, Record<string, unknown>[]>;
}

export async function createBackupJson(): Promise<string> {
  const db = await getDb();
  const dump = await db.exportAll();
  const file: BackupFile = { app: 'fitsaathi', format: 1, exportedAt: new Date().toISOString(), tables: dump };
  return JSON.stringify(file);
}

/** Opens the system document picker; the user can pick Google Drive, Downloads, etc. Nothing is uploaded by the app itself. */
export async function exportBackup(): Promise<boolean> {
  const json = await createBackupJson();
  const res = await FitBackup.saveDocument({ filename: `fitsaathi-backup-${todayISO()}.json`, mimeType: 'application/json', data: json });
  return res.saved;
}

export function validateBackup(text: string): { ok: true; file: BackupFile } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not valid JSON' };
  }
  const f = parsed as Partial<BackupFile>;
  if (f.app !== 'fitsaathi' || f.format !== 1 || typeof f.tables !== 'object' || !f.tables) {
    return { ok: false, error: 'Not a FitSaathi backup file' };
  }
  for (const t of Object.keys(f.tables)) {
    if (!(TABLES as readonly string[]).includes(t)) return { ok: false, error: `Unknown table "${t}"` };
    if (!Array.isArray(f.tables[t])) return { ok: false, error: `Table "${t}" is not a list` };
  }
  return { ok: true, file: f as BackupFile };
}

export async function pickBackupFile(): Promise<{ text: string; name: string } | null> {
  const res = await FitBackup.openDocument({ mimeTypes: ['application/json', 'text/plain', '*/*'] });
  if (!res.data) return null;
  return { text: res.data, name: res.name ?? 'backup.json' };
}

export async function restoreBackup(file: BackupFile): Promise<void> {
  const db = await getDb();
  await db.importAll(file.tables);
  await db.persist();
  notifyChange();
}

export function summarizeBackup(file: BackupFile): { label: string; count: number }[] {
  const labels: Record<string, string> = {
    habits: 'Habits',
    habit_logs: 'Habit entries',
    supplement_logs: 'Supplement entries',
    water_logs: 'Water entries',
    weight_entries: 'Weight entries',
    meal_logs: 'Meals',
    photos: 'Photos (metadata)',
    foods: 'Foods',
    weekly_summaries: 'Weekly summaries',
    xp_events: 'XP events',
  };
  return Object.entries(labels).map(([k, label]) => ({ label, count: file.tables[k]?.length ?? 0 }));
}
