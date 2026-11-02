import { useEffect, useState } from 'react';
import type { Habit, HabitLog, HabitStatus, Profile, Settings, SupplementLog } from '../types';
import { habitRepo, stepsRepo, supplementRepo, waterRepo, weightRepo, xpRepo } from '../db/repos';
import { useAsyncData } from '../store/appStore';
import { Card, ProgressRing, Spinner, TickButton, Modal } from '../components/ui';
import { formatDateLong, formatDuration, formatHHMM12, todayISO } from '../logic/dates';
import { habitActiveOn } from '../logic/schedule';
import { computeStreaks } from '../logic/habitStrength';
import { fastingState } from '../logic/fasting';
import { levelFromXp } from '../logic/xp';
import { displayWeight, parseWeightInput } from '../logic/units';
import { addWater, logWeight, setHabitStatus, toggleSupplement, undoWater } from '../services/actions';
import { enableHealthConnect, refreshSteps, type StepsState } from '../services/health';

interface TodayData {
  habits: Habit[];
  logs: HabitLog[];
  allLogs: HabitLog[];
  supLogs: SupplementLog[];
  supStreaks: Record<string, number>;
  water: number;
  latestWeight: { kg: number; date: string } | null;
  xpToday: number;
  xpTotal: number;
  steps: number | null;
}

export function Today({ profile, settings, onOpenHabits }: { profile: Profile; settings: Settings; onOpenHabits: () => void }) {
  const today = todayISO();
  const { data, loading } = useAsyncData<TodayData>(async () => {
    const habits = (await habitRepo.all()).filter((h) => habitActiveOn(h, today));
    const [logs, allLogs, supLogs, water, latest, xpToday, xpTotal, steps] = await Promise.all([
      habitRepo.logsBetween(today, today),
      habitRepo.allLogs(),
      supplementRepo.logsOn(today),
      waterRepo.totalOn(today),
      weightRepo.latest(),
      xpRepo.totalOn(today),
      xpRepo.total(),
      stepsRepo.on(today),
    ]);
    const supStreaks: Record<string, number> = {};
    for (const s of profile.supplements) {
      const sl = await supplementRepo.logsFor(s.id);
      supStreaks[s.id] = supplementStreak(sl.map((l) => l.date), today);
    }
    return {
      habits,
      logs,
      allLogs,
      supLogs,
      supStreaks,
      water,
      latestWeight: latest ? { kg: latest.kg, date: latest.date } : null,
      xpToday,
      xpTotal,
      steps: steps?.steps ?? null,
    };
  });

  if (loading && !data) return <Spinner />;
  if (!data) return null;

  const statusOf = (id: string): HabitStatus | null => data.logs.find((l) => l.habitId === id)?.status ?? null;
  const doneCount = data.habits.filter((h) => statusOf(h.id) === 'done').length;
  const skipCount = data.habits.filter((h) => statusOf(h.id) === 'skip').length;
  const denom = Math.max(1, data.habits.length - skipCount);
  const level = levelFromXp(data.xpTotal);
  const firstName = profile.name.split(' ')[0];

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-xs text-slate-500">{formatDateLong(today)}</div>
          <h1 className="text-xl font-bold">{greeting()}, {firstName}</h1>
        </div>
        <div className="text-right">
          <div className="chip bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">⭐ {data.xpToday} XP today</div>
          <div className="mt-1 text-[11px] text-slate-500">
            Lv {level.level} {level.title} · {data.xpTotal} XP
          </div>
          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full bg-amber-400" style={{ width: `${Math.round(level.progress * 100)}%` }} />
          </div>
        </div>
      </header>

      {profile.fasting.enabled && <FastingCard fasting={profile.fasting} />}

      <Card
        title="Habits"
        action={
          <button className="text-xs font-medium text-brand-600" onClick={onOpenHabits}>
            Manage
          </button>
        }
      >
        {data.habits.length === 0 ? (
          <p className="text-sm text-slate-500">No habits scheduled today. Add some from the Habits tab.</p>
        ) : (
          <>
            <div className="mb-3 flex items-center gap-3">
              <ProgressRing value={doneCount / denom} size={52} stroke={6}>
                <span className="text-xs font-semibold">
                  {doneCount}/{denom}
                </span>
              </ProgressRing>
              <div className="text-sm text-slate-500">
                {doneCount === denom ? 'All done for today! 🎉' : `${denom - doneCount} to go${skipCount ? ` · ${skipCount} skipped` : ''}`}
              </div>
            </div>
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {data.habits.map((h) => {
                const st = statusOf(h.id);
                const streak = computeStreaks(h.schedule, data.allLogs.filter((l) => l.habitId === h.id), h.createdAt, today);
                return (
                  <li key={h.id} className="flex items-center gap-3 py-2.5">
                    <TickButton
                      done={st === 'done'}
                      color={h.color}
                      onClick={(anchor) => void setHabitStatus(h.id, today, st === 'done' ? null : 'done', { xp: h.xp, anchor })}
                    />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-medium ${st === 'done' ? 'text-slate-400 line-through' : ''}`}>
                        {h.emoji} {h.name}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {streak.current > 0 ? `🔥 ${streak.current} ${streak.unit === 'days' ? 'day' : 'week'} streak` : 'No streak yet'}
                        {h.reminderEnabled && h.reminderTime ? ` · ⏰ ${formatHHMM12(h.reminderTime)}` : ''}
                        {st === 'skip' ? ' · skipped (rest)' : st === 'miss' ? ' · missed' : ''}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className={`rounded-lg px-2 py-1 text-[11px] font-medium ${st === 'skip' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                        onClick={() => void setHabitStatus(h.id, today, st === 'skip' ? null : 'skip')}
                        title="Skip — planned rest, keeps your streak"
                      >
                        Skip
                      </button>
                      <button
                        className={`rounded-lg px-2 py-1 text-[11px] font-medium ${st === 'miss' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                        onClick={() => void setHabitStatus(h.id, today, st === 'miss' ? null : 'miss')}
                        title="Miss — counts against your streak"
                      >
                        Miss
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      {profile.supplements.length > 0 && (
        <Card title="Supplements">
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {[...profile.supplements]
              .sort((a, b) => a.time.localeCompare(b.time))
              .map((s) => {
                const taken = data.supLogs.some((l) => l.supplementId === s.id);
                return (
                  <li key={s.id} className="flex items-center gap-3 py-2.5">
                    <TickButton done={taken} color="#8b5cf6" onClick={(anchor) => void toggleSupplement(s.id, today, !taken, anchor)} />
                    <div className="min-w-0 flex-1">
                      <div className={`truncate text-sm font-medium ${taken ? 'text-slate-400 line-through' : ''}`}>💊 {s.name}</div>
                      <div className="text-[11px] text-slate-500">
                        {formatHHMM12(s.time)}
                        {s.dose ? ` · ${s.dose}` : ''}
                        {s.alarm ? ' · ⏰' : ''}
                        {data.supStreaks[s.id] ? ` · 🔥 ${data.supStreaks[s.id]}d` : ''}
                      </div>
                    </div>
                  </li>
                );
              })}
          </ul>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        <WaterCard ml={data.water} target={profile.waterTargetMl} today={today} />
        <WeightCard latest={data.latestWeight} unit={settings.weightUnit} today={today} targetKg={profile.targetWeightKg} />
      </div>

      <StepsCard steps={data.steps} settings={settings} />
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function supplementStreak(dates: string[], today: string): number {
  const set = new Set(dates);
  let streak = 0;
  let d = today;
  if (!set.has(d)) {
    // allow today to be pending
    const y = shift(d, -1);
    if (!set.has(y)) return 0;
    d = y;
  }
  while (set.has(d)) {
    streak += 1;
    d = shift(d, -1);
  }
  return streak;
}

function shift(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function FastingCard({ fasting }: { fasting: Profile['fasting'] }) {
  const [state, setState] = useState(() => fastingState(fasting));
  useEffect(() => {
    const t = setInterval(() => setState(fastingState(fasting)), 1000);
    return () => clearInterval(t);
  }, [fasting]);
  const isFast = state.phase === 'fasting';
  return (
    <Card className={isFast ? 'border-l-4 border-violet-500' : 'border-l-4 border-emerald-500'}>
      <div className="flex items-center gap-4">
        <ProgressRing value={state.progress} size={72} stroke={7} color={isFast ? '#8b5cf6' : '#10b981'}>
          <span className="text-xl">{isFast ? '⏳' : '🍽️'}</span>
        </ProgressRing>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">{isFast ? 'Fasting' : 'Eating window'}</div>
          <div className="font-mono text-2xl font-bold tabular-nums">{formatDuration(state.secondsRemaining)}</div>
          <div className="text-xs text-slate-500">
            {isFast ? `Eating opens at ${formatHHMM12(state.nextChange)}` : `Eating window closes at ${formatHHMM12(state.nextChange)}`} · {state.fastingHours}:{state.eatingHours}
          </div>
        </div>
      </div>
    </Card>
  );
}

function WaterCard({ ml, target, today }: { ml: number; target: number; today: string }) {
  const pct = Math.min(1, ml / target);
  return (
    <Card title="Water">
      <div className="flex flex-col items-center gap-2">
        <ProgressRing value={pct} size={80} stroke={8} color="#0ea5e9">
          <div>
            <div className="text-sm font-bold">{(ml / 1000).toFixed(2)}</div>
            <div className="text-[10px] text-slate-500">/ {(target / 1000).toFixed(1)} L</div>
          </div>
        </ProgressRing>
        <div className="flex w-full gap-1">
          <button className="btn-ghost h-9 w-9 p-0" onClick={() => void undoWater(today)} aria-label="Undo last water" disabled={ml <= 0}>
            −
          </button>
          <button
            className="btn-primary h-9 flex-1 bg-sky-600 hover:bg-sky-700"
            onClick={(e) => void addWater(today, 250, target, { x: e.clientX, y: e.clientY })}
          >
            +250 ml
          </button>
        </div>
      </div>
    </Card>
  );
}

function WeightCard({ latest, unit, today, targetKg }: { latest: { kg: number; date: string } | null; unit: Settings['weightUnit']; today: string; targetKg: number }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(latest ? String(displayWeight(latest.kg, unit)) : '');
  useEffect(() => {
    if (latest) setValue(String(displayWeight(latest.kg, unit)));
  }, [latest, unit]);
  const unitLabel = unit === 'kg' ? 'kg' : 'lb';
  const delta = latest ? latest.kg - targetKg : null;
  return (
    <Card title="Weight">
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-20 flex-col items-center justify-center">
          <div className="text-2xl font-bold">{latest ? displayWeight(latest.kg, unit) : '—'}</div>
          <div className="text-[11px] text-slate-500">
            {latest ? `${unitLabel} · ${latest.date === today ? 'today' : latest.date}` : 'No entry yet'}
          </div>
          {delta !== null && (
            <div className="text-[11px] text-slate-500">
              {Math.abs(delta) < 0.25 ? '🎯 at target' : `${delta > 0 ? '−' : '+'}${displayWeight(Math.abs(delta), unit)} ${unitLabel} to go`}
            </div>
          )}
        </div>
        <button className="btn-ghost h-9 w-full" onClick={() => setOpen(true)}>
          Log weight
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Log today's weight"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={(e) => {
                const v = Number(value);
                if (!v || v <= 0) return;
                void logWeight(today, parseWeightInput(v, unit), { x: e.clientX, y: e.clientY });
                setOpen(false);
              }}
            >
              Save
            </button>
          </>
        }
      >
        <div className="flex items-center gap-2">
          <input className="input text-lg" type="number" step="0.1" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
          <span className="text-sm text-slate-500">{unitLabel}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">Tip: weigh yourself at the same time each morning for a smoother trend.</p>
      </Modal>
    </Card>
  );
}

function StepsCard({ steps, settings }: { steps: number | null; settings: Settings }) {
  const [state, setState] = useState<StepsState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void refreshSteps().then(setState);
  }, [settings.healthConnectEnabled]);
  const shown = state?.steps ?? steps;
  const status = state?.status ?? (settings.healthConnectEnabled ? 'available' : 'disabled');
  let msg: string | null = null;
  if (status === 'disabled') msg = 'Connect Health Connect to show today\'s steps (read-only).';
  else if (status === 'not_installed') msg = 'Health Connect is not installed on this device.';
  else if (status === 'update_required') msg = 'Health Connect needs an update.';
  else if (status === 'unsupported') msg = 'Steps are not available on this platform.';
  else if (status === 'permission_denied') msg = 'Permission not granted. Steps stay hidden until you allow it.';
  return (
    <Card title="Steps">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-bold">{shown !== null && status === 'available' ? shown.toLocaleString() : '—'}</div>
          <div className="text-xs text-slate-500">{msg ?? 'From Health Connect'}</div>
        </div>
        {(status === 'disabled' || status === 'permission_denied') && (
          <button
            className="btn-ghost"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setState(await enableHealthConnect());
              setBusy(false);
            }}
          >
            {busy ? '…' : 'Connect'}
          </button>
        )}
      </div>
    </Card>
  );
}
