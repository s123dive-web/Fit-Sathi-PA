import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Profile, Settings } from '../../types';
import { validateProfile } from '../../utils/profile';
import { t } from '../../i18n';
import { Overlays } from '../../components/ui';

const setSecureScreen = vi.fn(async (_o: { enabled: boolean }) => undefined);
const exportBackup = vi.fn(async (_p: string) => true);

vi.mock('../../db/repos', () => ({
  habitRepo: { all: vi.fn(async () => []), upsert: vi.fn(async () => undefined) },
  profileRepo: { save: vi.fn(async () => undefined) },
  settingsRepo: { set: vi.fn(async () => undefined), update: vi.fn(async () => undefined) },
}));
vi.mock('../../services/sync', () => ({ syncNative: vi.fn(async () => undefined) }));
vi.mock('../../services/erase', () => ({ eraseAllData: vi.fn(async () => undefined) }));
vi.mock('../../services/security', () => ({
  enableAppLock: vi.fn(async () => undefined),
  disableAppLock: vi.fn(async () => undefined),
  changePin: vi.fn(async () => undefined),
}));
vi.mock('../../services/backup', () => ({
  exportBackup: (p: string) => exportBackup(p),
  parseBackup: vi.fn(),
  pickBackupFile: vi.fn(async () => null),
  restoreTables: vi.fn(async () => undefined),
  summarizeTables: vi.fn(() => []),
  unpackBackup: vi.fn(),
}));
vi.mock('../../native/plugins', () => ({
  FitAlarms: {
    canScheduleExactAlarms: vi.fn(async () => ({ granted: true })),
    requestExactAlarmPermission: vi.fn(async () => undefined),
    requestNotificationPermission: vi.fn(async () => ({ granted: true })),
  },
  FitBackup: { saveDocument: vi.fn(async () => ({ saved: true })) },
  FitBiometric: {
    isAvailable: vi.fn(async () => ({ available: false, status: 'unavailable' })),
    authenticate: vi.fn(async () => ({ success: false })),
    setSecureScreen: (o: { enabled: boolean }) => setSecureScreen(o),
  },
}));

const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'sample/suresh_profile.json'), 'utf8')) as Profile;
const profile = validateProfile(raw).profile!;
const settings: Settings = {
  onboarded: true,
  theme: 'light',
  weightUnit: 'kg',
  heightUnit: 'cm',
  healthConnectEnabled: false,
  lastWeeklySummaryFor: null,
  installedAt: '',
  appLockEnabled: false,
  pinHash: null,
  pinSalt: null,
  biometricEnabled: false,
  lockTimeoutSec: 60,
  failedAttempts: 0,
  lockoutUntil: null,
  lastFailedAt: null,
};

describe('<ProfileScreen />', () => {
  beforeEach(() => {
    exportBackup.mockClear();
    setSecureScreen.mockClear();
  });

  it('shows the About card with version, privacy policy link, source link and the wellness disclaimer', async () => {
    const { ProfileScreen } = await import('../../screens/ProfileScreen');
    const { APP_VERSION } = await import('../../components/AboutCard');
    render(<ProfileScreen profile={profile} settings={settings} />);
    expect(screen.getByText(t('about.version', { name: t('app.name'), version: APP_VERSION }))).toBeInTheDocument();
    expect(screen.getByText(t('about.local'))).toBeInTheDocument();
    expect(screen.getByText(t('about.disclaimer'))).toHaveTextContent(/not a medical device/);
    const policy = screen.getByRole('link', { name: t('about.privacyPolicy') });
    expect(policy).toHaveAttribute('href', 'https://github.com/s123dive-web/Fit-Sathi-PA/blob/main/PRIVACY.md');
    expect(policy).toHaveAttribute('target', '_blank');
    expect(policy).toHaveAttribute('rel', 'noopener noreferrer');
    expect(screen.getByRole('link', { name: t('about.source') })).toHaveAttribute('href', 'https://github.com/s123dive-web/Fit-Sathi-PA');
    // The removed cloud feature must not surface anywhere on the screen.
    expect(screen.queryByText(/cloud/i)).toBeNull();
  });

  it('requires an 8+ character backup passphrase and shows a strength hint', async () => {
    const { ProfileScreen } = await import('../../screens/ProfileScreen');
    render(
      <>
        <ProfileScreen profile={profile} settings={settings} />
        <Overlays />
      </>,
    );
    fireEvent.click(screen.getByRole('button', { name: t('profile.backupBtn') }));
    const input = await screen.findByLabelText(new RegExp(t('profile.passphrase')));
    expect(screen.queryByTestId('passphrase-meter')).toBeNull();

    fireEvent.change(input, { target: { value: '1234567' } });
    expect(screen.getByTestId('passphrase-meter')).toHaveAttribute('data-level', 'weak');
    fireEvent.click(screen.getByRole('button', { name: t('common.save') }));
    expect(await screen.findByText(t('profile.passphraseShort'))).toBeInTheDocument();
    expect(exportBackup).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: '0123456789012' } }); // digits only → still weak
    expect(screen.getByTestId('passphrase-meter')).toHaveAttribute('data-level', 'weak');
    fireEvent.change(input, { target: { value: 'mango tree 1' } });
    expect(screen.getByTestId('passphrase-meter')).toHaveAttribute('data-level', 'ok');
    fireEvent.change(input, { target: { value: 'mango tree by the river 42' } });
    expect(screen.getByTestId('passphrase-meter')).toHaveAttribute('data-level', 'strong');

    fireEvent.click(screen.getByRole('button', { name: t('common.save') }));
    await waitFor(() => expect(exportBackup).toHaveBeenCalledWith('mango tree by the river 42'));
  });

  it('passphraseStrength: weak < 10 chars or digits-only, strong >= 14 with letters and digits', async () => {
    const { passphraseStrength } = await import('../../screens/ProfileScreen');
    expect(passphraseStrength('abc12345')).toBe('weak');
    expect(passphraseStrength('12345678901234567')).toBe('weak');
    expect(passphraseStrength('abcdefghij')).toBe('ok');
    expect(passphraseStrength('abcdefghijklmnop')).toBe('ok'); // long but no digits
    expect(passphraseStrength('abcdefghijkl12')).toBe('strong');
  });
});
