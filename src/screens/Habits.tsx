import { useState } from 'react';
import type { Habit, HabitLog, HabitStatus, Profile } from '../types';
import { habitRepo } from '../db/repos';
import { notifyChange, toast, useAsyncData } from '../store/appStore';
import { Card, EmptyState, Field, Modal, Spinner, Stat, TimeInput, Toggle, WeekdayPicker } from '../components/ui';
import { HeatGrid } from '../components/HeatGrid';
import { addDays, formatHHMM12, todayISO } from '../logic/dates';
import { describeSchedule, isScheduledOn } from '../logic/schedule';
import { completionStats, computeStreaks, computeStrength } from '../logic/habitStrength';
import { newId } from '../logic/ids';
import { setHabitStatus } from '../services/actions';
import { syncNative } from '../services/sync';

const COLORS = ['#22a566', '#f97316', '#8b5cf6', '#0ea5e9', '#e11d48', '#eab308', '#14b8a6', '#6366f1'];
const EMOJIS = ['✅', '🏋️', '🏃', '🚶', '🧘', '💧', '😴', '📖', '🥗', '🍵', '⏳', '🧹', '💊', '🚭', '🎯', '🌅'];

export function Habits({ profile }: { profile: Profile }) {
  const today = todayISO();
  const [editing, setEditing] = useState<Habit | null | 'new'>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const { data, loading } = useAsyncData(async () => {
    const habits = await habitRepo.all(true);
    const logs = await habitRepo.allLogs();
    return { habits, logs };
  });
  if (loading && !data) return <Spinner />;
  if (!data) return null;

  const active = data.habits.filter((h) => !h.archived);
  const archived = data.habits.filter((h) => h.archived);
  const sel = selected ? data.habits.find((h) => h.id === selected) ?? null : null;

  if (sel) {
    return (
      <HabitDetail
        habit={sel}
        logs={data.logs.filter((l) => l.habitId === sel.id)}
        today={today}
        onBack={() => setSelected(null)}
        onEdit={() => setEditing(sel)}
        editing={editing}
        onCloseEdit={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Habits</h1>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          + New habit
        </button>
      </header>

      {active.length === 0 && (
        <EmptyState emoji="🌱" title="No habits yet" body="Create your first habit. Flexible schedules: daily, N× per week or specific weekdays." action={<button className="btn-primary" onClick={() => setEditing('new')}>Create habit</button>} />
      )}

      <ul className="space-y-3">
        {active.map((h) => {
          const logs = data.logs.filter((l) => l.habitId === h.id);
          const strength = computeStrength(h.schedule, logs, h.createdAt, today);
          const streak = computeStreaks(h.schedule, logs, h.createdAt, today);
          const st = logs.find((l) => l.date === today)?.status ?? null;
          const scheduledToday = isScheduledOn(h.schedule, today);
          return (
            <li key={h.id}>
              <button className="card w-full text-left active:scale-[0.99]" onClick={() => setSelected(h.id)}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl" style={{ background: `${h.color}22` }}>
                    {h.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{h.name}</div>
                    <div className="text-xs text-slate-500">
                      {describeSchedule(h.schedule)}
                      {h.reminderEnabled && h.reminderTime ? ` · ⏰ ${formatHHMM12(h.reminderTime)}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold" style={{ color: h.color }}>
                      {strength.percent}%
                    </div>
                    <div className="text-[11px] text-slate-500">🔥 {streak.current}</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                  <div className="h-full rounded-full" style={{ width: `${strength.percent}%`, background: h.color }} />
                </div>
                {scheduledToday && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    Today: {st === 'done' ? '✅ done' : st === 'skip' ? '⏭ skipped' : st === 'miss' ? '❌ missed' : 'pending'}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {archived.length > 0 && (
        <Card title={`Archived (${archived.length})`}>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {archived.map((h) => (
              <li key={h.id} className="flex items-center justify-between py-2">
                <span className="text-slate-500">
                  {h.emoji} {h.name}
                </span>
                <button
                  className="text-xs text-brand-600"
                  onClick={async () => {
                    await habitRepo.upsert({ ...h, archived: false });
                    notifyChange();
                  }}
                >
                  Restore
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <HabitEditor
        open={editing !== null}
        habit={editing === 'new' ? null : editing}
        defaultReminder={profile.preferences?.habitReminderTime ?? '20:00'}
        nextOrder={data.habits.length}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function HabitDetail({ habit, logs, today, onBack, onEdit, editing, onCloseEdit }: { habit: Habit; logs: HabitLog[]; today: string; onBack: () => void; onEdit: () => void; editing: Habit | null | 'new'; onCloseEdit: () => void }) {
  const strength = computeStrength(habit.schedule, logs, habit.createdAt, today);
  const streak = computeStreaks(habit.schedule, logs, habit.createdAt, today);
  const stats30 = completionStats(habit.schedule, logs, addDays(today, -29) > habit.createdAt ? addDays(today, -29) : habit.createdAt, today);
  const statsAll = completionStats(habit.schedule, logs, habit.createdAt, today);
  const [day, setDay] = useState(today);
  const dayStatus: HabitStatus | null = logs.find((l) => l.date === day)?.status ?? null;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header className="flex items-center gap-3">
        <button className="btn-ghost h-9 w-9 p-0" onClick={onBack} aria-label="Back">
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">
            {habit.emoji} {habit.name}
          </h1>
          <div className="text-xs text-slate-500">{describeSchedule(habit.schedule)}</div>
        </div>
        <button className="btn-ghost" onClick={onEdit}>
          Edit
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Strength" value={<span style={{ color: habit.color }}>{strength.percent}%</span>} sub="Loop-style score, gentle decay" />
        <Stat label="Current streak" value={`🔥 ${streak.current}`} sub={`best ${streak.best} ${streak.unit}`} />
        <Stat label="Last 30 days" value={`${stats30.percent}%`} sub={`${stats30.done} done · ${stats30.skipped} skipped · ${stats30.missed} missed`} />
        <Stat label="All time" value={`${statsAll.percent}%`} sub={`since ${habit.createdAt}`} />
      </div>

      <Card title="History">
        <HeatGrid logs={logs} today={today} color={habit.color} scheduled={(d) => d >= habit.createdAt && isScheduledOn(habit.schedule, d)} />
        <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-[3px]" style={{ background: habit.color }} /> done</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-[3px] bg-sky-200" /> skipped</span>
          <span className="flex items-center gap-1"><i className="inline-block h-3 w-3 rounded-[3px] bg-rose-100" /> missed</span>
        </div>
      </Card>

      <Card title="Log a past day">
        <div className="flex items-center gap-2">
          <input type="date" className="input" value={day} max={today} min={habit.createdAt} onChange={(e) => e.target.value && setDay(e.target.value)} />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {(['done', 'skip', 'miss'] as HabitStatus[]).map((s) => (
            <button
              key={s}
              className={`btn ${dayStatus === s ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              onClick={() => void setHabitStatus(habit.id, day, s, { xp: habit.xp, silent: day !== today })}
            >
              {s === 'done' ? '✅ Done' : s === 'skip' ? '⏭ Skip' : '❌ Miss'}
            </button>
          ))}
          <button className="btn bg-slate-100 dark:bg-slate-800" onClick={() => void setHabitStatus(habit.id, day, null, { silent: true })}>
            Clear
          </button>
        </div>
      </Card>

      <HabitEditor open={editing !== null && editing !== 'new'} habit={editing === 'new' ? null : editing} defaultReminder="20:00" nextOrder={habit.sortOrder} onClose={onCloseEdit} onDeleted={onBack} />
    </div>
  );
}

function HabitEditor({ open, habit, defaultReminder, nextOrder, onClose, onDeleted }: { open: boolean; habit: Habit | null; defaultReminder: string; nextOrder: number; onClose: () => void; onDeleted?: () => void }) {
  const blank = (): Habit => ({
    id: newId('hab'),
    name: '',
    emoji: '✅',
    color: COLORS[nextOrder % COLORS.length],
    kind: 'custom',
    schedule: { type: 'daily' },
    reminderTime: defaultReminder,
    reminderEnabled: false,
    pinned: true,
    archived: false,
    createdAt: todayISO(),
    sortOrder: nextOrder,
    xp: 10,
  });
  const [draft, setDraft] = useState<Habit>(habit ?? blank());
  const [key, setKey] = useState<string | null>(habit?.id ?? null);
  if (open && (habit?.id ?? null) !== key) {
    // reset when a different habit is opened
    setDraft(habit ?? blank());
    setKey(habit?.id ?? null);
  }
  const set = (patch: Partial<Habit>) => setDraft({ ...draft, ...patch });

  const save = async () => {
    if (!draft.name.trim()) {
      toast('Give the habit a name', 'error');
      return;
    }
    if (draft.schedule.type === 'weekdays' && !(draft.schedule.weekdays ?? []).length) {
      toast('Pick at least one weekday', 'error');
      return;
    }
    await habitRepo.upsert({ ...draft, name: draft.name.trim() });
    notifyChange();
    void syncNative();
    onClose();
    if (!habit) setDraft(blank());
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={habit ? 'Edit habit' : 'New habit'}
      footer={
        <>
          {habit && (
            <>
              <button
                className="btn-ghost"
                onClick={async () => {
                  await habitRepo.upsert({ ...draft, archived: !draft.archived });
                  notifyChange();
                  void syncNative();
                  onClose();
                }}
              >
                {draft.archived ? 'Restore' : 'Archive'}
              </button>
              <button
                className="btn-danger"
                onClick={async () => {
                  if (!confirm(`Delete "${habit.name}" and all its history?`)) return;
                  await habitRepo.remove(habit.id);
                  notifyChange();
                  void syncNative();
                  onClose();
                  onDeleted?.();
                }}
              >
                Delete
              </button>
            </>
          )}
          <button className="btn-primary" onClick={save}>
            Save
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Name">
          <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="e.g. Evening walk" autoFocus />
        </Field>
        <Field label="Icon">
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => set({ emoji: e })} className={`h-9 w-9 rounded-lg text-lg ${draft.emoji === e ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-900' : 'bg-slate-100 dark:bg-slate-800'}`}>
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Colour">
          <div className="flex gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => set({ color: c })} className={`h-8 w-8 rounded-full ${draft.color === c ? 'ring-2 ring-offset-2 ring-slate-500 dark:ring-offset-slate-900' : ''}`} style={{ background: c }} />
            ))}
          </div>
        </Field>
        <Field label="Schedule">
          <div className="grid grid-cols-3 gap-2">
            {(['daily', 'times_per_week', 'weekdays'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className={`btn ${draft.schedule.type === t ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                onClick={() => set({ schedule: t === 'daily' ? { type: 'daily' } : t === 'times_per_week' ? { type: 'times_per_week', timesPerWeek: draft.schedule.timesPerWeek ?? 3 } : { type: 'weekdays', weekdays: draft.schedule.weekdays ?? [1, 3, 5] } })}
              >
                {t === 'daily' ? 'Daily' : t === 'times_per_week' ? 'N× / week' : 'Weekdays'}
              </button>
            ))}
          </div>
          {draft.schedule.type === 'times_per_week' && (
            <div className="mt-2 flex items-center gap-2">
              <input type="range" min={1} max={6} value={draft.schedule.timesPerWeek ?? 3} onChange={(e) => set({ schedule: { type: 'times_per_week', timesPerWeek: Number(e.target.value) } })} className="flex-1" />
              <span className="w-20 text-sm">{draft.schedule.timesPerWeek ?? 3}× / week</span>
            </div>
          )}
          {draft.schedule.type === 'weekdays' && (
            <div className="mt-2">
              <WeekdayPicker value={draft.schedule.weekdays ?? []} onChange={(weekdays) => set({ schedule: { type: 'weekdays', weekdays } })} />
            </div>
          )}
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-sm">Reminder</span>
          <Toggle checked={draft.reminderEnabled} onChange={(v) => set({ reminderEnabled: v, reminderTime: draft.reminderTime ?? defaultReminder })} label="Reminder" />
        </div>
        {draft.reminderEnabled && <TimeInput value={draft.reminderTime ?? defaultReminder} onChange={(v) => set({ reminderTime: v })} />}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">Show in notification & widget</div>
            <div className="text-xs text-slate-500">Pinned notification with tick buttons</div>
          </div>
          <Toggle checked={draft.pinned} onChange={(v) => set({ pinned: v })} label="Pinned" />
        </div>
        <Field label="XP per completion">
          <input className="input" type="number" min={1} max={100} value={draft.xp} onChange={(e) => set({ xp: Number(e.target.value) || 10 })} />
        </Field>
      </div>
    </Modal>
  );
}
