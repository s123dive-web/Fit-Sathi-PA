import { settingsRepo } from '../db/repos';
import { generateSalt, hashPin, lockoutSeconds, verifyPin } from '../utils/pin';
import { FitBiometric } from '../native/plugins';
import { useLockStore } from '../store/lockStore';
import { notifyChange } from '../store/appStore';
import { t } from '../i18n';
import type { Settings } from '../types';

export async function enableAppLock(pin: string): Promise<void> {
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);
  await settingsRepo.update({ appLockEnabled: true, pinHash: hash, pinSalt: salt, failedAttempts: 0, lockoutUntil: null, lastFailedAt: null });
  notifyChange();
}

export async function changePin(pin: string): Promise<void> {
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);
  await settingsRepo.update({ pinHash: hash, pinSalt: salt, failedAttempts: 0, lockoutUntil: null, lastFailedAt: null });
  notifyChange();
}

export async function disableAppLock(): Promise<void> {
  await settingsRepo.update({
    appLockEnabled: false,
    pinHash: null,
    pinSalt: null,
    biometricEnabled: false,
    failedAttempts: 0,
    lockoutUntil: null,
    lastFailedAt: null,
  });
  useLockStore.getState().unlock();
  notifyChange();
}

export type PinAttempt = { ok: true } | { ok: false; lockedForSec: number; attemptsLeft: number; reason?: 'wrong' | 'locked' | 'no_pin' };

/**
 * Process-local monotonic lockout deadline (performance.now based). Persisted `lockoutUntil` is wall-clock and can
 * be skipped by changing the phone's clock; this guard makes the cooldown hold for the life of the process regardless.
 */
let monoLockoutUntil = 0;
const mono = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** @internal test hook */
export function _resetMonotonicLockout(): void {
  monoLockoutUntil = 0;
}

/** Verify a PIN against stored settings, applying the cooldown schedule. Fails closed when the lock state is corrupt. */
export async function attemptPin(pin: string): Promise<PinAttempt> {
  const s = await settingsRepo.get();
  const now = Date.now();
  const monoLeft = Math.ceil((monoLockoutUntil - mono()) / 1000);
  const wallLeft = s.lockoutUntil ? Math.ceil((new Date(s.lockoutUntil).getTime() - now) / 1000) : 0;
  // If the wall clock went backwards past the last failed attempt, re-arm the cooldown from "now".
  const clockWentBack = s.lastFailedAt !== null && new Date(s.lastFailedAt).getTime() > now + 5_000;
  const left = Math.max(monoLeft, wallLeft, clockWentBack ? lockoutSeconds(s.failedAttempts) : 0);
  if (left > 0) {
    if (clockWentBack) await settingsRepo.update({ lockoutUntil: new Date(now + left * 1000).toISOString(), lastFailedAt: new Date(now).toISOString() });
    return { ok: false, lockedForSec: left, attemptsLeft: 0, reason: 'locked' };
  }
  if (!s.pinHash || !s.pinSalt) {
    // Lock is enabled but the hash is missing: never fail open. "Forgot PIN" (erase) is the recovery path.
    return { ok: false, lockedForSec: 0, attemptsLeft: 0, reason: 'no_pin' };
  }
  if (await verifyPin(pin, s.pinSalt, s.pinHash)) {
    monoLockoutUntil = 0;
    if (s.failedAttempts || s.lockoutUntil) await settingsRepo.update({ failedAttempts: 0, lockoutUntil: null, lastFailedAt: null });
    return { ok: true };
  }
  const failed = s.failedAttempts + 1;
  const cool = lockoutSeconds(failed);
  if (cool) monoLockoutUntil = mono() + cool * 1000;
  await settingsRepo.update({
    failedAttempts: failed,
    lockoutUntil: cool ? new Date(now + cool * 1000).toISOString() : null,
    lastFailedAt: new Date(now).toISOString(),
  });
  return { ok: false, lockedForSec: cool, attemptsLeft: Math.max(0, 5 - failed), reason: 'wrong' };
}

export function remainingLockout(s: Settings, now = Date.now()): number {
  const monoLeft = Math.ceil((monoLockoutUntil - mono()) / 1000);
  const wallLeft = s.lockoutUntil ? Math.ceil((new Date(s.lockoutUntil).getTime() - now) / 1000) : 0;
  return Math.max(0, monoLeft, wallLeft);
}

export async function biometricUnlock(): Promise<boolean> {
  try {
    const avail = await FitBiometric.isAvailable();
    if (!avail.available) return false;
    const r = await FitBiometric.authenticate({
      title: t('security.biometricPrompt'),
      subtitle: t('security.biometricSubtitle'),
      negativeButton: t('security.usePin'),
    });
    return r.success;
  } catch {
    return false;
  }
}

export function unlockApp(): void {
  useLockStore.getState().unlock();
}
