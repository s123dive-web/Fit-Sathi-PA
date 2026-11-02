import m001 from './001_initial.sql?raw';

/**
 * Versioned SQL migrations. Add a new file `NNN_name.sql`, import it here and append to the list.
 * Applied versions are tracked in the `schema_migrations` table.
 */
export const MIGRATIONS: { version: number; name: string; sql: string }[] = [{ version: 1, name: '001_initial', sql: m001 }];

export const CURRENT_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

/**
 * Backup-level migrations: transform a dump produced by an older schema version into the current shape.
 * Keyed by the version being upgraded FROM. Empty today; v1 is the first schema.
 */
export const BACKUP_MIGRATIONS: Record<number, (dump: Record<string, Record<string, unknown>[]>) => Record<string, Record<string, unknown>[]>> = {};
