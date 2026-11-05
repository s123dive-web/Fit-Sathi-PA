import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import type { Settings } from '../../types';
import { generateSalt, hashPin } from '../../utils/pin';
import { useLockStore } from '../../store/lockStore';
import { t, tn } from '../../i18n';

let settings: Settings;
const settingsUpdate = vi.fn(async (_p: unknown) => undefined);
const eraseAllData = vi.fn(async () => undefined);

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
vi.mock('../../services/erase', () => ({ eraseAllData: () => eraseAllData() }));
const setSecureScreen = vi.fn(async (_o: { enabled: boolean }) => undefined);
vi.mock('../../native/plugins', () => ({
  FitBiometric: {
    isAvailable: vi.fn(async () => ({ available: false, status: 'unavailable' })),
    authenticate: vi.fn(async () => ({ success: false })),
    setSecureScreen: (o: { enabled: boolean }) => setSecureScreen(o),
  },
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
      lastFailedAt: null,
    };
    useLockStore.getState().initialize(true);
    eraseAllData.mockClear();
    setSecureScreen.mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  const type = (pin: string) => {
    for (const d of pin) fireEvent.click(screen.getByRole('button', { name: d }));
  };

  it('turns on screenshot protection as soon as it mounts', async () => {
    const { LockScreen } = await import('../../screens/LockScreen');
    render(<LockScreen settings={settings} name="Suresh" />);
    await waitFor(() => expect(setSecureScreen).toHaveBeenCalledWith({ enabled: true }));
  });

  it('rejects a wrong PIN with attempts left, then unlocks with the right one', async () => {
    const { LockScreen } = await import('../../screens/LockScreen');
    render(<LockScreen settings={settings} name="Suresh" />);
    expect(screen.getByText(t('security.lockedTitle'))).toBeInTheDocument();
    type('1111');
    expect(await screen.findByRole('alert')).toHaveTextContent(`${t('security.wrongPin')} · ${tn('security.attemptsLeft', 4)}`);
    expect(useLockStore.getState().locked).toBe(true);
    type('2580');
    await waitFor(() => expect(useLockStore.getState().locked).toBe(false));
  });

  it('enters a cooldown after 5 wrong PINs', async () => {
    const { _resetMonotonicLockout } = await import('../../services/security');
    _resetMonotonicLockout();
    const { LockScreen } = await import('../../screens/LockScreen');
    render(<LockScreen settings={settings} name="Suresh" />);
    for (let i = 0; i < 5; i += 1) {
      type('0000');
      await screen.findByRole('alert');
      await waitFor(() => expect(screen.getAllByTestId('pin-dot')[0].className).not.toContain('bg-rose-500'));
    }
    expect(screen.getByRole('alert')).toHaveTextContent(t('security.lockedOut', { s: '30s' }));
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
    expect(settings.failedAttempts).toBe(5);
  });

  it('clears the stale "try again" message once the cooldown reaches 0', async () => {
    const { _resetMonotonicLockout } = await import('../../services/security');
    _resetMonotonicLockout();
    vi.useFakeTimers();
    settings = { ...settings, failedAttempts: 5, lockoutUntil: new Date(Date.now() + 2000).toISOString() };
    const { LockScreen } = await import('../../screens/LockScreen');
    render(<LockScreen settings={settings} name="Suresh" />);
    expect(screen.getByRole('alert')).toHaveTextContent(t('security.lockedOut', { s: '2s' }));
    expect(screen.getByRole('button', { name: '1' })).toBeDisabled();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent(t('security.lockedOut', { s: '1s' }));
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: '1' })).not.toBeDisabled();
  });

  it('"Forgot PIN" erases only after the typed-word confirmation', async () => {
    const { LockScreen } = await import('../../screens/LockScreen');
    render(<LockScreen settings={settings} name="Suresh" />);
    fireEvent.click(screen.getByText(t('security.forgot')));
    fireEvent.click(screen.getByRole('button', { name: t('security.eraseAndReset') }));
    const confirm = await screen.findByRole('dialog', { name: t('profile.eraseTitle') });
    const confirmBtn = Array.from(confirm.querySelectorAll('button')).find((b) => b.textContent === t('security.eraseAndReset'))!;
    expect(confirmBtn).toBeDisabled();
    fireEvent.change(confirm.querySelector('input')!, { target: { value: t('profile.eraseWord') } });
    expect(confirmBtn).not.toBeDisabled();
    fireEvent.click(confirmBtn);
    await waitFor(() => expect(eraseAllData).toHaveBeenCalledTimes(1));
  });
});
