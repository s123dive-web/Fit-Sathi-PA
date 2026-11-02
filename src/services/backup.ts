import { getDb, TABLES } from '../db/database';
import { BACKUP_MIGRATIONS, CURRENT_SCHEMA_VERSION } from '../db/migrations';
import { FitBackup } from '../native/plugins';
import { notifyChange } from '../store/appStore';
import { todayISO } from '../utils/dates';
import { decryptJson, encryptJson, type EncryptedPayload } from '../utils/crypto';

export interface BackupFile {
  app: 'fitsaathi';
  format: 2;
  schemaVersion: number;
  exportedAt: string;
  encrypted: boolean;
  /** present when encrypted === false */
  tables?: Record<string, Record<string, unknown>[]>;
  /** present when encrypted === true */
  payload?: EncryptedPayload;
}

export async function createBackup(passphrase: string): Promise<BackupFile> {
  const db = await getDb();
  const dump = await db.exportAll();
  const schemaVersion = await db.schemaVersion();
  const base = { app: 'fitsaathi' as const, format: 2 as const, schemaVersion, exportedAt: new Date().toISOString() };
  if (!passphrase) return { ...base, encrypted: false, tables: dump };
  return { ...base, encrypted: true, payload: await encryptJson(dump, passphrase) };
}

/** Opens the system document picker; the user may pick Google Drive, Downloads, etc. The app never uploads anything itself. */
export async function exportBackup(passphrase: string): Promise<boolean> {
  const file = await createBackup(passphrase);
  const res = await FitBackup.saveDocument({ filename: `fitsaathi-backup-${todayISO()}.json`, mimeType: 'application/json', data: JSON.stringify(file) });
  return res.saved;
}

export type BackupCheck = { ok: true; file: BackupFile } | { ok: false; error: string };

export function parseBackup(text: string): BackupCheck {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: 'Not valid JSON' };
  }
  const f = parsed as Partial<BackupFile>;
  if (f.app !== 'fitsaathi' || (f.format !== 2 && (f as { format?: number }).format !== 1)) return { ok: false, error: 'Not a FitSaathi backup file' };
  if (typeof f.schemaVersion !== 'number') (f as BackupFile).schemaVersion = 1;
  if ((f.schemaVersion as number) > CURRENT_SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Backup is from a newer app version (schema v${f.schemaVersion}, this app has v${CURRENT_SCHEMA_VERSION}). Update the app first.`,
    };
  }
  if (f.encrypted) {
    if (!f.payload) return { ok: false, error: 'Encrypted backup is missing its payload' };
  } else if (!f.tables || typeof f.tables !== 'object') {
    return { ok: false, error: 'Backup has no tables' };
  }
  return { ok: true, file: f as BackupFile };
}

/** Decrypt (if needed), validate table names and apply backup-level migrations up to the current schema. */
export async function unpackBackup(
  file: BackupFile,
  passphrase: string,
): Promise<{ ok: true; tables: Record<string, Record<string, unknown>[]> } | { ok: false; error: string }> {
  let tables: Record<string, Record<string, unknown>[]>;
  if (file.encrypted) {
    try {
      tables = (await decryptJson(file.payload as EncryptedPayload, passphrase)) as Record<string, Record<string, unknown>[]>;
    } catch {
      return { ok: false, error: 'wrong_passphrase' };
    }
  } else {
    tables = file.tables as Record<string, Record<string, unknown>[]>;
  }
  for (let v = file.schemaVersion; v < CURRENT_SCHEMA_VERSION; v += 1) {
    const step = BACKUP_MIGRATIONS[v];
    if (!step) return { ok: false, error: `No migration path from schema v${v}` };
    tables = step(tables);
  }
  for (const t of Object.keys(tables)) {
    if (!(TABLES as readonly string[]).includes(t)) return { ok: false, error: `Unknown table "${t}"` };
    if (!Array.isArray(tables[t])) return { ok: false, error: `Table "${t}" is not a list` };
  }
  return { ok: true, tables };
}

export async function pickBackupFile(): Promise<{ text: string; name: string } | null> {
  const res = await FitBackup.openDocument({ mimeTypes: ['application/json', 'text/plain', '*/*'] });
  if (!res.data) return null;
  return { text: res.data, name: res.name ?? 'backup.json' };
}

export async function restoreTables(tables: Record<string, Record<string, unknown>[]>): Promise<void> {
  const db = await getDb();
  await db.importAll(tables);
  await db.persist();
  notifyChange();
}

export function summarizeTables(tables: Record<string, Record<string, unknown>[]>): { label: string; count: number }[] {
  const labels: Record<string, string> = {
    habits: 'Habits',
    habit_logs: 'Habit entries',
    supplement_logs: 'Supplement entries',
    water_logs: 'Water entries',
    weight_logs: 'Weight entries',
    meal_logs: 'Meals',
    photos: 'Photos (metadata)',
    food_items: 'Foods',
    weekly_summaries: 'Weekly summaries',
    points_ledger: 'XP entries',
  };
  return Object.entries(labels).map(([k, label]) => ({ label, count: tables[k]?.length ?? 0 }));
}
