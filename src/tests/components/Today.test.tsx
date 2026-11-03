import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Habit, Profile, Settings } from '../../types';
import { validateProfile } from '../../utils/profile';
import { formatTime } from '../../utils/dates';
import { t } from '../../i18n';

const setHabitStatus = vi.fn(async (..._a: unknown[]) => undefined);
const toggleSupplement = vi.fn(async (..._a: unknown[]) => undefined);
const addWater = vi.fn(async (..._a: unknown[]) => undefined);
const logWeight = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock('../../services/actions', () => ({
  setHabitStatus: (...a: unknown[]) => setHabitStatus(...a),
  toggleSupplement: (...a: unknown[]) => toggleSupplement(...a),
  addWater: (...a: unknown[]) => addWater(...a),
  undoWater: vi.fn(async () => undefined),
  logWeight: (...a: unknown[]) => logWeight(...a),
}));
vi.mock('../../services/health', () => ({
  refreshSteps: vi.fn(async () => ({ steps: null, status: 'disabled' })),
  enableHealthConnect: vi.fn(async () => ({ steps: null, status: 'unsupported' })),
}));

const habit: Habit = {
  id: 'h1',
  name: '45-min home workout',
  emoji: '🏋️',
  color: '#f97316',
  kind: 'workout',
  schedule: { type: 'daily' },
  reminderTime: '05:30',
  reminderEnabled: true,
  pinned: true,
  archived: false,
  createdAt: '2026-01-01',
  sortOrder: 0,
  xp: 10,
};

const habitAll = vi.fn(async () => [habit]);

vi.mock('../../db/repos', () => ({
  habitRepo: {
    all: () => habitAll(),
    logsBetween: vi.fn(async () => []),
    allLogs: vi.fn(async () => []),
  },
  supplementRepo: { logsOn: vi.fn(async () => []), logsFor: vi.fn(async () => []) },
  waterRepo: { totalOn: vi.fn(async () => 500) },
  weightRepo: { latest: vi.fn(async () => ({ id: 'w', date: '2026-01-01', kg: 76, loggedAt: '' })) },
  pointsRepo: { totalOn: vi.fn(async () => 15), total: vi.fn(async () => 260) },
  stepsRepo: { on: vi.fn(async () => null) },
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

const markDone = t('today.habitMarkDone', { name: habit.name });
const moreActions = t('common.moreActions', { name: habit.name });

describe('<Today />', () => {
  beforeEach(() => {
    setHabitStatus.mockClear();
    toggleSupplement.mockClear();
    addWater.mockClear();
    logWeight.mockClear();
    habitAll.mockReset();
    habitAll.mockResolvedValue([habit]);
  });

  it('renders habits, supplements, water, weight, fasting timer and XP', async () => {
    const { Today } = await import('../../screens/Today');
    render(<Today profile={profile} settings={settings} onOpenHabits={() => undefined} />);
    expect(await screen.findByText(/45-min home workout/)).toBeInTheDocument();
    expect(screen.getAllByText(/Sea buckthorn juice/).length).toBe(2);
    expect(screen.getByText(t('today.xpToday', { xp: 15 }))).toBeInTheDocument();
    expect(screen.getByText('0.50')).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
    expect(screen.getByTestId('fasting-timer').textContent).toMatch(/^\d\d:\d\d:\d\d$/);
  });

  it('one-tap done marks the habit; skip lives behind the overflow menu', async () => {
    const { Today } = await import('../../screens/Today');
    render(<Today profile={profile} settings={settings} onOpenHabits={() => undefined} />);
    await screen.findByText(/45-min home workout/);
    fireEvent.click(screen.getByLabelText(markDone));
    await waitFor(() => expect(setHabitStatus).toHaveBeenCalledWith('h1', expect.any(String), 'done', expect.objectContaining({ xp: 10 })));
    // No bare Skip / Miss buttons on the row.
    expect(screen.queryByRole('button', { name: t('common.skip') })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: moreActions }));
    fireEvent.click(screen.getByRole('menuitem', { name: new RegExp(t('common.skip')) }));
    await waitFor(() => expect(setHabitStatus).toHaveBeenLastCalledWith('h1', expect.any(String), 'skip', expect.anything()));
    expect(screen.queryByRole('menu')).toBeNull();
  });

  it('shows the tick optimistically and disables it while the action is in flight', async () => {
    const { Today } = await import('../../screens/Today');
    let finish: () => void = () => undefined;
    setHabitStatus.mockImplementationOnce(() => new Promise<undefined>((res) => (finish = () => res(undefined))));
    render(<Today profile={profile} settings={settings} onOpenHabits={() => undefined} />);
    await screen.findByText(/45-min home workout/);
    const tick = screen.getByLabelText(markDone);
    expect(tick).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(tick);
    const pressed = await screen.findByLabelText(t('today.habitDone', { name: habit.name }));
    expect(pressed).toBeDisabled();
    expect(pressed).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: moreActions })).toBeDisabled();
    finish();
    await waitFor(() => expect(screen.getByTestId('habit-h1').querySelector('[data-testid="tick"]')).not.toBeDisabled());
  });

  it('ticks a supplement and adds water', async () => {
    const { Today } = await import('../../screens/Today');
    render(<Today profile={profile} settings={settings} onOpenHabits={() => undefined} />);
    await screen.findByText(/45-min home workout/);
    fireEvent.click(screen.getByLabelText(t('today.supplementMarkTaken', { name: 'Sea buckthorn oil capsule', time: formatTime('13:55') })));
    await waitFor(() => expect(toggleSupplement).toHaveBeenCalledWith('sup_sea_buckthorn_oil_capsule_1355', expect.any(String), true, expect.anything()));
    fireEvent.click(screen.getByText(t('today.addWater')));
    await waitFor(() => expect(addWater).toHaveBeenCalledWith(expect.any(String), 250, 3000, expect.anything()));
  });

  it('rejects an out-of-range weight with an inline error instead of saving', async () => {
    const { Today } = await import('../../screens/Today');
    render(<Today profile={profile} settings={settings} onOpenHabits={() => undefined} />);
    await screen.findByText(/45-min home workout/);
    fireEvent.click(screen.getByText(t('today.logWeight')));
    const input = screen.getByLabelText(t('today.weight'));
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: t('common.save') }));
    expect(await screen.findByRole('alert')).toHaveTextContent(t('today.weightRange', { min: 20, max: 400, unit: t('common.kg') }));
    expect(logWeight).not.toHaveBeenCalled();
    fireEvent.change(input, { target: { value: '75.5' } });
    fireEvent.click(screen.getByRole('button', { name: t('common.save') }));
    await waitFor(() => expect(logWeight).toHaveBeenCalledWith(expect.any(String), 75.5, expect.anything()));
  });

  it('renders an error card with retry when the loader rejects', async () => {
    const { Today } = await import('../../screens/Today');
    habitAll.mockRejectedValueOnce(new Error('disk on fire'));
    render(<Today profile={profile} settings={settings} onOpenHabits={() => undefined} />);
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(t('errors.loadFailed'));
    expect(alert).toHaveTextContent('disk on fire');
    fireEvent.click(screen.getByRole('button', { name: t('errors.retry') }));
    expect(await screen.findByText(/45-min home workout/)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
