import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Habit, Profile, Settings } from '../../types';
import { validateProfile } from '../../utils/profile';

const setHabitStatus = vi.fn(async (..._a: unknown[]) => undefined);
const toggleSupplement = vi.fn(async (..._a: unknown[]) => undefined);
const addWater = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock('../../services/actions', () => ({
  setHabitStatus: (...a: unknown[]) => setHabitStatus(...a),
  toggleSupplement: (...a: unknown[]) => toggleSupplement(...a),
  addWater: (...a: unknown[]) => addWater(...a),
  undoWater: vi.fn(async () => undefined),
  logWeight: vi.fn(async () => undefined),
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

vi.mock('../../db/repos', () => ({
  habitRepo: {
    all: vi.fn(async () => [habit]),
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
};

describe('<Today />', () => {
  beforeEach(() => {
    setHabitStatus.mockClear();
    toggleSupplement.mockClear();
    addWater.mockClear();
  });

  it('renders habits, supplements, water, weight, fasting timer and XP', async () => {
    const { Today } = await import('../../screens/Today');
    render(<Today profile={profile} settings={settings} onOpenHabits={() => undefined} />);
    expect(await screen.findByText(/45-min home workout/)).toBeInTheDocument();
    expect(screen.getAllByText(/Sea buckthorn juice/).length).toBe(2);
    expect(screen.getByText('⭐ 15 XP today')).toBeInTheDocument();
    expect(screen.getByText('0.50')).toBeInTheDocument();
    expect(screen.getByText('76')).toBeInTheDocument();
    expect(screen.getByTestId('fasting-timer').textContent).toMatch(/^\d\d:\d\d:\d\d$/);
  });

  it('one-tap done marks the habit and skip is a separate action', async () => {
    const { Today } = await import('../../screens/Today');
    render(<Today profile={profile} settings={settings} onOpenHabits={() => undefined} />);
    await screen.findByText(/45-min home workout/);
    fireEvent.click(screen.getByLabelText('45-min home workout: mark done'));
    await waitFor(() => expect(setHabitStatus).toHaveBeenCalledWith('h1', expect.any(String), 'done', expect.objectContaining({ xp: 10 })));
    fireEvent.click(screen.getAllByText('Skip')[0]);
    await waitFor(() => expect(setHabitStatus).toHaveBeenLastCalledWith('h1', expect.any(String), 'skip'));
  });

  it('ticks a supplement and adds water', async () => {
    const { Today } = await import('../../screens/Today');
    render(<Today profile={profile} settings={settings} onOpenHabits={() => undefined} />);
    await screen.findByText(/45-min home workout/);
    fireEvent.click(screen.getByLabelText('Sea buckthorn oil capsule 13:55: mark taken'));
    await waitFor(() => expect(toggleSupplement).toHaveBeenCalledWith('sup_sea_buckthorn_oil_capsule_1355', expect.any(String), true, expect.anything()));
    fireEvent.click(screen.getByText('+250 ml'));
    await waitFor(() => expect(addWater).toHaveBeenCalledWith(expect.any(String), 250, 3000, expect.anything()));
  });
});
