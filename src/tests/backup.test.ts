import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson, MAX_ITERATIONS, MIN_ITERATIONS, validatePayload } from '../utils/crypto';
import { backupAad, parseBackup, stripLockSettings, unpackBackup, validateRows, type BackupFile } from '../services/backup';

const header = { app: 'fitsaathi' as const, format: 2 as const, schemaVersion: 1 };

async function encryptedFile(tables: Record<string, Record<string, unknown>[]>, pw = 'pw'): Promise<BackupFile> {
  return { ...header, exportedAt: new Date().toISOString(), encrypted: true, payload: await encryptJson(tables, pw, backupAad(header)) };
}

describe('encrypted backup', () => {
  it('round-trips through AES-GCM with a passphrase and rejects the wrong one', async () => {
    const payload = await encryptJson({ habits: [{ id: 'h1' }] }, 'secret-pass');
    expect(payload.alg).toBe('AES-GCM');
    expect(payload.iterations).toBeGreaterThanOrEqual(MIN_ITERATIONS);
    const back = await decryptJson(payload, 'secret-pass');
    expect(back).toEqual({ habits: [{ id: 'h1' }] });
    await expect(decryptJson(payload, 'wrong')).rejects.toBeDefined();
  });

  it('binds the plaintext header as additional data', async () => {
    const file = await encryptedFile({ habits: [] });
    const tampered: BackupFile = { ...file, schemaVersion: 1, format: 2, app: 'fitsaathi' };
    expect((await unpackBackup(tampered, 'pw')).ok).toBe(true);
    // Same ciphertext, different header → authentication fails even with the right passphrase.
    const res = await unpackBackup({ ...file, schemaVersion: 0 as number }, 'pw');
    expect(res.ok).toBe(false);
  });

  it('rejects tampered KDF parameters instead of hanging or weakening the key', async () => {
    const p = await encryptJson({ a: 1 }, 'pw');
    expect(() => validatePayload({ ...p, iterations: 1 })).toThrow(/range/);
    expect(() => validatePayload({ ...p, iterations: MAX_ITERATIONS + 1 })).toThrow(/range/);
    expect(() => validatePayload({ ...p, iterations: 2 ** 31 })).toThrow(/range/);
    expect(() => validatePayload({ ...p, alg: 'AES-CBC' })).toThrow(/cipher/);
    expect(() => validatePayload({ ...p, kdf: 'scrypt' })).toThrow(/derivation/);
    expect(() => validatePayload({ ...p, iv: 'AAAA' })).toThrow(/IV/);
    await expect(decryptJson({ ...p, iterations: 1 }, 'pw')).rejects.toThrow(/range/);
  });

  it('validates backup envelopes and schema versions', async () => {
    expect(parseBackup('nope').ok).toBe(false);
    expect(parseBackup('[]').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'other' })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...header, format: 1, exportedAt: '', encrypted: false, tables: {} })).ok).toBe(false);
    for (const bad of [NaN, 1.5, -1, '1', undefined]) {
      expect(parseBackup(JSON.stringify({ ...header, schemaVersion: bad, exportedAt: '', encrypted: false, tables: {} })).ok).toBe(false);
    }
    expect(parseBackup(JSON.stringify({ ...header, schemaVersion: 99, exportedAt: '', encrypted: false, tables: {} })).ok).toBe(false);
    expect(parseBackup(JSON.stringify({ ...header, exportedAt: '', encrypted: true })).ok).toBe(false); // missing payload
    expect(parseBackup(JSON.stringify({ ...header, exportedAt: '', encrypted: false, tables: [] })).ok).toBe(false);
    const file = await encryptedFile({ habits: [] });
    expect(parseBackup(JSON.stringify(file)).ok).toBe(true);
    expect((await unpackBackup(file, 'bad')).ok).toBe(false);
    const right = await unpackBackup(file, 'pw');
    expect(right.ok && right.tables.habits).toEqual([]);
    const unknown = await unpackBackup({ ...file, encrypted: false, payload: undefined, tables: { nope: [] } }, '');
    expect(unknown.ok).toBe(false);
  });

  it('rejects rows with malformed dates or shapes so a restore cannot crash the next launch', () => {
    expect(validateRows({ habit_logs: [{ habit_id: 'h', date: '2026-01-05', status: 'done', created_at: '2026-01-05T00:00:00Z', updated_at: '2026-01-05T00:00:00Z' }] })).toBeNull();
    expect(validateRows({ habit_logs: [{ habit_id: 'h', date: '', status: 'done' }] })).toMatch(/date/i);
    expect(validateRows({ habit_logs: [{ habit_id: 'h', date: '2026-1-5', status: 'done' }] })).toMatch(/date/i);
    expect(validateRows({ habit_logs: [{ habit_id: 'h', date: '2026-01-05', status: 'nope' }] })).toMatch(/status/i);
    expect(validateRows({ weight_logs: [{ id: 'w', date: '2026-01-05', kg: 70, created_at: 'yesterday' }] })).toMatch(/created_at/);
    expect(validateRows({ weight_logs: ['not an object' as unknown as Record<string, unknown>] })).toMatch(/row/i);
    expect(validateRows({ weight_logs: [{ 'id; DROP TABLE x': 1 }] })).toMatch(/column/i);
    expect(validateRows({ weight_logs: [{ id: 'w', date: '2026-01-05', kg: { nested: true } }] })).toMatch(/value/i);
    expect(validateRows({ weekly_summaries: [{ week_start: '2026-01-05', week_end: 'x' }] })).toMatch(/week_end/);
    expect(validateRows({ photos: 'nope' as unknown as Record<string, unknown>[] })).toMatch(/list/i);
  });

  it('never exports or restores the app-lock state', async () => {
    const dump = {
      settings: [
        { key: 'theme', value: '"dark"' },
        { key: 'pinHash', value: '"abc"' },
        { key: 'pinSalt', value: '"s"' },
        { key: 'appLockEnabled', value: 'true' },
        { key: 'failedAttempts', value: '3' },
        { key: 'lockoutUntil', value: 'null' },
        { key: 'biometricEnabled', value: 'true' },
      ],
    };
    expect(stripLockSettings(dump).settings.map((r) => r.key)).toEqual(['theme']);
    const file = await encryptedFile(dump);
    const res = await unpackBackup(file, 'pw');
    expect(res.ok && res.tables.settings.map((r) => r.key)).toEqual(['theme']);
  });
});
