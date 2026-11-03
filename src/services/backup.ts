import { getDb, TABLES, type TableName } from '../db/database';
import { BACKUP_MIGRATIONS, CURRENT_SCHEMA_VERSION } from '../db/migrations';
import { FitBackup } from '../native/plugins';
import { notifyChange } from '../store/appStore';
import { todayISO } from '../utils/dates';
import { decryptJson, encryptJson, type EncryptedPayload } from '../utils/crypto';
import { t } from '../i18n';

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

export type Dump = Record<string, Record<string, unknown>[]>;

/**
 * Settings keys that never leave the device and are never restored: the app-lock state. A 4-digit PIN hash can be
 * brute-forced offline in seconds, and restoring a lock state onto another install would lock the user out.
 */
export const LOCK_SETTINGS_KEYS: readonly string[] = ['pinHash', 'pinSalt', 'appLockEnabled', 'biometricEnabled', 'failedAttempts', 'lockoutUntil', 'lastFailedAt'];

export function stripLockSettings(dump: Dump): Dump {
  const out: Dump = { ...dump };
  if (Array.isArray(out.settings)) out.settings = out.settings.filter((r) => !LOCK_SETTINGS_KEYS.includes(String(r.key)));
  return out;
}

/** Plaintext header bound to the ciphertext as GCM additional data. */
export function backupAad(f: Pick<BackupFile, 'app' | 'format' | 'schemaVersion'>): string {
  return JSON.stringify({ app: f.app, format: f.format, schemaVersion: f.schemaVersion });
}

export async function createBackup(passphrase: string): Promise<BackupFile> {
  const db = await getDb();
  const dump = stripLockSettings(await db.exportAll());
  const schemaVersion = await db.schemaVersion();
  const base = { app: 'fitsaathi' as const, format: 2 as const, schemaVersion, exportedAt: new Date().toISOString() };
  if (!passphrase) return { ...base, encrypted: false, tables: dump };
  return { ...base, encrypted: true, payload: await encryptJson(dump, passphrase, backupAad(base)) };
}

/** Opens the system document picker; the user may pick Google Drive, Downloads, etc. The app never uploads anything itself. */
export async function exportBackup(passphrase: string): Promise<boolean> {
  const file = await createBackup(passphrase);
  const res = await FitBackup.saveDocument({ filename: `fitsaathi-backup-${todayISO()}.json`, mimeType: 'application/json', data: JSON.stringify(file) });
  return res.saved;
}

export type BackupCheck = { ok: true; file: BackupFile } | { ok: false; error: string };

export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

export function parseBackup(text: string): BackupCheck {
  if (text.length > MAX_BACKUP_BYTES) return { ok: false, error: t('backup.tooLarge') };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: t('backup.notJson') };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, error: t('backup.notBackup') };
  const f = parsed as Partial<BackupFile>;
  if (f.app !== 'fitsaathi') return { ok: false, error: t('backup.notBackup') };
  if (f.format !== 2) return { ok: false, error: t('backup.unsupportedFormat', { format: String(f.format) }) };
  if (!Number.isInteger(f.schemaVersion) || (f.schemaVersion as number) < 1) return { ok: false, error: t('backup.badSchemaVersion') };
  if ((f.schemaVersion as number) > CURRENT_SCHEMA_VERSION) {
    return { ok: false, error: t('backup.newerVersion', { v: f.schemaVersion as number, cur: CURRENT_SCHEMA_VERSION }) };
  }
  if (typeof f.encrypted !== 'boolean') return { ok: false, error: t('backup.notBackup') };
  if (f.encrypted) {
    if (!f.payload || typeof f.payload !== 'object') return { ok: false, error: t('backup.missingPayload') };
  } else if (!f.tables || typeof f.tables !== 'object' || Array.isArray(f.tables)) {
    return { ok: false, error: t('backup.noTables') };
  }
  return { ok: true, file: f as BackupFile };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_COLUMNS = new Set(['date', 'week_start', 'week_end']);
const TIMESTAMP_COLUMNS = new Set(['created_at', 'updated_at', 'taken_at', 'scheduled_for', 'generated_at', 'applied_at']);
const COLUMN_NAME = /^[a-z_]+$/;

/** Shape-check every row so a damaged or hand-edited file cannot put the app into a crash loop on launch. */
export function validateRows(tables: Dump): string | null {
  for (const [name, rows] of Object.entries(tables)) {
    if (!(TABLES as readonly string[]).includes(name)) return t('backup.unknownTable', { table: name });
    if (!Array.isArray(rows)) return t('backup.tableNotList', { table: name });
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) return t('backup.badRow', { table: name, row: i + 1 });
      for (const [col, v] of Object.entries(row)) {
        if (!COLUMN_NAME.test(col)) return t('backup.badColumn', { table: name, column: col });
        if (DATE_COLUMNS.has(col) && (typeof v !== 'string' || !ISO_DATE.test(v))) return t('backup.badDate', { table: name, row: i + 1, column: col });
        if (TIMESTAMP_COLUMNS.has(col) && v !== null && (typeof v !== 'string' || Number.isNaN(Date.parse(v)))) {
          return t('backup.badDate', { table: name, row: i + 1, column: col });
        }
        if (v !== null && typeof v === 'object') return t('backup.badValue', { table: name, row: i + 1, column: col });
      }
      if (name === 'habit_logs' && !['done', 'skip', 'miss'].includes(String(row.status))) return t('backup.badValue', { table: name, row: i + 1, column: 'status' });
      if (name === 'habits' && typeof row.created_at === 'string' && !ISO_DATE.test(row.created_at.slice(0, 10))) {
        return t('backup.badDate', { table: name, row: i + 1, column: 'created_at' });
      }
    }
  }
  return null;
}

/** Decrypt (if needed), validate table names + rows and apply backup-level migrations up to the current schema. */
export async function unpackBackup(file: BackupFile, passphrase: string): Promise<{ ok: true; tables: Dump } | { ok: false; error: string }> {
  let tables: Dump;
  if (file.encrypted) {
    try {
      const out = await decryptJson(file.payload as EncryptedPayload, passphrase, backupAad(file));
      if (!out || typeof out !== 'object' || Array.isArray(out)) return { ok: false, error: t('backup.noTables') };
      tables = out as Dump;
    } catch (e) {
      // A validation error (bad iterations, wrong alg) carries a message; a GCM auth failure does not.
      const msg = e instanceof Error && e.message && !/operation|decrypt/i.test(e.message) ? e.message : '';
      return { ok: false, error: msg ? t('backup.corrupt', { reason: msg }) : 'wrong_passphrase' };
    }
  } else {
    tables = file.tables as Dump;
  }
  for (let v = file.schemaVersion; v < CURRENT_SCHEMA_VERSION; v += 1) {
    const step = BACKUP_MIGRATIONS[v];
    if (!step) return { ok: false, error: t('backup.noMigration', { v }) };
    tables = step(tables);
  }
  const rowError = validateRows(tables);
  if (rowError) return { ok: false, error: rowError };
  return { ok: true, tables: stripLockSettings(tables) };
}

export async function pickBackupFile(): Promise<{ text: string; name: string } | null> {
  const res = await FitBackup.openDocument({ mimeTypes: ['application/json', 'text/plain', '*/*'] });
  if (!res.data) return null;
  return { text: res.data, name: res.name ?? 'backup.json' };
}

export async function restoreTables(tables: Dump): Promise<void> {
  const db = await getDb();
  await db.importAll(stripLockSettings(tables));
  await db.persist();
  notifyChange();
}

const SUMMARY_TABLES: TableName[] = ['habits', 'habit_logs', 'supplement_logs', 'water_logs', 'weight_logs', 'meal_logs', 'photos', 'food_items', 'weekly_summaries', 'points_ledger'];

export function summarizeTables(tables: Dump): { label: string; count: number }[] {
  return SUMMARY_TABLES.map((k) => ({ label: t(`backup.tables.${k}`), count: tables[k]?.length ?? 0 }));
}
