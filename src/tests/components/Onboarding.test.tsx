import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { t } from '../../i18n';

const profileSave = vi.fn(async (_p: unknown) => undefined);
const habitUpsert = vi.fn(async (_h: unknown) => undefined);
const settingsUpdate = vi.fn(async (_s: unknown) => undefined);

vi.mock('../../db/repos', () => ({
  profileRepo: { save: (p: unknown) => profileSave(p) },
  habitRepo: { all: vi.fn(async () => []), upsert: (h: unknown) => habitUpsert(h) },
  settingsRepo: { update: (s: unknown) => settingsUpdate(s) },
}));
vi.mock('../../services/sync', () => ({ syncNative: vi.fn(async () => undefined) }));
vi.mock('../../native/plugins', () => ({
  FitAlarms: { requestNotificationPermission: vi.fn(async () => ({ granted: true })) },
  FitBackup: { openDocument: vi.fn(async () => ({ data: null, name: null })) },
}));

const sampleText = readFileSync(resolve(process.cwd(), 'sample/suresh_profile.json'), 'utf8');

describe('<Onboarding />', () => {
  beforeEach(() => {
    profileSave.mockClear();
    habitUpsert.mockClear();
    settingsUpdate.mockClear();
  });

  it('offers import or manual entry', async () => {
    const { Onboarding } = await import('../../screens/Onboarding');
    render(<Onboarding existing={null} />);
    expect(screen.getByText('📄 Import profile JSON')).toBeInTheDocument();
    expect(screen.getByText('✍️ Fill manually')).toBeInTheDocument();
  });

  it('rejects an invalid JSON profile with field errors', async () => {
    const { Onboarding } = await import('../../screens/Onboarding');
    render(<Onboarding existing={null} />);
    fireEvent.click(screen.getByText('📄 Import profile JSON'));
    fireEvent.change(screen.getByLabelText('Profile JSON'), { target: { value: JSON.stringify({ schemaVersion: 1, user: { name: 'X' } }) } });
    fireEvent.click(screen.getByText('Validate pasted'));
    expect(await screen.findByRole('alert')).toHaveTextContent('missing');
    expect(profileSave).not.toHaveBeenCalled();
  });

  it('imports the sample profile, shows a preview and seeds its habits', async () => {
    const { Onboarding } = await import('../../screens/Onboarding');
    render(<Onboarding existing={null} />);
    fireEvent.click(screen.getByText('📄 Import profile JSON'));
    fireEvent.change(screen.getByLabelText('Profile JSON'), { target: { value: sampleText } });
    fireEvent.click(screen.getByText('Validate pasted'));
    const useBtn = await screen.findByText('Use this profile for Suresh');
    expect(screen.getByText(t('import.labels.user.heightCm'))).toBeInTheDocument();
    expect(screen.queryByText('user.heightCm')).toBeNull();
    fireEvent.click(useBtn);
    await waitFor(() => expect(profileSave).toHaveBeenCalledTimes(1));
    const saved = profileSave.mock.calls[0][0] as { user: { name: string }; supplements: { id: string }[] };
    expect(saved.user.name).toBe('Suresh');
    expect(saved.supplements.every((s) => s.id)).toBe(true);
    await waitFor(() => expect(habitUpsert).toHaveBeenCalledTimes(6));
    expect(settingsUpdate).toHaveBeenCalledWith(expect.objectContaining({ onboarded: true }));
  });
});
