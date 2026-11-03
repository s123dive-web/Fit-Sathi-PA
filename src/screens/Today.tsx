import { useEffect, useState } from 'react';
import type { Habit, HabitLog, HabitStatus, ISODate, Profile, Settings, SupplementLog } from '../types';
import { habitRepo, pointsRepo, stepsRepo, supplementRepo, waterRepo, weightRepo } from '../db/repos';
import { useAsyncData } from '../store/appStore';
import { Card, Modal, ProgressRing, Spinner, TickButton } from '../components/ui';
import { addDays, formatDateLong, formatDuration, formatHHMM12, todayISO } from '../utils/dates';
import { habitActiveOn } from '../utils/schedule';
import { computeStreaks } from '../utils/habitStrength';
import { fastingState } from '../utils/fasting';
import { levelFromXp } from '../utils/xp';
import { displayWeight, parseWeightInput } from '../utils/units';
import { addWater, logWeight, setHabitStatus, toggleSupplement, undoWater } from '../services/actions';
import { enableHealthConnect, refreshSteps, type StepsState } from '../services/health';
import { t } from '../i18n';

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
      pointsRepo.totalOn(today),
      pointsRepo.total(),
      stepsRepo.on(today),
    ]);
    const supStreaks: Record<string, number> = {};
    for (const s of profile.supplements) {
      const sl = await supplementRepo.logsFor(s.id);
      supStreaks[s.id] = supplementStreak(
        sl.map((l) => l.date),
        today,
      );
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
  const firstName = profile.user.name.split(' ')[0];

  return (
    <div className="mx-auto max-w-lg space-y-4 md:max-w-4xl">
      <header className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-slate-500">{formatDateLong(today)}</div>
          <h1 className="text-xl font-bold">
            {greeting()}, {firstName}
          </h1>
        </div>
        <div className="text-right">
          <div className="chip bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{t('today.xpToday', { xp: data.xpToday })}</div>
          <div className="mt-1 text-[11px] text-slate-500">{t('today.level', { level: level.level, title: level.title, xp: data.xpTotal })}</div>
          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
            <div className="h-full bg-amber-400" style={{ width: `${Math.round(level.progress * 100)}%` }} />
          </div>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-2 md:items-start">
        <div className="space-y-4">
          {profile.fasting.enabled && <FastingCard fasting={profile.fasting} />}

          <Card
            title={t('today.habits')}
            action={
              <button className="min-h-[44px] px-2 text-xs font-medium text-brand-600" onClick={onOpenHabits}>
                {t('common.manage')}
              </button>
            }
          >
            {data.habits.length === 0 ? (
              <p className="text-sm text-slate-500">{t('today.noHabits')}</p>
            ) : (
              <>
                <div className="mb-3 flex items-center gap-3">
                  <ProgressRing value={doneCount / denom} size={52} stroke={6}>
                    <span className="text-xs font-semibold">
                      {doneCount}/{denom}
                    </span>
                  </ProgressRing>
                  <div className="text-sm text-slate-500">
                    {doneCount === denom
                      ? t('today.allDone')
                      : `${t('today.toGo', { n: denom - doneCount })}${skipCount ? ` · ${t('today.skipped', { n: skipCount })}` : ''}`}
                  </div>
                </div>
                <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                  {data.habits.map((h) => {
                    const st = statusOf(h.id);
                    const streak = computeStreaks(
                      h.schedule,
                      data.allLogs.filter((l) => l.habitId === h.id),
                      h.createdAt,
                      today,
                    );
                    return (
                      <li key={h.id} className="flex items-center gap-3 py-2" data-testid={`habit-${h.id}`}>
                        <TickButton
                          done={st === 'done'}
                          color={h.color}
                          label={`${h.name}: ${st === 'done' ? 'done' : 'mark done'}`}
                          onClick={(anchor) => void setHabitStatus(h.id, today, st === 'done' ? null : 'done', { xp: h.xp, anchor })}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={`line-clamp-2 text-sm font-medium leading-snug ${st === 'done' ? 'text-slate-400 line-through' : ''}`}>
                            {h.emoji} {h.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {streak.current > 0
                              ? t(streak.unit === 'days' ? 'today.streakDays' : 'today.streakWeeks', { n: streak.current })
                              : t('today.noStreak')}
                            {h.reminderEnabled && h.reminderTime ? ` · ⏰ ${formatHHMM12(h.reminderTime)}` : ''}
                            {st === 'skip' ? ` · ${t('today.skippedRest')}` : st === 'miss' ? ` · ${t('today.missed')}` : ''}
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <button
                            className={`min-h-[44px] min-w-[44px] rounded-lg px-1.5 text-[11px] font-medium sm:px-2.5 ${st === 'skip' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                            onClick={() => void setHabitStatus(h.id, today, st === 'skip' ? null : 'skip')}
                            title={t('today.skipHint')}
                          >
                            {t('common.skip')}
                          </button>
                          <button
                            className={`min-h-[44px] min-w-[44px] rounded-lg px-1.5 text-[11px] font-medium sm:px-2.5 ${st === 'miss' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
                            onClick={() => void setHabitStatus(h.id, today, st === 'miss' ? null : 'miss')}
                            title={t('today.missHint')}
                          >
                            {t('common.miss')}
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </Card>
        </div>
        <div className="space-y-4">
          {profile.supplements.length > 0 && (
            <Card title={t('today.supplements')}>
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {[...profile.supplements]
                  .sort((a, b) => a.time.localeCompare(b.time))
                  .map((s) => {
                    const taken = data.supLogs.some((l) => l.supplementId === s.id);
                    return (
                      <li key={s.id} className="flex items-center gap-3 py-2" data-testid={`supplement-${s.id}`}>
                        <TickButton
                          done={taken}
                          color="#8b5cf6"
                          label={`${s.name} ${s.time}: ${taken ? 'taken' : 'mark taken'}`}
                          onClick={(anchor) => void toggleSupplement(s.id, today, !taken, anchor)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={`line-clamp-2 text-sm font-medium leading-snug ${taken ? 'text-slate-400 line-through' : ''}`}>💊 {s.name}</div>
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
            <WaterCard ml={data.water} target={profile.water.targetMl} today={today} />
            <WeightCard latest={data.latestWeight} unit={settings.weightUnit} today={today} targetKg={profile.user.targetWeightKg} />
          </div>

          <StepsCard steps={data.steps} settings={settings} />
        </div>
      </div>
    </div>
  );
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return t('today.greetingMorning');
  if (h < 17) return t('today.greetingAfternoon');
  return t('today.greetingEvening');
}

function supplementStreak(dates: string[], today: ISODate): number {
  const set = new Set(dates);
  let streak = 0;
  let d = today;
  if (!set.has(d)) {
    const y = addDays(d, -1);
    if (!set.has(y)) return 0;
    d = y;
  }
  while (set.has(d)) {
    streak += 1;
    d = addDays(d, -1);
  }
  return streak;
}

function FastingCard({ fasting }: { fasting: Profile['fasting'] }) {
  const [state, setState] = useState(() => fastingState(fasting));
  useEffect(() => {
    const timer = setInterval(() => setState(fastingState(fasting)), 1000);
    return () => clearInterval(timer);
  }, [fasting]);
  const isFast = state.phase === 'fasting';
  return (
    <Card className={isFast ? 'border-l-4 border-violet-500' : 'border-l-4 border-emerald-500'}>
      <div className="flex items-center gap-4">
        <ProgressRing value={state.progress} size={72} stroke={7} color={isFast ? '#8b5cf6' : '#10b981'}>
          <span className="text-xl">{isFast ? '⏳' : '🍽️'}</span>
        </ProgressRing>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">{isFast ? t('today.fasting') : t('today.eatingWindow')}</div>
          <div className="font-mono text-2xl font-bold tabular-nums" data-testid="fasting-timer">
            {formatDuration(state.secondsRemaining)}
          </div>
          <div className="text-xs text-slate-500">
            {isFast ? t('today.eatingOpens', { time: formatHHMM12(state.nextChange) }) : t('today.eatingCloses', { time: formatHHMM12(state.nextChange) })} ·{' '}
            {state.fastingHours}:{state.eatingHours}
          </div>
        </div>
      </div>
    </Card>
  );
}

function WaterCard({ ml, target, today }: { ml: number; target: number; today: string }) {
  const pct = Math.min(1, ml / target);
  return (
    <Card title={t('today.water')}>
      <div className="flex flex-col items-center gap-2">
        <ProgressRing value={pct} size={80} stroke={8} color="#0ea5e9">
          <div>
            <div className="text-sm font-bold">{(ml / 1000).toFixed(2)}</div>
            <div className="text-[10px] text-slate-500">/ {(target / 1000).toFixed(1)} L</div>
          </div>
        </ProgressRing>
        <div className="flex w-full gap-1">
          <button className="btn-ghost w-12 p-0" onClick={() => void undoWater(today)} aria-label={t('today.undoWater')} disabled={ml <= 0}>
            −
          </button>
          <button className="btn-primary flex-1 bg-sky-600 hover:bg-sky-700" onClick={(e) => void addWater(today, 250, target, { x: e.clientX, y: e.clientY })}>
            {t('today.addWater')}
          </button>
        </div>
      </div>
    </Card>
  );
}

function WeightCard({
  latest,
  unit,
  today,
  targetKg,
}: {
  latest: { kg: number; date: string } | null;
  unit: Settings['weightUnit'];
  today: string;
  targetKg: number;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState<string>(latest ? String(displayWeight(latest.kg, unit)) : '');
  useEffect(() => {
    if (latest) setValue(String(displayWeight(latest.kg, unit)));
  }, [latest, unit]);
  const unitLabel = unit === 'kg' ? 'kg' : 'lb';
  const delta = latest ? latest.kg - targetKg : null;
  return (
    <Card title={t('today.weight')}>
      <div className="flex flex-col items-center gap-2">
        <div className="flex h-20 flex-col items-center justify-center">
          <div className="text-2xl font-bold">{latest ? displayWeight(latest.kg, unit) : '—'}</div>
          <div className="text-[11px] text-slate-500">
            {latest ? `${unitLabel} · ${latest.date === today ? t('common.today') : latest.date}` : t('today.noEntry')}
          </div>
          {delta !== null && (
            <div className="text-[11px] text-slate-500">
              {Math.abs(delta) < 0.25
                ? t('today.atTarget')
                : t('today.toGoWeight', { delta: `${delta > 0 ? '−' : '+'}${displayWeight(Math.abs(delta), unit)} ${unitLabel}` })}
            </div>
          )}
        </div>
        <button className="btn-ghost w-full" onClick={() => setOpen(true)}>
          {t('today.logWeight')}
        </button>
      </div>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('today.logWeightTitle')}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              {t('common.cancel')}
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
              {t('common.save')}
            </button>
          </>
        }
      >
        <div className="flex items-center gap-2">
          <input
            className="input text-lg"
            type="number"
            step="0.1"
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            aria-label={t('today.weight')}
          />
          <span className="text-sm text-slate-500">{unitLabel}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('today.weighTip')}</p>
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
  const msgKey: Record<string, string> = {
    disabled: 'today.stepsConnect',
    not_installed: 'today.stepsNotInstalled',
    update_required: 'today.stepsUpdate',
    unsupported: 'today.stepsUnsupported',
    permission_denied: 'today.stepsDenied',
  };
  return (
    <Card title={t('today.steps')}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-2xl font-bold">{shown !== null && status === 'available' ? shown.toLocaleString() : '—'}</div>
          <div className="text-xs text-slate-500">{msgKey[status] ? t(msgKey[status]) : t('today.stepsFrom')}</div>
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
            {busy ? '…' : t('today.connect')}
          </button>
        )}
      </div>
    </Card>
  );
}
