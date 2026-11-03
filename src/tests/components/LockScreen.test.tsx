import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { Settings } from '../../types';
import { generateSalt, hashPin } from '../../utils/pin';
import { useLockStore } from '../../store/lockStore';

let settings: Settings;
const settingsUpdate = vi.fn(async (_p: unknown) => undefined);

vi.mock('../../db/repos', () => ({
  settingsRepo: {
    get: vi.fn(async () => settings),
    update: (p: Partial<Settings>) => {
      settings = { ...settings, ...p };
      return settingsUpdate(p);
    },
    set: vi.fn(async () => undefined),
  },
}));
vi.mock('../../db/database', () => ({ getDb: vi.fn() }));
vi.mock('../../native/plugins', () => ({
  FitBiometric: { isAvailable: vi.fn(async () => ({ available: false, status: 'unavailable' })), authenticate: vi.fn(async () => ({ success: false })) },
}));

const salt = generateSalt();

describe('<LockScreen />', () => {
  beforeEach(async () => {
    settings = {
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
    };
    useLockStore.getState().initialize(true);
  });

  const type = (pin: string) => {
    for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
  };

  it('rejects a wrong PIN with attempts left, then unlocks with the right one', async () => {
    const { LockScreen } = await import('../../screens/LockScreen');
    render(<LockScreen settings={settings} name="Suresh" />);
    expect(screen.getByText('FitSaathi is locked')).toBeInTheDocument();
    type('1111');
    expect(await screen.findByRole('alert')).toHaveTextContent('Wrong PIN · 4 attempts left');
    expect(useLockStore.getState().locked).toBe(true);
    type('2580');
    await waitFor(() => expect(useLockStore.getState().locked).toBe(false));
  });

  it('enters a cooldown after 5 wrong PINs', async () => {
    const { LockScreen } = await import('../../screens/LockScreen');
    render(<LockScreen settings={settings} name="Suresh" />);
    for (let i = 0; i < 5; i += 1) {
      type('0000');
      await screen.findByRole('alert');
      await waitFor(() => expect(screen.getAllByTestId('pin-dot')[0].className).not.toContain('bg-rose-500'));
    }
    expect(screen.getByRole('alert')).toHaveTextContent('Too many attempts. Try again in 30s.');
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
    expect(settings.failedAttempts).toBe(5);
  });
});
