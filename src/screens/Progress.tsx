import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Profile, ProgressPhoto, Settings, WeeklySummary } from '../types';
import { photoRepo, profileRepo, summaryRepo, weightRepo } from '../db/repos';
import { t } from '../i18n';
import { notifyChange, toast, useAsyncData } from '../store/appStore';
import { Card, EmptyState, Modal, Spinner, Stat, Toggle } from '../components/ui';
import { formatDateShort, todayISO } from '../utils/dates';
import { buildTrendSeries, projectToTarget } from '../utils/projection';
import { computeInsights } from '../utils/insights';
import { displayWeight, formatWeight } from '../utils/units';
import { currentWeekSummary } from '../services/weekly';
import { captureProgressPhoto, deletePhoto, loadPhotoDataUrl } from '../services/photos';

export function Progress({ profile, settings }: { profile: Profile; settings: Settings }) {
  const today = todayISO();
  const [view, setView] = useState<'trend' | 'photos'>('trend');
  const { data, loading } = useAsyncData(async () => {
    const [weights, summaries, photos, thisWeek] = await Promise.all([weightRepo.all(), summaryRepo.all(), photoRepo.all(), currentWeekSummary()]);
    return { weights, summaries, photos, thisWeek };
  });
  if (loading && !data) return <Spinner />;
  if (!data) return null;

  const unit = settings.weightUnit;
  const projection = projectToTarget(data.weights, profile.user.targetWeightKg, today);
  const series = buildTrendSeries(data.weights, profile.user.targetWeightKg, today).map((p) => ({
    ...p,
    label: formatDateShort(p.date),
    kg: p.kg !== null ? displayWeight(p.kg, unit) : null,
    ma7: p.ma7 !== null ? displayWeight(p.ma7, unit) : null,
    projected: p.projected !== null ? displayWeight(p.projected, unit) : null,
  }));
  const lastSummary = data.summaries[data.summaries.length - 1];
  const insights = computeInsights(data.summaries, profile.water.targetMl);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('progress.title')}</h1>
        <div className="flex rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800">
          {(['trend', 'photos'] as const).map((v) => (
            <button
              key={v}
              className={`min-h-[44px] rounded-lg px-3 py-1 text-sm font-medium ${view === v ? 'bg-white shadow dark:bg-slate-700' : 'text-slate-500'}`}
              onClick={() => setView(v)}
            >
              {v === 'trend' ? t('progress.trend') : t('progress.photos')}
            </button>
          ))}
        </div>
      </header>

      {view === 'trend' && (
        <>
          <Card title={t('progress.weightTrend')}>
            {series.length < 2 ? (
              <p className="text-sm text-slate-500">{t('progress.needData')}</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={28} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12 }} formatter={(v: number | string) => `${v} ${unit}`} />
                    <ReferenceLine
                      y={displayWeight(profile.user.targetWeightKg, unit)}
                      stroke="#22a566"
                      strokeDasharray="4 4"
                      label={{ value: 'target', fontSize: 10, fill: '#22a566', position: 'insideTopRight' }}
                    />
                    <Line type="monotone" dataKey="kg" name="Weight" stroke="#64748b" strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
                    <Line type="monotone" dataKey="ma7" name="7-day avg" stroke="#0ea5e9" strokeWidth={2.5} dot={false} connectNulls />
                    <Line
                      type="monotone"
                      dataKey="projected"
                      name="Projection"
                      stroke="#f97316"
                      strokeWidth={2}
                      strokeDasharray="6 4"
                      dot={false}
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat
                label={t('progress.ma7')}
                value={projection.latestMa7 !== null ? formatWeight(projection.latestMa7, unit) : '—'}
                sub={projection.latestKg !== null ? t('progress.latest', { w: formatWeight(projection.latestKg, unit) }) : undefined}
              />
              <Stat
                label={t('progress.target')}
                value={formatWeight(profile.user.targetWeightKg, unit)}
                sub={
                  projection.latestMa7 !== null
                    ? t('progress.toGo', { w: formatWeight(Math.abs(projection.latestMa7 - profile.user.targetWeightKg), unit) })
                    : undefined
                }
              />
              <div className="col-span-2">
                <Stat
                  label={t('progress.projection')}
                  value={
                    projection.status === 'on_track' && projection.etaDate
                      ? t('progress.eta', { date: formatDateShort(projection.etaDate) })
                      : projection.status === 'reached'
                        ? t('progress.reached')
                        : projection.status === 'moving_away'
                          ? t('progress.movingAway')
                          : projection.status === 'flat'
                            ? t('progress.flat')
                            : t('progress.needWeek')
                  }
                  sub={
                    projection.slopeKgPerWeek !== null
                      ? `${t('progress.slope', { slope: `${projection.slopeKgPerWeek > 0 ? '+' : ''}${projection.slopeKgPerWeek}` })}${projection.daysToTarget ? ` · ${t('progress.daysAtRate', { n: projection.daysToTarget })}` : ''}`
                      : t('progress.slopeHint')
                  }
                />
              </div>
            </div>
          </Card>

          <Card
            title={
              lastSummary
                ? t('progress.weeklyRange', { from: formatDateShort(lastSummary.weekStart), to: formatDateShort(lastSummary.weekEnd) })
                : t('progress.weekly')
            }
          >
            {lastSummary ? <SummaryGrid s={lastSummary} unit={unit} /> : <p className="text-sm text-slate-500">{t('progress.firstWeekly')}</p>}
            <details className="mt-3">
              <summary className="cursor-pointer py-2 text-xs font-medium text-brand-600">{t('progress.thisWeek')}</summary>
              <div className="mt-2">
                <SummaryGrid s={data.thisWeek} unit={unit} />
              </div>
            </details>
            {data.summaries.length > 1 && (
              <details className="mt-2">
                <summary className="cursor-pointer py-2 text-xs font-medium text-brand-600">
                  {t('progress.previousWeeks', { n: data.summaries.length - 1 })}
                </summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {[...data.summaries]
                    .reverse()
                    .slice(1)
                    .map((s) => (
                      <li key={s.weekStart} className="flex justify-between rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800/60">
                        <span>{formatDateShort(s.weekStart)}</span>
                        <span>
                          {s.habitsPct}% · {(s.avgWaterMl / 1000).toFixed(1)} L · {s.workoutsDone} 🏋️ ·{' '}
                          {s.weightDeltaKg !== null ? `${s.weightDeltaKg > 0 ? '+' : ''}${s.weightDeltaKg} kg` : '—'}
                        </span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </Card>

          <Card title={t('progress.insights')}>
            <ul className="space-y-2">
              {insights.map((i) => (
                <li
                  key={i.id}
                  className={`rounded-xl p-3 text-sm ${i.sentiment === 'positive' ? 'bg-brand-50 dark:bg-brand-900/30' : i.sentiment === 'negative' ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-slate-50 dark:bg-slate-800/60'}`}
                >
                  <div className="font-medium">{i.title}</div>
                  <div className="text-xs text-slate-500">{i.detail}</div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">{t('progress.insightsNote')}</p>
          </Card>

          <FutureLookCard photos={data.photos} projection={projection} profile={profile} />
        </>
      )}

      {view === 'photos' && <Photos profile={profile} photos={data.photos} unit={unit} latestKg={projection.latestKg} />}
    </div>
  );
}

function SummaryGrid({ s, unit }: { s: WeeklySummary; unit: Settings['weightUnit'] }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      <Mini label={t('progress.habits')} value={`${s.habitsPct}%`} />
      <Mini label={t('progress.water')} value={`${(s.avgWaterMl / 1000).toFixed(1)} L`} />
      <Mini label={t('progress.workouts')} value={String(s.workoutsDone)} />
      <Mini label={t('progress.weight')} value={s.weightDeltaKg !== null ? `${s.weightDeltaKg > 0 ? '+' : ''}${displayWeight(s.weightDeltaKg, unit)}` : '—'} />
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
      <div className="text-base font-semibold">{value}</div>
      <div className="text-[10px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function FutureLookCard({ photos, projection, profile }: { photos: ProgressPhoto[]; projection: ReturnType<typeof projectToTarget>; profile: Profile }) {
  const first = photos[0];
  const last = photos[photos.length - 1];
  const goal = profile.user.appearanceGoals ? ` ${t('progress.yourGoal', { goal: profile.user.appearanceGoals })}` : '';
  return (
    <Card title={t('progress.futureLook')}>
      <p className="text-sm">
        {projection.status === 'on_track' && projection.etaDate
          ? t('progress.futureOnTrack', { target: profile.user.targetWeightKg, date: formatDateShort(projection.etaDate) })
          : t('progress.futureKeepLogging')}
        {goal}
      </p>
      {first && last && first.id !== last.id && (
        <p className="mt-1 text-xs text-slate-500">
          {t('progress.photoTimeline', { n: photos.length, from: formatDateShort(first.date), to: formatDateShort(last.date) })}
        </p>
      )}
      <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
        <div>
          <div className="text-sm font-medium">{t('progress.cloudTitle')}</div>
          <p className="text-xs text-slate-500">{t('progress.cloudBody')}</p>
        </div>
        <Toggle
          checked={profile.privacy.futureLookCloud}
          label={t('progress.cloudTitle')}
          onChange={async (v) => {
            if (v && !confirm(t('progress.cloudConfirm'))) return;
            await profileRepo.save({ ...profile, privacy: { ...profile.privacy, futureLookCloud: v } });
            notifyChange();
            toast(v ? t('progress.cloudOn') : t('progress.cloudOff'));
          }}
        />
      </div>
    </Card>
  );
}

function Photos({ profile, photos, unit, latestKg }: { profile: Profile; photos: ProgressPhoto[]; unit: Settings['weightUnit']; latestKg: number | null }) {
  const [compare, setCompare] = useState<{ a: ProgressPhoto; b: ProgressPhoto } | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [preview, setPreview] = useState<ProgressPhoto | null>(null);

  const capture = async (source: 'camera' | 'gallery') => {
    if (!profile.privacy.photoConsent) return toast(t('progress.consentFirst'), 'error');
    setBusy(true);
    try {
      const p = await captureProgressPhoto(latestKg, note, source);
      if (p) {
        toast(t('progress.photoSaved'), 'success');
        setNote('');
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!/cancel/i.test(msg)) toast(t('progress.captureFailed', { msg }), 'error');
    } finally {
      setBusy(false);
    }
  };

  const first = photos[0];
  const last = photos[photos.length - 1];

  return (
    <>
      <Card title={t('progress.photosTitle')}>
        <p className="text-xs text-slate-500">{t('progress.photosNote')}</p>
        {!profile.privacy.photoConsent && (
          <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">{t('progress.consentOff')}</p>
        )}
        <input className="input mt-3" placeholder={t('progress.noteHint')} value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-2 flex gap-2">
          <button className="btn-primary flex-1" disabled={busy || !profile.privacy.photoConsent} onClick={() => void capture('camera')}>
            {t('progress.takePhoto')}
          </button>
          <button className="btn-ghost" disabled={busy || !profile.privacy.photoConsent} onClick={() => void capture('gallery')}>
            {t('progress.gallery')}
          </button>
        </div>
      </Card>

      {first && last && first.id !== last.id && (
        <Card
          title={t('progress.beforeNow')}
          action={
            <button className="min-h-[44px] px-2 text-xs text-brand-600" onClick={() => setCompare({ a: first, b: last })}>
              {t('progress.fullScreen')}
            </button>
          }
        >
          <div className="grid grid-cols-2 gap-2">
            <PhotoThumb photo={first} unit={unit} caption={t('progress.before')} />
            <PhotoThumb photo={last} unit={unit} caption={t('progress.now')} />
          </div>
        </Card>
      )}

      {photos.length === 0 ? (
        <EmptyState emoji="📸" title={t('progress.noPhotos')} body={t('progress.noPhotosBody')} />
      ) : (
        <Card title={t('progress.timeline', { n: photos.length })}>
          <div className="grid grid-cols-3 gap-2">
            {[...photos].reverse().map((p) => (
              <button key={p.id} onClick={() => setPreview(p)} className="text-left">
                <PhotoThumb photo={p} unit={unit} />
              </button>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!compare} onClose={() => setCompare(null)} title={t('progress.beforeNow')}>
        {compare && (
          <div className="grid grid-cols-2 gap-2">
            <PhotoThumb photo={compare.a} unit={unit} caption={t('progress.before')} large />
            <PhotoThumb photo={compare.b} unit={unit} caption={t('progress.now')} large />
          </div>
        )}
        {compare && photos.length > 2 && (
          <div className="mt-3">
            <div className="label">{t('progress.compareAgainst')}</div>
            <div className="flex gap-1 overflow-x-auto">
              {photos.map((p) => (
                <button
                  key={p.id}
                  className={`chip shrink-0 ${compare.a.id === p.id ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                  onClick={() => setCompare({ a: p, b: compare.b })}
                >
                  {formatDateShort(p.date)}
                </button>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={!!preview}
        onClose={() => setPreview(null)}
        title={preview ? formatDateShort(preview.date) : ''}
        footer={
          preview && (
            <button
              className="btn-danger"
              onClick={async () => {
                if (!confirm(t('progress.deletePhoto'))) return;
                await deletePhoto(preview);
                setPreview(null);
              }}
            >
              {t('common.delete')}
            </button>
          )
        }
      >
        {preview && <PhotoThumb photo={preview} unit={unit} large />}
        {preview?.note && <p className="mt-2 text-sm text-slate-500">{preview.note}</p>}
      </Modal>
    </>
  );
}

function PhotoThumb({ photo, unit, caption, large }: { photo: ProgressPhoto; unit: Settings['weightUnit']; caption?: string; large?: boolean }) {
  const [src, setSrc] = useState<string | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    let alive = true;
    loadPhotoDataUrl(photo.path)
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [photo.path]);
  return (
    <figure>
      <div className={`overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 ${large ? 'aspect-[3/4]' : 'aspect-square'}`}>
        {src ? (
          <img src={src} alt={`Progress photo ${photo.date}`} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">{err ? 'unreadable' : '…'}</div>
        )}
      </div>
      <figcaption className="mt-1 text-[11px] text-slate-500">
        {caption ? `${caption} · ` : ''}
        {formatDateShort(photo.date)}
        {photo.weightKg !== null ? ` · ${formatWeight(photo.weightKg, unit, 1)}` : ''}
      </figcaption>
    </figure>
  );
}
