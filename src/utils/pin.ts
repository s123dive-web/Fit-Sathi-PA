/**
 * App-lock PIN helpers. The PIN is never stored: only a PBKDF2-SHA256 hash with a random salt.
 */
const ITERATIONS = 120_000;

export const PIN_LENGTH = 4;

export function isValidPin(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_LENGTH}}$`).test(pin);
}

function toB64(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function fromB64(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}

export function generateSalt(): string {
  return toB64(crypto.getRandomValues(new Uint8Array(new ArrayBuffer(16))));
}

export async function hashPin(pin: string, saltB64: string): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: fromB64(saltB64), iterations: ITERATIONS, hash: 'SHA-256' }, material, 256);
  return toB64(new Uint8Array(bits));
}

export async function verifyPin(pin: string, saltB64: string, expectedHash: string): Promise<boolean> {
  if (!isValidPin(pin)) return false;
  const h = await hashPin(pin, saltB64);
  // constant-time compare
  if (h.length !== expectedHash.length) return false;
  let diff = 0;
  for (let i = 0; i < h.length; i += 1) diff |= h.charCodeAt(i) ^ expectedHash.charCodeAt(i);
  return diff === 0;
}

/** Cooldown after repeated wrong PINs: 5 → 30 s, 8 → 5 min, 10+ → 30 min. */
export function lockoutSeconds(failedAttempts: number): number {
  if (failedAttempts >= 10) return 30 * 60;
  if (failedAttempts >= 8) return 5 * 60;
  if (failedAttempts >= 5) return 30;
  return 0;
}

export const LOCK_TIMEOUTS: { value: number; labelKey: string }[] = [
  { value: 0, labelKey: 'security.timeoutImmediately' },
  { value: 60, labelKey: 'security.timeout1m' },
  { value: 300, labelKey: 'security.timeout5m' },
  { value: 900, labelKey: 'security.timeout15m' },
];
