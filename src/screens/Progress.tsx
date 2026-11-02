import { useEffect, useState } from 'react';
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Profile, ProgressPhoto, Settings, WeeklySummary } from '../types';
import { photoRepo, settingsRepo, summaryRepo, weightRepo } from '../db/repos';
import { notifyChange, toast, useAsyncData } from '../store/appStore';
import { Card, EmptyState, Modal, Spinner, Stat, Toggle } from '../components/ui';
import { formatDateShort, todayISO } from '../logic/dates';
import { buildTrendSeries, projectToTarget } from '../logic/projection';
import { computeInsights } from '../logic/insights';
import { displayWeight, formatWeight } from '../logic/units';
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
  const projection = projectToTarget(data.weights, profile.targetWeightKg, today);
  const series = buildTrendSeries(data.weights, profile.targetWeightKg, today).map((p) => ({
    ...p,
    label: formatDateShort(p.date),
    kg: p.kg !== null ? displayWeight(p.kg, unit) : null,
    ma7: p.ma7 !== null ? displayWeight(p.ma7, unit) : null,
    projected: p.projected !== null ? displayWeight(p.projected, unit) : null,
  }));
  const lastSummary = data.summaries[data.summaries.length - 1];
  const insights = computeInsights(data.summaries, profile.waterTargetMl);

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Progress</h1>
        <div className="flex rounded-xl bg-slate-100 p-0.5 dark:bg-slate-800">
          {(['trend', 'photos'] as const).map((v) => (
            <button key={v} className={`rounded-lg px-3 py-1 text-sm font-medium ${view === v ? 'bg-white shadow dark:bg-slate-700' : 'text-slate-500'}`} onClick={() => setView(v)}>
              {v === 'trend' ? 'Trend' : 'Photos'}
            </button>
          ))}
        </div>
      </header>

      {view === 'trend' && (
        <>
          <Card title="Weight trend">
            {series.length < 2 ? (
              <p className="text-sm text-slate-500">Log your weight a few times to see the trend, 7-day average and goal projection.</p>
            ) : (
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#94a3b833" />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={28} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 10 }} />
                    <Tooltip contentStyle={{ fontSize: 12, borderRadius: 12 }} formatter={(v: number | string) => `${v} ${unit}`} />
                    <ReferenceLine y={displayWeight(profile.targetWeightKg, unit)} stroke="#22a566" strokeDasharray="4 4" label={{ value: 'target', fontSize: 10, fill: '#22a566', position: 'insideTopRight' }} />
                    <Line type="monotone" dataKey="kg" name="Weight" stroke="#64748b" strokeWidth={1.5} dot={{ r: 2 }} connectNulls />
                    <Line type="monotone" dataKey="ma7" name="7-day avg" stroke="#0ea5e9" strokeWidth={2.5} dot={false} connectNulls />
                    <Line type="monotone" dataKey="projected" name="Projection" stroke="#f97316" strokeWidth={2} strokeDasharray="6 4" dot={false} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Stat label="7-day average" value={projection.latestMa7 !== null ? formatWeight(projection.latestMa7, unit) : '—'} sub={projection.latestKg !== null ? `latest ${formatWeight(projection.latestKg, unit)}` : undefined} />
              <Stat label="Target" value={formatWeight(profile.targetWeightKg, unit)} sub={projection.latestMa7 !== null ? `${formatWeight(Math.abs(projection.latestMa7 - profile.targetWeightKg), unit)} to go` : undefined} />
              <div className="col-span-2">
                <Stat
                  label="Goal projection"
                  value={
                    projection.status === 'on_track' && projection.etaDate
                      ? `~${formatDateShort(projection.etaDate)}`
                      : projection.status === 'reached'
                        ? '🎯 Target reached'
                        : projection.status === 'moving_away'
                          ? 'Trend moving away from target'
                          : projection.status === 'flat'
                            ? 'Weight is flat'
                            : 'Need ~1 week of data'
                  }
                  sub={
                    projection.slopeKgPerWeek !== null
                      ? `${projection.slopeKgPerWeek > 0 ? '+' : ''}${projection.slopeKgPerWeek} kg/week over the last 4 weeks${projection.daysToTarget ? ` · ${projection.daysToTarget} days at this rate` : ''}`
                      : 'Based on linear fit of the last 4 weeks'
                  }
                />
              </div>
            </div>
          </Card>

          <Card title={lastSummary ? `Weekly summary · ${formatDateShort(lastSummary.weekStart)} – ${formatDateShort(lastSummary.weekEnd)}` : 'Weekly summary'}>
            {lastSummary ? <SummaryGrid s={lastSummary} unit={unit} /> : <p className="text-sm text-slate-500">Your first weekly card appears automatically after Sunday.</p>}
            <details className="mt-3">
              <summary className="cursor-pointer text-xs font-medium text-brand-600">This week so far</summary>
              <div className="mt-2">
                <SummaryGrid s={data.thisWeek} unit={unit} />
              </div>
            </details>
            {data.summaries.length > 1 && (
              <details className="mt-2">
                <summary className="cursor-pointer text-xs font-medium text-brand-600">Previous weeks ({data.summaries.length - 1})</summary>
                <ul className="mt-2 space-y-1 text-xs">
                  {[...data.summaries]
                    .reverse()
                    .slice(1)
                    .map((s) => (
                      <li key={s.weekStart} className="flex justify-between rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800/60">
                        <span>{formatDateShort(s.weekStart)}</span>
                        <span>
                          {s.habitsPct}% · {(s.avgWaterMl / 1000).toFixed(1)} L · {s.workoutsDone} 🏋️ · {s.weightDeltaKg !== null ? `${s.weightDeltaKg > 0 ? '+' : ''}${s.weightDeltaKg} kg` : '—'}
                        </span>
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </Card>

          <Card title="Insights">
            <ul className="space-y-2">
              {insights.map((i) => (
                <li key={i.id} className={`rounded-xl p-3 text-sm ${i.sentiment === 'positive' ? 'bg-brand-50 dark:bg-brand-900/30' : i.sentiment === 'negative' ? 'bg-amber-50 dark:bg-amber-900/20' : 'bg-slate-50 dark:bg-slate-800/60'}`}>
                  <div className="font-medium">{i.title}</div>
                  <div className="text-xs text-slate-500">{i.detail}</div>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">Rule-based correlations computed on this device only. They show association, not cause.</p>
          </Card>

          <FutureLookCard settings={settings} photos={data.photos} projection={projection} profile={profile} />
        </>
      )}

      {view === 'photos' && <Photos profile={profile} photos={data.photos} unit={unit} latestKg={projection.latestKg} />}
    </div>
  );
}

function SummaryGrid({ s, unit }: { s: WeeklySummary; unit: Settings['weightUnit'] }) {
  return (
    <div className="grid grid-cols-4 gap-2 text-center">
      <Mini label="Habits" value={`${s.habitsPct}%`} />
      <Mini label="Water" value={`${(s.avgWaterMl / 1000).toFixed(1)} L`} />
      <Mini label="Workouts" value={String(s.workoutsDone)} />
      <Mini label="Weight" value={s.weightDeltaKg !== null ? `${s.weightDeltaKg > 0 ? '+' : ''}${displayWeight(s.weightDeltaKg, unit)}` : '—'} />
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

function FutureLookCard({ settings, photos, projection, profile }: { settings: Settings; photos: ProgressPhoto[]; projection: ReturnType<typeof projectToTarget>; profile: Profile }) {
  const first = photos[0];
  const last = photos[photos.length - 1];
  return (
    <Card title="Future look">
      <p className="text-sm">
        {projection.status === 'on_track' && projection.etaDate
          ? `At your current pace you reach ${profile.targetWeightKg} kg around ${formatDateShort(projection.etaDate)}. ${profile.appearanceGoals ? `Your goal: “${profile.appearanceGoals}”` : ''}`
          : `Keep logging weight and photos — a text projection appears once a trend is visible. ${profile.appearanceGoals ? `Your goal: “${profile.appearanceGoals}”` : ''}`}
      </p>
      {first && last && first.id !== last.id && (
        <p className="mt-1 text-xs text-slate-500">
          Photo timeline: {photos.length} photos from {formatDateShort(first.date)} to {formatDateShort(last.date)}. Open the Photos tab to compare.
        </p>
      )}
      <div className="mt-3 flex items-start justify-between gap-3 rounded-xl border border-dashed border-slate-300 p-3 dark:border-slate-700">
        <div>
          <div className="text-sm font-medium">AI image preview (v2, optional)</div>
          <p className="text-xs text-slate-500">
            <b>Sends your photo to a cloud service.</b> Off by default. Not active in this version — this only records your preference.
          </p>
        </div>
        <Toggle
          checked={settings.futureLookCloudEnabled}
          label="Cloud future-look"
          onChange={async (v) => {
            if (v && !confirm('This would upload a progress photo to a cloud image service when the feature ships. Enable the preference?')) return;
            await settingsRepo.set('futureLookCloudEnabled', v);
            notifyChange();
            toast(v ? 'Cloud future-look preference saved (feature not yet active)' : 'Cloud future-look stays off');
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
    if (!profile.photoConsent) return toast('Enable photo consent in Profile first', 'error');
    setBusy(true);
    try {
      const p = await captureProgressPhoto(latestKg, note, source);
      if (p) {
        toast('Photo saved (encrypted, on-device)', 'success');
        setNote('');
      }
    } catch (e) {
      const msg = (e as Error).message ?? '';
      if (!/cancel/i.test(msg)) toast(`Could not capture: ${msg}`, 'error');
    } finally {
      setBusy(false);
    }
  };

  const first = photos[0];
  const last = photos[photos.length - 1];

  return (
    <>
      <Card title="Progress photos">
        <p className="text-xs text-slate-500">Encrypted with a device key and stored in app-private storage. They never leave this phone and are not included in backups.</p>
        {!profile.photoConsent && <p className="mt-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">Photo consent is off. Turn it on in Profile to take progress photos.</p>}
        <input className="input mt-3" placeholder="Note (optional, e.g. morning, after workout)" value={note} onChange={(e) => setNote(e.target.value)} />
        <div className="mt-2 flex gap-2">
          <button className="btn-primary flex-1" disabled={busy || !profile.photoConsent} onClick={() => void capture('camera')}>
            📷 Take photo
          </button>
          <button className="btn-ghost" disabled={busy || !profile.photoConsent} onClick={() => void capture('gallery')}>
            Gallery
          </button>
        </div>
      </Card>

      {first && last && first.id !== last.id && (
        <Card title="Before / now" action={<button className="text-xs text-brand-600" onClick={() => setCompare({ a: first, b: last })}>Full screen</button>}>
          <div className="grid grid-cols-2 gap-2">
            <PhotoThumb photo={first} unit={unit} caption="Before" />
            <PhotoThumb photo={last} unit={unit} caption="Now" />
          </div>
        </Card>
      )}

      {photos.length === 0 ? (
        <EmptyState emoji="📸" title="No photos yet" body="Take a photo every week or two in the same light and pose for the best comparison." />
      ) : (
        <Card title={`Timeline (${photos.length})`}>
          <div className="grid grid-cols-3 gap-2">
            {[...photos].reverse().map((p) => (
              <button key={p.id} onClick={() => setPreview(p)} className="text-left">
                <PhotoThumb photo={p} unit={unit} />
              </button>
            ))}
          </div>
        </Card>
      )}

      <Modal open={!!compare} onClose={() => setCompare(null)} title="Before / now">
        {compare && (
          <div className="grid grid-cols-2 gap-2">
            <PhotoThumb photo={compare.a} unit={unit} caption="Before" large />
            <PhotoThumb photo={compare.b} unit={unit} caption="Now" large />
          </div>
        )}
        {compare && photos.length > 2 && (
          <div className="mt-3">
            <div className="label">Compare “now” against</div>
            <div className="flex gap-1 overflow-x-auto">
              {photos.map((p) => (
                <button key={p.id} className={`chip shrink-0 ${compare.a.id === p.id ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`} onClick={() => setCompare({ a: p, b: compare.b })}>
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
                if (!confirm('Delete this photo permanently?')) return;
                await deletePhoto(preview);
                setPreview(null);
              }}
            >
              Delete
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
    loadPhotoDataUrl(photo.storageKey)
      .then((u) => alive && setSrc(u))
      .catch(() => alive && setErr(true));
    return () => {
      alive = false;
    };
  }, [photo.storageKey]);
  return (
    <figure>
      <div className={`overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-800 ${large ? 'aspect-[3/4]' : 'aspect-square'}`}>
        {src ? <img src={src} alt={`Progress photo ${photo.date}`} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center text-xs text-slate-400">{err ? 'unreadable' : '…'}</div>}
      </div>
      <figcaption className="mt-1 text-[11px] text-slate-500">
        {caption ? `${caption} · ` : ''}
        {formatDateShort(photo.date)}
        {photo.weightKg !== null ? ` · ${formatWeight(photo.weightKg, unit, 1)}` : ''}
      </figcaption>
    </figure>
  );
}
