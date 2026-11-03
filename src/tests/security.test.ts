import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Settings } from '../types';
import { generateSalt, hashPin } from '../utils/pin';

let settings: Settings;

vi.mock('../db/repos', () => ({
  settingsRepo: {
    get: vi.fn(async () => settings),
    update: vi.fn(async (p: Partial<Settings>) => {
      settings = { ...settings, ...p };
    }),
    set: vi.fn(async () => undefined),
  },
}));
vi.mock('../db/database', () => ({ getDb: vi.fn() }));
vi.mock('../native/plugins', () => ({
  FitBiometric: { isAvailable: vi.fn(async () => ({ available: false, status: 'unavailable' })), authenticate: vi.fn(async () => ({ success: false })) },
}));

const { attemptPin, remainingLockout, _resetMonotonicLockout } = await import('../services/security');

const salt = generateSalt();

async function base(): Promise<Settings> {
  return {
    onboarded: true,
    theme: 'light',
    weightUnit: 'kg',
    heightUnit: 'cm',
    healthConnectEnabled: false,
    lastWeeklySummaryFor: null,
    installedAt: '',
    appLockEnabled: true,
    pinHash: await hashPin('2580', salt),
    pinSalt: salt,
    biometricEnabled: false,
    lockTimeoutSec: 60,
    failedAttempts: 0,
    lockoutUntil: null,
    lastFailedAt: null,
  };
}

describe('attemptPin', () => {
  beforeEach(async () => {
    settings = await base();
    _resetMonotonicLockout();
    vi.useRealTimers();
  });

  it('accepts the right PIN and resets counters', async () => {
    settings.failedAttempts = 3;
    expect(await attemptPin('2580')).toEqual({ ok: true });
    expect(settings.failedAttempts).toBe(0);
  });

  it('fails closed when the lock is enabled but the hash is missing', async () => {
    settings.pinHash = null;
    const r = await attemptPin('2580');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toBe('no_pin');
  });

  it('starts a cooldown after 5 wrong attempts', async () => {
    for (let i = 0; i < 4; i += 1) expect((await attemptPin('0000')).ok).toBe(false);
    const fifth = await attemptPin('0000');
    expect(!fifth.ok && fifth.lockedForSec).toBe(30);
    const during = await attemptPin('2580'); // even the right PIN is refused while locked
    expect(!during.ok && during.reason).toBe('locked');
    expect(remainingLockout(settings)).toBeGreaterThan(0);
  });

  it('cannot be skipped by moving the wall clock forward (monotonic guard)', async () => {
    for (let i = 0; i < 5; i += 1) await attemptPin('0000');
    // Simulate the user setting the phone clock 1 hour ahead: the persisted deadline is in the "past" now.
    const realNow = Date.now;
    Date.now = () => realNow() + 3600_000;
    try {
      const r = await attemptPin('2580');
      expect(r.ok).toBe(false);
      expect(!r.ok && r.reason).toBe('locked');
    } finally {
      Date.now = realNow;
    }
  });

  it('re-arms the cooldown when the wall clock moved backwards past the last failure', async () => {
    for (let i = 0; i < 5; i += 1) await attemptPin('0000');
    _resetMonotonicLockout(); // pretend the process restarted
    settings.lockoutUntil = null; // and someone cleared the wall-clock deadline by winding the clock back
    settings.lastFailedAt = new Date(Date.now() + 3600_000).toISOString(); // last failure is "in the future"
    const r = await attemptPin('2580');
    expect(r.ok).toBe(false);
    expect(!r.ok && r.lockedForSec).toBe(30);
  });
});
