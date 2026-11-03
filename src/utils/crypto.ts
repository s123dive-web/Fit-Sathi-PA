/**
 * Passphrase-based AES-256-GCM (PBKDF2-SHA256) via WebCrypto.
 * Used for backup files so a Drive/Downloads copy is unreadable without the passphrase.
 *
 * Hardening notes:
 * - KDF parameters read from a file are validated: unknown `alg`/`kdf` are rejected and `iterations` is clamped to
 *   [MIN_ITERATIONS, MAX_ITERATIONS] so a tampered file can neither weaken the key nor hang the UI.
 * - Callers may bind a plaintext header (e.g. `{app, format, schemaVersion}`) as GCM additional data so it is
 *   authenticated together with the ciphertext.
 */
export interface EncryptedPayload {
  alg: 'AES-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string; // base64
  iv: string; // base64
  data: string; // base64 ciphertext
}

/** OWASP (2023) recommends 600k for PBKDF2-HMAC-SHA256. */
export const ITERATIONS = 600_000;
export const MIN_ITERATIONS = 100_000;
export const MAX_ITERATIONS = 2_000_000;

function toB64(bytes: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) s += String.fromCharCode(...bytes.subarray(i, i + chunk));
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

async function deriveKey(passphrase: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations, hash: 'SHA-256' }, material, { name: 'AES-GCM', length: 256 }, false, [
    'encrypt',
    'decrypt',
  ]);
}

function aadBytes(aad?: string): Uint8Array<ArrayBuffer> | undefined {
  if (aad === undefined) return undefined;
  const enc = new TextEncoder().encode(aad);
  const out = new Uint8Array(new ArrayBuffer(enc.length));
  out.set(enc);
  return out;
}

/** Validate a payload read from disk. Throws a descriptive Error on malformed input. */
export function validatePayload(payload: unknown): EncryptedPayload {
  const p = payload as Partial<EncryptedPayload> | null;
  if (!p || typeof p !== 'object') throw new Error('Encrypted payload is not an object');
  if (p.alg !== 'AES-GCM') throw new Error(`Unsupported cipher "${String(p.alg)}"`);
  if (p.kdf !== 'PBKDF2-SHA256') throw new Error(`Unsupported key derivation "${String(p.kdf)}"`);
  if (!Number.isInteger(p.iterations) || (p.iterations as number) < MIN_ITERATIONS || (p.iterations as number) > MAX_ITERATIONS) {
    throw new Error(`Iteration count ${String(p.iterations)} is outside the allowed range`);
  }
  for (const k of ['salt', 'iv', 'data'] as const) {
    if (typeof p[k] !== 'string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(p[k] as string)) throw new Error(`Field "${k}" is not base64`);
  }
  if (fromB64(p.salt as string).length < 8) throw new Error('Salt too short');
  if (fromB64(p.iv as string).length !== 12) throw new Error('IV must be 12 bytes');
  return p as EncryptedPayload;
}

export async function encryptJson(value: unknown, passphrase: string, aad?: string): Promise<EncryptedPayload> {
  const salt = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16)));
  const iv = crypto.getRandomValues(new Uint8Array(new ArrayBuffer(12)));
  const key = await deriveKey(passphrase, salt, ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(value));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aadBytes(aad) }, key, plain);
  return { alg: 'AES-GCM', kdf: 'PBKDF2-SHA256', iterations: ITERATIONS, salt: toB64(salt), iv: toB64(iv), data: toB64(new Uint8Array(cipher)) };
}

export async function decryptJson(payload: EncryptedPayload, passphrase: string, aad?: string): Promise<unknown> {
  const p = validatePayload(payload);
  const key = await deriveKey(passphrase, fromB64(p.salt), p.iterations);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(p.iv), additionalData: aadBytes(aad) }, key, fromB64(p.data));
  return JSON.parse(new TextDecoder().decode(plain));
}
