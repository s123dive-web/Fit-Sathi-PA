import { describe, expect, it } from 'vitest';
import { decryptJson, encryptJson } from '../utils/crypto';
import { parseBackup, unpackBackup, type BackupFile } from '../services/backup';

describe('encrypted backup', () => {
  it('round-trips through AES-GCM with a passphrase', async () => {
    const payload = await encryptJson({ habits: [{ id: 'h1' }] }, 'secret-pass');
    expect(payload.alg).toBe('AES-GCM');
    const back = await decryptJson(payload, 'secret-pass');
    expect(back).toEqual({ habits: [{ id: 'h1' }] });
    await expect(decryptJson(payload, 'wrong')).rejects.toBeDefined();
  });

  it('validates backup envelopes and schema versions', async () => {
    expect(parseBackup('nope').ok).toBe(false);
    expect(parseBackup(JSON.stringify({ app: 'other' })).ok).toBe(false);
    const newer = parseBackup(JSON.stringify({ app: 'fitsaathi', format: 2, schemaVersion: 99, exportedAt: '', encrypted: false, tables: {} }));
    expect(newer.ok).toBe(false);
    const file: BackupFile = {
      app: 'fitsaathi',
      format: 2,
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      encrypted: true,
      payload: await encryptJson({ habits: [] }, 'pw'),
    };
    const parsed = parseBackup(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    const wrong = await unpackBackup(file, 'bad');
    expect(wrong.ok).toBe(false);
    const right = await unpackBackup(file, 'pw');
    expect(right.ok && right.tables.habits).toEqual([]);
    const unknown = await unpackBackup({ ...file, encrypted: false, payload: undefined, tables: { nope: [] } }, '');
    expect(unknown.ok).toBe(false);
  });
});
