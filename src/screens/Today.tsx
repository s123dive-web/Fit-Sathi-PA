import { useEffect, useMemo, useRef, useState } from 'react';
import type { Habit, HabitLog, HabitStatus, ISODate, Profile, Settings, SupplementLog } from '../types';
import { habitRepo, pointsRepo, stepsRepo, supplementRepo, waterRepo, weightRepo } from '../db/repos';
import { toast, useAsyncData, usePendingActions } from '../store/appStore';
import { Card, ErrorCard, Modal, ProgressRing, Spinner, TickButton, eventAnchor } from '../components/ui';
import { addDays, formatDateLong, formatDuration, formatTime, todayISO } from '../utils/dates';
import { habitActiveOn } from '../utils/schedule';
import { computeStreaks } from '../utils/habitStrength';
import { fastingState } from '../utils/fasting';
import { levelFromXp } from '../utils/xp';
import { displayWeight, parseWeightInput } from '../utils/units';
import { addWater, logWeight, setHabitStatus, toggleSupplement, undoWater } from '../services/actions';
import { disableHealthConnect, enableHealthConnect, refreshSteps, type StepsState } from '../services/health';
import { t } from '../i18n';

/** Streaks only need a bounded window of history; 400 days covers a year of weekly habits. */
const LOG_WINDOW_DAYS = 400;
const WEIGHT_MIN_KG = 20;
const WEIGHT_MAX_KG = 400;

interface TodayData {
  habits: Habit[];
  logs: HabitLog[];
  recentLogs: HabitLog[];
  supLogs: SupplementLog[];
  supStreaks: Record<string, number>;
  water: number;
  latestWeight: { kg: number; date: string } | null;
  xpToday: number;
  xpTotal: number;
  steps: number | null;
}

const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function Today({ profile, settings, onOpenHabits }: { profile: Profile; settings: Settings; onOpenHabits: () => void }) {
  const today = todayISO();
  const { data, loading, error, reload } = useAsyncData<TodayData>(async () => {
    const habits = (await habitRepo.all()).filter((h) => habitActiveOn(h, today));
    const [logs, recentLogs, supLogs, water, latest, xpToday, xpTotal, steps, supHistories] = await Promise.all([
      habitRepo.logsBetween(today, today),
      habitRepo.logsBetween(addDays(today, -LOG_WINDOW_DAYS), today),
      supplementRepo.logsOn(today),
      waterRepo.totalOn(today),
      weightRepo.latest(),
      pointsRepo.totalOn(today),
      pointsRepo.total(),
      stepsRepo.on(today),
      // One batch of queries, run concurrently (not one awaited round-trip per supplement).
      Promise.all(profile.supplements.map((s) => supplementRepo.logsFor(s.id))),
    ]);
    const supStreaks: Record<string, number> = {};
    profile.supplements.forEach((s, i) => {
      supStreaks[s.id] = supplementStreak(
        supHistories[i].map((l) => l.date),
        today,
      );
    });
    return {
      habits,
      logs,
      recentLogs,
      supLogs,
      supStreaks,
      water,
      latestWeight: latest ? { kg: latest.kg, date: latest.date } : null,
      xpToday,
      xpTotal,
      steps: steps?.steps ?? null,
    };
  });
  const pending = usePendingActions<HabitStatus | null | boolean | number>(data, (e) => toast(t('common.actionFailed', { msg: errMsg(e) }), 'error'));

  const streaks = useMemo(() => {
    if (!data) return new Map<string, ReturnType<typeof computeStreaks>>();
    const byHabit = new Map<string, HabitLog[]>();
    for (const l of data.recentLogs) {
      const arr = byHabit.get(l.habitId);
      if (arr) arr.push(l);
      else byHabit.set(l.habitId, [l]);
    }
    return new Map(data.habits.map((h) => [h.id, computeStreaks(h.schedule, byHabit.get(h.id) ?? [], h.createdAt, today)]));
  }, [data, today]);

  if (!data) {
    if (error) return <ErrorCard message={error} onRetry={reload} />;
    if (loading) return <Spinner />;
    return null;
  }

  const statusOf = (id: string): HabitStatus | null => {
    const p = pending.get(`habit:${id}`);
    if (p !== undefined) return p as HabitStatus | null;
    return data.logs.find((l) => l.habitId === id)?.status ?? null;
  };
  const takenOf = (id: string): boolean => {
    const p = pending.get(`sup:${id}`);
    if (p !== undefined) return p as boolean;
    return data.supLogs.some((l) => l.supplementId === id);
  };
  const waterMl = (pending.get('water') as number | undefined) ?? data.water;
  const doneCount = data.habits.filter((h) => statusOf(h.id) === 'done').length;
  const skipCount = data.habits.filter((h) => statusOf(h.id) === 'skip').length;
  const denom = Math.max(1, data.habits.length - skipCount);
  const level = levelFromXp(data.xpTotal);
  const firstName = profile.user.name.split(' ')[0];

  const setStatus = (h: Habit, next: HabitStatus | null, anchor?: { x: number; y: number }) =>
    void pending.run(`habit:${h.id}`, next, () => setHabitStatus(h.id, today, next, next === 'done' ? { xp: h.xp, anchor } : {}));

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
          <div className="mt-1 h-1.5 w-28 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800" aria-hidden="true">
            <div className="h-full bg-amber-400" style={{ width: `${Math.round(level.progress * 100)}%` }} />
          </div>
        </div>
      </header>

      <div className="fold-aware grid gap-4 md:grid-cols-2 md:gap-6 md:items-start">
        <div className="space-y-4">
          {profile.fasting.enabled && <FastingCard fasting={profile.fasting} />}

          {/* Most frequent actions first: water and weight sit above the fold. */}
          <div className="grid grid-cols-2 gap-4" aria-label={t('today.quickActions')}>
            <WaterCard
              ml={waterMl}
              target={profile.water.targetMl}
              busy={pending.has('water')}
              onAdd={(anchor) => void pending.run('water', waterMl + 250, () => addWater(today, 250, profile.water.targetMl, anchor))}
              onUndo={() => void pending.run('water', Math.max(0, waterMl - 250), () => undoWater(today, profile.water.targetMl))}
            />
            <WeightCard latest={data.latestWeight} unit={settings.weightUnit} today={today} targetKg={profile.user.targetWeightKg} />
          </div>

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
                    const streak = streaks.get(h.id);
                    const busy = pending.has(`habit:${h.id}`);
                    return (
                      <li key={h.id} className="flex items-center gap-3 py-2" data-testid={`habit-${h.id}`}>
                        <TickButton
                          done={st === 'done'}
                          color={h.color}
                          disabled={busy}
                          label={st === 'done' ? t('today.habitDone', { name: h.name }) : t('today.habitMarkDone', { name: h.name })}
                          onClick={(anchor) => setStatus(h, st === 'done' ? null : 'done', anchor)}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={`line-clamp-2 text-sm font-medium leading-snug ${st === 'done' ? 'text-slate-400 line-through' : ''}`}>
                            <span aria-hidden="true">{h.emoji}</span> {h.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {streak && streak.current > 0
                              ? t(streak.unit === 'days' ? 'today.streakDays' : 'today.streakWeeks', { n: streak.current })
                              : t('today.noStreak')}
                            {h.reminderEnabled && h.reminderTime ? ` · ⏰ ${formatTime(h.reminderTime)}` : ''}
                            {st === 'skip' ? ` · ${t('today.skippedRest')}` : st === 'miss' ? ` · ${t('today.missed')}` : ''}
                          </div>
                        </div>
                        <RowMenu name={h.name} status={st} disabled={busy} onSelect={(s) => setStatus(h, s)} />
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
                    const taken = takenOf(s.id);
                    const busy = pending.has(`sup:${s.id}`);
                    const shownTime = formatTime(s.time);
                    return (
                      <li key={s.id} className="flex items-center gap-3 py-2" data-testid={`supplement-${s.id}`}>
                        <TickButton
                          done={taken}
                          color="#8b5cf6"
                          disabled={busy}
                          label={
                            taken
                              ? t('today.supplementTaken', { name: s.name, time: shownTime })
                              : t('today.supplementMarkTaken', { name: s.name, time: shownTime })
                          }
                          onClick={(anchor) => void pending.run(`sup:${s.id}`, !taken, () => toggleSupplement(s.id, today, !taken, anchor))}
                        />
                        <div className="min-w-0 flex-1">
                          <div className={`line-clamp-2 text-sm font-medium leading-snug ${taken ? 'text-slate-400 line-through' : ''}`}>
                            <span aria-hidden="true">💊</span> {s.name}
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {shownTime}
                            {s.dose ? ` · ${s.dose}` : ''}
                            {s.alarm ? ` · ⏰ ${t('today.alarmOn')}` : ''}
                            {data.supStreaks[s.id] ? ` · 🔥 ${t('today.streakShort', { n: data.supStreaks[s.id] })}` : ''}
                          </div>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </Card>
          )}

          <StepsCard steps={data.steps} settings={settings} />
        </div>
      </div>
    </div>
  );
}

/** "···" overflow holding the rare Skip / Miss actions so the row has one secondary affordance. */
function RowMenu({
  name,
  status,
  disabled,
  onSelect,
}: {
  name: string;
  status: HabitStatus | null;
  disabled?: boolean;
  onSelect: (s: HabitStatus | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('touchstart', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('touchstart', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  const pick = (s: HabitStatus | null) => {
    setOpen(false);
    onSelect(s);
  };
  const item = 'flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800';
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        className={`min-h-[44px] min-w-[44px] rounded-lg text-lg leading-none ${
          status === 'skip'
            ? 'bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-200'
            : status === 'miss'
              ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200'
              : 'text-slate-500'
        }`}
        aria-label={t('common.moreActions', { name })}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
      >
        ···
      </button>
      {open && (
        <div
          role="menu"
          aria-label={t('common.moreActions', { name })}
          className="absolute right-0 top-full z-20 mt-1 w-52 rounded-xl bg-white p-1 shadow-lg ring-1 ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
        >
          <button role="menuitem" type="button" className={item} title={t('today.skipHint')} onClick={() => pick(status === 'skip' ? null : 'skip')}>
            <span aria-hidden="true">⏭</span>
            <span className="flex-1">
              <span className="block">{t('common.skip')}</span>
              <span className="block text-[11px] text-slate-500">{t('today.skipHint')}</span>
            </span>
          </button>
          <button role="menuitem" type="button" className={item} title={t('today.missHint')} onClick={() => pick(status === 'miss' ? null : 'miss')}>
            <span aria-hidden="true">❌</span>
            <span className="flex-1">
              <span className="block">{t('common.miss')}</span>
              <span className="block text-[11px] text-slate-500">{t('today.missHint')}</span>
            </span>
          </button>
          {status && (
            <button role="menuitem" type="button" className={item} onClick={() => pick(null)}>
              <span aria-hidden="true">↺</span>
              <span>{t('today.clearStatus')}</span>
            </button>
          )}
        </div>
      )}
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
          <span className="text-xl" aria-hidden="true">
            {isFast ? '⏳' : '🍽️'}
          </span>
        </ProgressRing>
        <div className="flex-1">
          <div className="text-xs uppercase tracking-wide text-slate-500">{isFast ? t('today.fasting') : t('today.eatingWindow')}</div>
          <div className="font-mono text-2xl font-bold tabular-nums" data-testid="fasting-timer">
            {formatDuration(state.secondsRemaining)}
          </div>
          <div className="text-xs text-slate-500">
            {isFast ? t('today.eatingOpens', { time: formatTime(state.nextChange) }) : t('today.eatingCloses', { time: formatTime(state.nextChange) })} ·{' '}
            {t('today.fastingRatio', { fast: state.fastingHours, eat: state.eatingHours })}
          </div>
        </div>
      </div>
    </Card>
  );
}

function WaterCard({
  ml,
  target,
  busy,
  onAdd,
  onUndo,
}: {
  ml: number;
  target: number;
  busy: boolean;
  onAdd: (anchor: { x: number; y: number }) => void;
  onUndo: () => void;
}) {
  const pct = Math.min(1, ml / target);
  return (
    <Card title={t('today.water')}>
      <div className="flex flex-col items-center gap-2">
        <ProgressRing value={pct} size={80} stroke={8} color="#0ea5e9">
          <div>
            <div className="text-sm font-bold">{(ml / 1000).toFixed(2)}</div>
            <div className="text-[10px] text-slate-500">{t('today.waterOf', { target: (target / 1000).toFixed(1) })}</div>
          </div>
        </ProgressRing>
        <div className="flex w-full gap-1">
          <button className="btn-ghost w-12 p-0" onClick={onUndo} aria-label={t('today.undoWater')} disabled={ml <= 0 || busy}>
            −
          </button>
          <button
            className="btn-primary flex-1 bg-sky-600 hover:bg-sky-700"
            aria-busy={busy || undefined}
            disabled={busy}
            onClick={(e) => onAdd(eventAnchor(e))}
          >
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
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (latest) setValue(String(displayWeight(latest.kg, unit)));
  }, [latest, unit]);
  const unitLabel = t(`common.${unit}`);
  const delta = latest ? latest.kg - targetKg : null;
  const min = displayWeight(WEIGHT_MIN_KG, unit);
  const max = displayWeight(WEIGHT_MAX_KG, unit);

  const close = () => {
    setOpen(false);
    setErr(null);
  };
  const save = async (anchor: { x: number; y: number }) => {
    const v = Number(value.replace(',', '.'));
    if (!value.trim() || !Number.isFinite(v)) {
      setErr(t('today.weightInvalid'));
      toast(t('today.weightInvalid'), 'error');
      return;
    }
    const kg = parseWeightInput(v, unit);
    if (kg < WEIGHT_MIN_KG || kg > WEIGHT_MAX_KG) {
      const msg = t('today.weightRange', { min, max, unit: unitLabel });
      setErr(msg);
      toast(msg, 'error');
      return;
    }
    setSaving(true);
    try {
      await logWeight(today, kg, anchor);
      close();
    } catch (e) {
      setErr(errMsg(e));
      toast(errMsg(e), 'error');
    } finally {
      setSaving(false);
    }
  };

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
        onClose={close}
        title={t('today.logWeightTitle')}
        footer={
          <>
            <button className="btn-ghost" onClick={close}>
              {t('common.cancel')}
            </button>
            <button className="btn-primary" disabled={saving} onClick={(e) => void save(eventAnchor(e))}>
              {saving ? t('common.saving') : t('common.save')}
            </button>
          </>
        }
      >
        <div className="flex items-center gap-2">
          <input
            className="input text-lg"
            type="number"
            step="0.1"
            min={min}
            max={max}
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setErr(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void save(eventAnchor({ clientX: 0, clientY: 0, currentTarget: e.currentTarget }));
            }}
            autoFocus
            aria-label={t('today.weight')}
            aria-invalid={!!err}
            aria-describedby={err ? 'weight-error' : undefined}
          />
          <span className="text-sm text-slate-500">{unitLabel}</span>
        </div>
        {err && (
          <p id="weight-error" className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-300" role="alert">
            {err}
          </p>
        )}
        <p className="mt-2 text-xs text-slate-500">{t('today.weighTip')}</p>
      </Modal>
    </Card>
  );
}

function StepsCard({ steps, settings }: { steps: number | null; settings: Settings }) {
  const [state, setState] = useState<StepsState | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    refreshSteps()
      .then((s) => alive && setState(s))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
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
              try {
                setState(await enableHealthConnect());
              } catch (e) {
                toast(t('common.actionFailed', { msg: errMsg(e) }), 'error');
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? '…' : t('today.connect')}
          </button>
        )}
      </div>
      {settings.healthConnectEnabled && (
        <button
          className="mt-2 min-h-[44px] text-xs text-brand-600 underline-offset-2 hover:underline"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            try {
              await disableHealthConnect();
              setState({ steps: null, status: 'disabled' });
              toast(t('today.stepsDisconnected'));
            } catch (e) {
              toast(t('common.actionFailed', { msg: errMsg(e) }), 'error');
            } finally {
              setBusy(false);
            }
          }}
        >
          {t('today.manageHealthConnect')}
        </button>
      )}
    </Card>
  );
}
