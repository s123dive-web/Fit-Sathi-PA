import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Habit, Profile } from '../../types';
import { validateProfile } from '../../utils/profile';
import { t } from '../../i18n';
import { Overlays } from '../../components/ui';
import { useAppStore } from '../../store/appStore';

const upsert = vi.fn(async (_h: Habit) => undefined);
const remove = vi.fn(async (_id: string) => undefined);
let habits: Habit[] = [];

vi.mock('../../db/repos', () => ({
  habitRepo: {
    all: vi.fn(async () => habits),
    allLogs: vi.fn(async () => []),
    upsert: (h: Habit) => upsert(h),
    remove: (id: string) => remove(id),
  },
}));
vi.mock('../../services/actions', () => ({ setHabitStatus: vi.fn(async () => undefined) }));
vi.mock('../../services/sync', () => ({ syncNative: vi.fn(async () => undefined) }));

const walk: Habit = {
  id: 'h_walk',
  name: 'Evening walk',
  emoji: '🚶',
  color: '#22a566',
  kind: 'custom',
  schedule: { type: 'daily' },
  reminderTime: null,
  reminderEnabled: false,
  pinned: true,
  archived: false,
  createdAt: '2026-01-01',
  sortOrder: 0,
  xp: 10,
};

const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'sample/suresh_profile.json'), 'utf8')) as Profile;
const profile = validateProfile(raw).profile!;

describe('<Habits />', () => {
  beforeEach(() => {
    upsert.mockClear();
    remove.mockClear();
    useAppStore.getState().dismissToast();
  });

  it('archives from the editor with an undo toast that restores the habit', async () => {
    habits = [walk];
    const { Habits } = await import('../../screens/Habits');
    render(
      <>
        <Habits profile={profile} />
        <Overlays />
      </>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /Evening walk/ }));
    fireEvent.click(await screen.findByRole('button', { name: t('common.edit') }));
    await screen.findByRole('dialog', { name: t('habits.editHabit') });
    // The editor has no hard delete any more — archive is the default destructive action.
    expect(screen.queryByRole('button', { name: t('common.delete') })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: t('common.archive') }));
    await waitFor(() => expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'h_walk', archived: true })));
    const status = await screen.findByRole('status');
    expect(status).toHaveTextContent(t('habits.archived1', { name: 'Evening walk' }));
    fireEvent.click(screen.getByRole('button', { name: t('common.undo') }));
    await waitFor(() => expect(upsert).toHaveBeenLastCalledWith(expect.objectContaining({ id: 'h_walk', archived: false })));
  });

  it('hard-deletes an archived habit only through the confirm dialog', async () => {
    habits = [{ ...walk, archived: true }];
    const { Habits } = await import('../../screens/Habits');
    render(<Habits profile={profile} />);
    await screen.findByText(t('habits.archived', { n: 1 }));
    fireEvent.click(screen.getByRole('button', { name: t('common.delete') }));
    const dialog = await screen.findByRole('dialog', { name: t('habits.deleteTitle', { name: 'Evening walk' }) });
    expect(remove).not.toHaveBeenCalled();
    // Cancel first: nothing happens.
    fireEvent.click(screen.getByRole('button', { name: t('common.cancel') }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: t('common.delete') }));
    await screen.findByRole('dialog', { name: t('habits.deleteTitle', { name: 'Evening walk' }) });
    // Keyboard / AT activation (click detail 0) confirms without the pointer hold.
    fireEvent.click(screen.getByRole('button', { name: new RegExp(t('habits.deleteForever')) }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('h_walk'));
    expect(dialog).not.toBeInTheDocument();
  });

  it('asks before discarding a dirty draft when the editor is dismissed', async () => {
    habits = [];
    const { Habits } = await import('../../screens/Habits');
    render(<Habits profile={profile} />);
    fireEvent.click((await screen.findAllByRole('button', { name: t('habits.new') }))[0]);
    const dialog = await screen.findByRole('dialog', { name: t('habits.newHabit') });
    fireEvent.change(screen.getByPlaceholderText(t('habits.namePlaceholder')), { target: { value: 'Read 10 pages' } });
    fireEvent.click(screen.getByTestId('modal-backdrop'));
    await screen.findByRole('dialog', { name: t('common.discardTitle') });
    fireEvent.click(screen.getByRole('button', { name: t('common.keepEditing') }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: t('common.discardTitle') })).toBeNull());
    expect(dialog).toBeInTheDocument();
    expect((screen.getByPlaceholderText(t('habits.namePlaceholder')) as HTMLInputElement).value).toBe('Read 10 pages');
  });
});
