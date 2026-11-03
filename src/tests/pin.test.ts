import { describe, expect, it } from 'vitest';
import { generateSalt, hashPin, isValidPin, lockoutSeconds, verifyPin } from '../utils/pin';
import { useLockStore } from '../store/lockStore';

describe('PIN', () => {
  it('accepts only 4 digits', () => {
    expect(isValidPin('1234')).toBe(true);
    expect(isValidPin('123')).toBe(false);
    expect(isValidPin('12345')).toBe(false);
    expect(isValidPin('12a4')).toBe(false);
  });

  it('hashes with a salt and verifies', async () => {
    const salt = generateSalt();
    const hash = await hashPin('4821', salt);
    expect(hash).not.toContain('4821');
    expect(await verifyPin('4821', salt, hash)).toBe(true);
    expect(await verifyPin('4822', salt, hash)).toBe(false);
    expect(await hashPin('4821', generateSalt())).not.toBe(hash); // different salt, different hash
  });

  it('escalates cooldowns', () => {
    expect(lockoutSeconds(4)).toBe(0);
    expect(lockoutSeconds(5)).toBe(30);
    expect(lockoutSeconds(8)).toBe(300);
    expect(lockoutSeconds(10)).toBe(1800);
  });
});

describe('lock store', () => {
  it('locks on start when enabled and re-locks after the timeout', () => {
    const s = useLockStore.getState();
    s.initialize(true);
    expect(useLockStore.getState().locked).toBe(true);
    s.unlock();
    expect(useLockStore.getState().locked).toBe(false);
    s.onBackground();
    const t0 = useLockStore.getState().backgroundedAt as number;
    s.onForeground(true, 60, t0 + 30_000);
    expect(useLockStore.getState().locked).toBe(false); // back within 30 s
    s.onBackground();
    const t1 = useLockStore.getState().backgroundedAt as number;
    s.onForeground(true, 60, t1 + 61_000);
    expect(useLockStore.getState().locked).toBe(true);
    s.unlock();
    s.onBackground();
    s.onForeground(false, 0, Date.now() + 10_000);
    expect(useLockStore.getState().locked).toBe(false); // lock disabled
  });
});
