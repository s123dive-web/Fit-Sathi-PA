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
  await settingsRepo.update({ appLockEnabled: true, pinHash: hash, pinSalt: salt, failedAttempts: 0, lockoutUntil: null });
  notifyChange();
}

export async function changePin(pin: string): Promise<void> {
  const salt = generateSalt();
  const hash = await hashPin(pin, salt);
  await settingsRepo.update({ pinHash: hash, pinSalt: salt, failedAttempts: 0, lockoutUntil: null });
  notifyChange();
}

export async function disableAppLock(): Promise<void> {
  await settingsRepo.update({ appLockEnabled: false, pinHash: null, pinSalt: null, biometricEnabled: false, failedAttempts: 0, lockoutUntil: null });
  useLockStore.getState().unlock();
  notifyChange();
}

export type PinAttempt = { ok: true } | { ok: false; lockedForSec: number; attemptsLeft: number };

/** Verify a PIN against stored settings, applying the cooldown schedule. */
export async function attemptPin(pin: string): Promise<PinAttempt> {
  const s = await settingsRepo.get();
  const now = Date.now();
  if (s.lockoutUntil && new Date(s.lockoutUntil).getTime() > now) {
    return { ok: false, lockedForSec: Math.ceil((new Date(s.lockoutUntil).getTime() - now) / 1000), attemptsLeft: 0 };
  }
  if (!s.pinHash || !s.pinSalt) return { ok: true }; // nothing to check against
  if (await verifyPin(pin, s.pinSalt, s.pinHash)) {
    if (s.failedAttempts || s.lockoutUntil) await settingsRepo.update({ failedAttempts: 0, lockoutUntil: null });
    return { ok: true };
  }
  const failed = s.failedAttempts + 1;
  const cool = lockoutSeconds(failed);
  await settingsRepo.update({ failedAttempts: failed, lockoutUntil: cool ? new Date(now + cool * 1000).toISOString() : null });
  return { ok: false, lockedForSec: cool, attemptsLeft: Math.max(0, 5 - failed) };
}

export function remainingLockout(s: Settings, now = Date.now()): number {
  if (!s.lockoutUntil) return 0;
  return Math.max(0, Math.ceil((new Date(s.lockoutUntil).getTime() - now) / 1000));
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
