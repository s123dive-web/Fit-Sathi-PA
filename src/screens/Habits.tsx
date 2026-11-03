import { useEffect, useMemo, useState } from 'react';
import type { Habit, HabitLog, HabitStatus, Profile } from '../types';
import { habitRepo } from '../db/repos';
import { notifyChange, toast, useAsyncData, usePendingActions } from '../store/appStore';
import { t, tn } from '../i18n';
import { Card, ConfirmDialog, EmptyState, ErrorCard, Field, Modal, Spinner, Stat, TimeInput, Toggle, WeekdayPicker } from '../components/ui';
import { HeatGrid } from '../components/HeatGrid';
import { addDays, formatTime, todayISO } from '../utils/dates';
import { describeSchedule, isScheduledOn } from '../utils/schedule';
import { completionStats, computeStreaks, computeStrength } from '../utils/habitStrength';
import { newId } from '../utils/ids';
import { setHabitStatus } from '../services/actions';
import { syncNative } from '../services/sync';

const COLORS = ['#22a566', '#f97316', '#8b5cf6', '#0ea5e9', '#e11d48', '#eab308', '#14b8a6', '#6366f1'];
const EMOJIS = ['✅', '🏋️', '🏃', '🚶', '🧘', '💧', '😴', '📖', '🥗', '🍵', '⏳', '🧹', '💊', '🚭', '🎯', '🌅'];
const XP_MIN = 1;
const XP_MAX = 100;

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** Archive a habit (keeps history) with a 6 s undo toast. */
async function archiveHabit(h: Habit): Promise<void> {
  await habitRepo.upsert({ ...h, archived: true });
  notifyChange();
  void syncNative();
  toast(t('habits.archived1', { name: h.name }), 'info', {
    action: {
      label: t('common.undo'),
      onClick: () => {
        void habitRepo
          .upsert({ ...h, archived: false })
          .then(() => {
            notifyChange();
            void syncNative();
          })
          .catch((e) => toast(t('common.actionFailed', { msg: errMsg(e) }), 'error'));
      },
    },
  });
}

export function Habits({ profile }: { profile: Profile }) {
  const today = todayISO();
  const [editing, setEditing] = useState<Habit | null | 'new'>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Habit | null>(null);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const habits = await habitRepo.all(true);
    const logs = await habitRepo.allLogs();
    return { habits, logs };
  });

  // Streaks / strength are computed once per data load, not per render.
  const computed = useMemo(() => {
    if (!data) return null;
    const logsByHabit = new Map<string, HabitLog[]>();
    for (const l of data.logs) {
      const arr = logsByHabit.get(l.habitId);
      if (arr) arr.push(l);
      else logsByHabit.set(l.habitId, [l]);
    }
    const stats = new Map<string, { strength: ReturnType<typeof computeStrength>; streak: ReturnType<typeof computeStreaks>; today: HabitStatus | null }>();
    for (const h of data.habits) {
      const logs = logsByHabit.get(h.id) ?? [];
      stats.set(h.id, {
        strength: computeStrength(h.schedule, logs, h.createdAt, today),
        streak: computeStreaks(h.schedule, logs, h.createdAt, today),
        today: logs.find((l) => l.date === today)?.status ?? null,
      });
    }
    return { logsByHabit, stats };
  }, [data, today]);

  if (!data || !computed) {
    if (error) return <ErrorCard message={error} onRetry={reload} />;
    if (loading) return <Spinner />;
    return null;
  }

  const active = data.habits.filter((h) => !h.archived);
  const archived = data.habits.filter((h) => h.archived);
  const sel = selected ? (data.habits.find((h) => h.id === selected) ?? null) : null;

  if (sel) {
    return (
      <HabitDetail
        habit={sel}
        logs={computed.logsByHabit.get(sel.id) ?? []}
        today={today}
        onBack={() => setSelected(null)}
        onEdit={() => setEditing(sel)}
        editing={editing}
        onCloseEdit={() => setEditing(null)}
      />
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 md:max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('habits.title')}</h1>
        <button className="btn-primary" onClick={() => setEditing('new')}>
          {t('habits.new')}
        </button>
      </header>

      {active.length === 0 && (
        <EmptyState
          emoji="🌱"
          title={t('habits.empty')}
          body={t('habits.emptyBody')}
          action={
            <button className="btn-primary" onClick={() => setEditing('new')}>
              {t('habits.create')}
            </button>
          }
        />
      )}

      <ul className="fold-aware grid gap-3 md:grid-cols-2 md:gap-6">
        {active.map((h) => {
          const s = computed.stats.get(h.id)!;
          const scheduledToday = isScheduledOn(h.schedule, today);
          return (
            <li key={h.id}>
              <button className="card w-full text-left active:scale-[0.99]" onClick={() => setSelected(h.id)}>
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl text-2xl" style={{ background: `${h.color}22` }} aria-hidden="true">
                    {h.emoji}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{h.name}</div>
                    <div className="text-xs text-slate-500">
                      {describeSchedule(h.schedule)}
                      {h.reminderEnabled && h.reminderTime ? ` · ⏰ ${formatTime(h.reminderTime)}` : ''}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-semibold" style={{ color: h.color }}>
                      {s.strength.percent}%
                    </div>
                    <div className="text-[11px] text-slate-500">{t('habits.streakCount', { n: s.streak.current })}</div>
                  </div>
                </div>
                <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
                  <div className="h-full rounded-full" style={{ width: `${s.strength.percent}%`, background: h.color }} />
                </div>
                {scheduledToday && (
                  <div className="mt-2 text-[11px] text-slate-500">
                    {t('habits.todayStatus', {
                      status:
                        s.today === 'done'
                          ? `✅ ${t('common.done')}`
                          : s.today === 'skip'
                            ? `⏭ ${t('habits.legendSkipped')}`
                            : s.today === 'miss'
                              ? `❌ ${t('habits.legendMissed')}`
                              : t('habits.pending'),
                    })}
                  </div>
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {archived.length > 0 && (
        <Card title={t('habits.archived', { n: archived.length })}>
          <ul className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
            {archived.map((h) => (
              <li key={h.id} className="flex items-center justify-between gap-2 py-1">
                <span className="min-w-0 truncate text-slate-500">
                  <span aria-hidden="true">{h.emoji}</span> {h.name}
                </span>
                <span className="flex shrink-0 gap-1">
                  <button
                    className="min-h-[44px] px-2 text-xs font-medium text-brand-600"
                    onClick={async () => {
                      try {
                        await habitRepo.upsert({ ...h, archived: false });
                        notifyChange();
                        void syncNative();
                      } catch (e) {
                        toast(t('common.actionFailed', { msg: errMsg(e) }), 'error');
                      }
                    }}
                  >
                    {t('common.restore')}
                  </button>
                  <button className="min-h-[44px] px-2 text-xs font-medium text-rose-600" onClick={() => setDeleting(h)}>
                    {t('common.delete')}
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleting}
        title={t('habits.deleteTitle', { name: deleting?.name ?? '' })}
        body={t('habits.deleteBody')}
        confirmLabel={t('habits.deleteForever')}
        holdMs={900}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          if (!deleting) return;
          await habitRepo.remove(deleting.id);
          notifyChange();
          void syncNative();
        }}
      />

      <HabitEditor
        open={editing !== null}
        habit={editing === 'new' ? null : editing}
        defaultReminder={profile.notifications.eveningCheckIn ?? '20:00'}
        nextOrder={data.habits.length}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function HabitDetail({
  habit,
  logs,
  today,
  onBack,
  onEdit,
  editing,
  onCloseEdit,
}: {
  habit: Habit;
  logs: HabitLog[];
  today: string;
  onBack: () => void;
  onEdit: () => void;
  editing: Habit | null | 'new';
  onCloseEdit: () => void;
}) {
  const stats = useMemo(() => {
    const from30 = addDays(today, -29) > habit.createdAt ? addDays(today, -29) : habit.createdAt;
    return {
      strength: computeStrength(habit.schedule, logs, habit.createdAt, today),
      streak: computeStreaks(habit.schedule, logs, habit.createdAt, today),
      stats30: completionStats(habit.schedule, logs, from30, today, today),
      statsAll: completionStats(habit.schedule, logs, habit.createdAt, today, today),
    };
  }, [habit, logs, today]);
  const [day, setDay] = useState(today);
  const pending = usePendingActions<HabitStatus | null>(logs, (e) => toast(t('common.actionFailed', { msg: errMsg(e) }), 'error'));
  const pendingStatus = pending.get(`day:${day}`);
  const dayStatus: HabitStatus | null = pendingStatus !== undefined ? pendingStatus : (logs.find((l) => l.date === day)?.status ?? null);
  const busy = pending.has(`day:${day}`);
  const unitLabel = stats.streak.unit === 'days' ? t('habits.unitDays') : t('habits.unitWeeks');

  const setDay2 = (s: HabitStatus | null) =>
    void pending.run(`day:${day}`, s, () => setHabitStatus(habit.id, day, s, s === 'done' ? { xp: habit.xp, silent: day !== today } : { silent: true }));

  return (
    <div className="mx-auto max-w-lg space-y-4 md:max-w-3xl">
      <header className="flex items-center gap-3">
        <button className="btn-ghost w-12 p-0" onClick={onBack} aria-label={t('common.back')}>
          ←
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold">
            <span aria-hidden="true">{habit.emoji}</span> {habit.name}
          </h1>
          <div className="text-xs text-slate-500">{describeSchedule(habit.schedule)}</div>
        </div>
        <button className="btn-ghost" onClick={onEdit}>
          {t('common.edit')}
        </button>
      </header>

      <div className="grid grid-cols-2 gap-3">
        <Stat label={t('habits.strength')} value={<span style={{ color: habit.color }}>{stats.strength.percent}%</span>} sub={t('habits.strengthHint')} />
        <Stat label={t('habits.currentStreak')} value={t('habits.streakCount', { n: stats.streak.current })} sub={t('habits.best', { n: stats.streak.best, unit: unitLabel })} />
        <Stat
          label={t('habits.last30')}
          value={`${stats.stats30.percent}%`}
          sub={`${stats.stats30.done} ${t('habits.legendDone')} · ${stats.stats30.skipped} ${t('habits.legendSkipped')} · ${stats.stats30.missed} ${t('habits.legendMissed')}`}
        />
        <Stat label={t('habits.allTime')} value={`${stats.statsAll.percent}%`} sub={t('habits.since', { date: habit.createdAt })} />
      </div>

      <Card title={t('habits.history')}>
        <HeatGrid logs={logs} today={today} color={habit.color} scheduled={(d) => d >= habit.createdAt && isScheduledOn(habit.schedule, d)} />
        <div className="mt-2 flex gap-3 text-[11px] text-slate-500">
          <span className="flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded-[3px]" style={{ background: habit.color }} aria-hidden="true" /> {t('habits.legendDone')}
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded-[3px] bg-sky-200 dark:bg-sky-900" aria-hidden="true" /> {t('habits.legendSkipped')}
          </span>
          <span className="flex items-center gap-1">
            <i className="inline-block h-3 w-3 rounded-[3px] bg-rose-100 dark:bg-rose-950" aria-hidden="true" /> {t('habits.legendMissed')}
          </span>
        </div>
      </Card>

      <Card title={t('habits.logPast')}>
        <div className="flex items-center gap-2">
          <input
            type="date"
            className="input"
            value={day}
            max={today}
            min={habit.createdAt}
            aria-label={t('habits.logPast')}
            onChange={(e) => e.target.value && setDay(e.target.value)}
          />
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {(['done', 'skip', 'miss'] as HabitStatus[]).map((s) => (
            <button
              key={s}
              className={`btn ${dayStatus === s ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
              aria-pressed={dayStatus === s}
              aria-busy={busy || undefined}
              disabled={busy}
              onClick={() => setDay2(dayStatus === s ? null : s)}
            >
              {s === 'done' ? `✅ ${t('common.done')}` : s === 'skip' ? `⏭ ${t('common.skip')}` : `❌ ${t('common.miss')}`}
            </button>
          ))}
          <button className="btn bg-slate-100 dark:bg-slate-800" disabled={busy || dayStatus === null} onClick={() => setDay2(null)}>
            {t('common.clear')}
          </button>
        </div>
      </Card>

      <HabitEditor
        open={editing !== null && editing !== 'new'}
        habit={editing === 'new' ? null : editing}
        defaultReminder="20:00"
        nextOrder={habit.sortOrder}
        onClose={onCloseEdit}
        onArchived={onBack}
      />
    </div>
  );
}

function HabitEditor({
  open,
  habit,
  defaultReminder,
  nextOrder,
  onClose,
  onArchived,
}: {
  open: boolean;
  habit: Habit | null;
  defaultReminder: string;
  nextOrder: number;
  onClose: () => void;
  onArchived?: () => void;
}) {
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
  const [initial, setInitial] = useState<Habit>(() => habit ?? blank());
  const [draft, setDraft] = useState<Habit>(initial);
  const [xpStr, setXpStr] = useState(String(initial.xp));
  const [key, setKey] = useState<string | null>(habit?.id ?? null);
  const [askDiscard, setAskDiscard] = useState(false);
  const [saving, setSaving] = useState(false);
  if (open && (habit?.id ?? null) !== key) {
    // reset when a different habit is opened
    const next = habit ?? blank();
    setInitial(next);
    setDraft(next);
    setXpStr(String(next.xp));
    setKey(habit?.id ?? null);
  }
  useEffect(() => {
    if (!open) setAskDiscard(false);
  }, [open]);
  const set = (patch: Partial<Habit>) => setDraft((d) => ({ ...d, ...patch }));
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial);
  const xpNum = Number(xpStr);
  const xpError = !xpStr.trim() || !Number.isInteger(xpNum) || xpNum < XP_MIN || xpNum > XP_MAX ? t('habits.xpRange', { min: XP_MIN, max: XP_MAX }) : null;

  const resetToBlank = () => {
    const next = blank();
    setInitial(next);
    setDraft(next);
    setXpStr(String(next.xp));
  };

  const requestClose = () => {
    if (dirty && !saving) setAskDiscard(true);
    else onClose();
  };

  const save = async () => {
    if (!draft.name.trim()) {
      toast(t('habits.nameRequired'), 'error');
      return;
    }
    if (draft.schedule.type === 'weekdays' && !(draft.schedule.weekdays ?? []).length) {
      toast(t('habits.pickDay'), 'error');
      return;
    }
    if (xpError) {
      toast(xpError, 'error');
      return;
    }
    setSaving(true);
    try {
      await habitRepo.upsert({ ...draft, name: draft.name.trim(), xp: xpNum });
      notifyChange();
      void syncNative();
      onClose();
      if (!habit) resetToBlank();
    } catch (e) {
      toast(t('common.actionFailed', { msg: errMsg(e) }), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={requestClose}
      title={habit ? t('habits.editHabit') : t('habits.newHabit')}
      footer={
        <>
          {habit && (
            <button
              className="btn-ghost"
              disabled={saving}
              onClick={async () => {
                try {
                  if (habit.archived) {
                    await habitRepo.upsert({ ...habit, archived: false });
                    notifyChange();
                    void syncNative();
                  } else {
                    await archiveHabit(habit);
                  }
                  onClose();
                  if (!habit.archived) onArchived?.();
                } catch (e) {
                  toast(t('common.actionFailed', { msg: errMsg(e) }), 'error');
                }
              }}
            >
              {habit.archived ? t('common.restore') : t('common.archive')}
            </button>
          )}
          <button className="btn-primary" onClick={save} disabled={saving}>
            {saving ? t('common.saving') : t('common.save')}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={t('habits.name')}>
          <input className="input" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder={t('habits.namePlaceholder')} autoFocus />
        </Field>
        <Field label={t('habits.icon')}>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t('habits.icon')}>
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                aria-pressed={draft.emoji === e}
                onClick={() => set({ emoji: e })}
                className={`h-11 w-11 rounded-lg text-lg ${draft.emoji === e ? 'bg-brand-100 ring-2 ring-brand-500 dark:bg-brand-900' : 'bg-slate-100 dark:bg-slate-800'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label={t('habits.colour')}>
          <div className="flex flex-wrap gap-2" role="group" aria-label={t('habits.colour')}>
            {COLORS.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={c}
                aria-pressed={draft.color === c}
                onClick={() => set({ color: c })}
                className={`h-11 w-11 shrink-0 rounded-full ${draft.color === c ? 'ring-2 ring-offset-2 ring-slate-500 dark:ring-offset-slate-900' : ''}`}
                style={{ background: c }}
              />
            ))}
          </div>
        </Field>
        <Field label={t('habits.schedule')}>
          <div className="grid grid-cols-3 gap-2">
            {(['daily', 'times_per_week', 'weekdays'] as const).map((sched) => (
              <button
                key={sched}
                type="button"
                aria-pressed={draft.schedule.type === sched}
                className={`btn ${draft.schedule.type === sched ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                onClick={() =>
                  set({
                    schedule:
                      sched === 'daily'
                        ? { type: 'daily' }
                        : sched === 'times_per_week'
                          ? { type: 'times_per_week', timesPerWeek: draft.schedule.timesPerWeek ?? 3 }
                          : { type: 'weekdays', weekdays: draft.schedule.weekdays ?? [1, 3, 5] },
                  })
                }
              >
                {sched === 'daily' ? t('habits.daily') : sched === 'times_per_week' ? t('habits.perWeek') : t('habits.weekdays')}
              </button>
            ))}
          </div>
          {draft.schedule.type === 'times_per_week' && (
            <div className="mt-2 flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={6}
                value={draft.schedule.timesPerWeek ?? 3}
                aria-label={t('habits.perWeek')}
                onChange={(e) => set({ schedule: { type: 'times_per_week', timesPerWeek: Number(e.target.value) } })}
                className="flex-1"
              />
              <span className="w-20 text-sm">{tn('habits.perWeekCount', draft.schedule.timesPerWeek ?? 3)}</span>
            </div>
          )}
          {draft.schedule.type === 'weekdays' && (
            <div className="mt-2">
              <WeekdayPicker value={draft.schedule.weekdays ?? []} onChange={(weekdays) => set({ schedule: { type: 'weekdays', weekdays } })} />
            </div>
          )}
        </Field>
        <div className="flex items-center justify-between">
          <span className="text-sm">{t('habits.reminder')}</span>
          <Toggle
            checked={draft.reminderEnabled}
            onChange={(v) => set({ reminderEnabled: v, reminderTime: draft.reminderTime ?? defaultReminder })}
            label={t('habits.reminder')}
          />
        </div>
        {draft.reminderEnabled && <TimeInput value={draft.reminderTime ?? defaultReminder} onChange={(v) => set({ reminderTime: v })} label={t('habits.reminder')} />}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm">{t('habits.pinned')}</div>
            <div className="text-xs text-slate-500">{t('habits.pinnedHint')}</div>
          </div>
          <Toggle checked={draft.pinned} onChange={(v) => set({ pinned: v })} label={t('habits.pinned')} />
        </div>
        <Field label={t('habits.xpPer')} error={xpError}>
          <input
            className="input"
            type="number"
            inputMode="numeric"
            min={XP_MIN}
            max={XP_MAX}
            value={xpStr}
            aria-invalid={!!xpError}
            onChange={(e) => {
              setXpStr(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value.trim() && Number.isInteger(n) && n >= XP_MIN && n <= XP_MAX) set({ xp: n });
            }}
            onBlur={() => {
              const n = Math.min(XP_MAX, Math.max(XP_MIN, Math.round(Number(xpStr) || draft.xp)));
              setXpStr(String(n));
              set({ xp: n });
            }}
          />
        </Field>
      </div>
      <ConfirmDialog
        open={askDiscard}
        title={t('common.discardTitle')}
        body={t('common.discardBody')}
        confirmLabel={t('common.discard')}
        cancelLabel={t('common.keepEditing')}
        onClose={() => setAskDiscard(false)}
        onConfirm={() => {
          setAskDiscard(false);
          if (habit) {
            setDraft(habit);
            setXpStr(String(habit.xp));
          } else resetToBlank();
          onClose();
        }}
      />
    </Modal>
  );
}
