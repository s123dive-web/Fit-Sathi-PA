import { useEffect, useState } from 'react';
import type { HeightUnit, NotificationPrefs, Profile, Settings } from '../types';
import { habitRepo, profileRepo, settingsRepo } from '../db/repos';
import { notifyChange, toast } from '../store/appStore';
import { Card, ConfirmDialog, Field, Modal, Stat, TimeInput, Toggle } from '../components/ui';
import { ProfileForm } from '../components/ProfileForm';
import { ProfileImport } from '../components/ProfileImport';
import { exportProfileJson, habitsFromProfile, habitsToProfile, validateProfile } from '../utils/profile';
import { nutritionTargets } from '../utils/nutrition';
import { bmi, formatHeight, formatWeight } from '../utils/units';
import { FitAlarms, FitBackup, FitBiometric, type BiometricStatus } from '../native/plugins';
import { PinDialog } from '../components/PinDialog';
import { changePin, disableAppLock, enableAppLock } from '../services/security';
import { eraseAllData } from '../services/erase';
import { LOCK_TIMEOUTS } from '../utils/pin';
import { syncNative } from '../services/sync';
import { exportBackup, parseBackup, pickBackupFile, restoreTables, summarizeTables, unpackBackup, type BackupFile } from '../services/backup';
import { formatTime } from '../utils/dates';
import { t } from '../i18n';

type Mode = 'view' | 'edit' | 'import';
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function ProfileScreen({ profile, settings }: { profile: Profile; settings: Settings }) {
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState<Profile>(profile);
  const [heightUnit, setHeightUnit] = useState<HeightUnit>(settings.heightUnit);
  const [errors, setErrors] = useState<string[]>([]);
  const [exact, setExact] = useState<boolean | null>(null);
  const [backupOpen, setBackupOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<BackupFile | null>(null);
  const [restoreTablesState, setRestoreTablesState] = useState<Record<string, Record<string, unknown>[]> | null>(null);
  const [passphrase, setPassphrase] = useState('');
  const [pinDialog, setPinDialog] = useState<null | 'enable' | 'change' | 'disable' | 'bio-verify'>(null);
  const [bioStatus, setBioStatus] = useState<BiometricStatus | null>(null);
  const [confirmErase, setConfirmErase] = useState(false);
  const [saving, setSaving] = useState(false);
  const targets = nutritionTargets(profile);

  useEffect(() => {
    FitBiometric.isAvailable()
      .then((r) => setBioStatus(r.status))
      .catch(() => setBioStatus('unavailable'));
  }, []);

  useEffect(() => {
    FitAlarms.canScheduleExactAlarms()
      .then((r) => setExact(r.granted))
      .catch(() => setExact(null));
  }, []);

  const persist = async (next: Profile) => {
    try {
      await profileRepo.save(next);
      notifyChange();
      void syncNative();
    } catch (e) {
      toast(t('common.actionFailed', { msg: errMsg(e) }), 'error');
    }
  };

  const enterEdit = () => {
    // Re-seed from props every time: a unit changed in Appearance must not be overwritten by a stale draft.
    setDraft(profile);
    setHeightUnit(settings.heightUnit);
    setErrors([]);
    setMode('edit');
  };

  const saveProfile = async () => {
    const res = validateProfile(draft);
    if (!res.ok || !res.profile) return setErrors(res.errors);
    setErrors([]);
    setSaving(true);
    try {
      await persist(res.profile);
      await settingsRepo.update({
        heightUnit,
        theme: res.profile.preferences?.theme ?? settings.theme,
        weightUnit: res.profile.preferences?.weightUnit ?? settings.weightUnit,
      });
      toast(t('profile.saved'), 'success');
      setMode('view');
    } catch (e) {
      toast(t('common.actionFailed', { msg: errMsg(e) }), 'error');
    } finally {
      setSaving(false);
    }
  };

  const setNotif = (patch: Partial<NotificationPrefs>) => void persist({ ...profile, notifications: { ...profile.notifications, ...patch } });

  const exportProfile = async () => {
    try {
      const habits = await habitRepo.all();
      const out: Profile = { ...profile, habits: habitsToProfile(habits) };
      const res = await FitBackup.saveDocument({
        filename: `${profile.user.name.toLowerCase().replace(/\s+/g, '_') || 'profile'}_profile.json`,
        mimeType: 'application/json',
        data: exportProfileJson(out),
      });
      if (res.saved) toast(t('profile.exported'), 'success');
    } catch (e) {
      toast(t('profile.exportFailed', { msg: errMsg(e) }), 'error');
    }
  };

  if (mode === 'edit') {
    return (
      <div className="mx-auto max-w-lg space-y-4 md:max-w-3xl">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{t('profile.editTitle')}</h1>
          <button className="btn-ghost" onClick={() => setMode('view')}>
            {t('common.cancel')}
          </button>
        </header>
        <ProfileForm value={draft} onChange={setDraft} heightUnit={heightUnit} onHeightUnit={setHeightUnit} weightUnit={settings.weightUnit} />
        {errors.length > 0 && (
          <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200" role="alert">
            <ul className="list-disc pl-5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <button className="btn-primary w-full" onClick={saveProfile} disabled={saving}>
          {saving ? t('common.saving') : t('profile.saveChanges')}
        </button>
      </div>
    );
  }

  if (mode === 'import') {
    return (
      <div className="mx-auto max-w-lg space-y-4 md:max-w-3xl">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold">{t('profile.importTitle')}</h1>
          <button className="btn-ghost" onClick={() => setMode('view')}>
            {t('common.cancel')}
          </button>
        </header>
        <ProfileImport
          existing={profile}
          onImported={async (p) => {
            try {
              await persist(p);
              const existing = await habitRepo.all(true);
              const names = new Set(existing.map((h) => h.name.toLowerCase()));
              for (const h of habitsFromProfile(p, existing.length)) if (!names.has(h.name.toLowerCase())) await habitRepo.upsert(h);
              await settingsRepo.update({
                theme: p.preferences?.theme ?? settings.theme,
                weightUnit: p.preferences?.weightUnit ?? settings.weightUnit,
                heightUnit: p.preferences?.heightUnit ?? settings.heightUnit,
              });
              notifyChange();
              void syncNative();
              toast(t('profile.imported'), 'success');
              setMode('view');
            } catch (e) {
              toast(t('common.actionFailed', { msg: errMsg(e) }), 'error');
            }
          }}
        />
      </div>
    );
  }

  const n = profile.notifications;
  const u = profile.user;
  const days = (list: Profile['workout']['days']) => list.map((d) => t(`days.${d}`)).join(' ');

  return (
    <div className="mx-auto max-w-lg space-y-4 md:max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('profile.title')}</h1>
        <button className="btn-primary" onClick={enterEdit}>
          {t('common.edit')}
        </button>
      </header>

      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white" aria-hidden="true">
            {u.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div className="text-lg font-semibold" data-testid="profile-name">
              {u.name}
            </div>
            <div className="text-sm text-slate-500">
              {u.age} y · {formatHeight(u.heightCm, settings.heightUnit)}
              {u.city ? ` · ${u.city}` : ''}
            </div>
            <div className="text-xs text-slate-500">
              {t(`form.${u.dietType}`)} · {t(`activity.${u.activityLevel}`)}
              {u.cuisine ? ` · ${u.cuisine}` : ''}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label={t('profile.current')} value={formatWeight(u.currentWeightKg, settings.weightUnit, 1)} />
          <Stat label={t('profile.target')} value={formatWeight(u.targetWeightKg, settings.weightUnit, 1)} />
          <Stat label={t('profile.bmi')} value={bmi(u.currentWeightKg, u.heightCm) ?? '—'} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
          <div>
            <span aria-hidden="true">⏳</span> {profile.fasting.enabled ? `${formatTime(profile.fasting.eatStart)} → ${formatTime(profile.fasting.eatEnd)}` : t('common.off')}
          </div>
          <div>
            <span aria-hidden="true">😴</span> {formatTime(profile.sleep.bedtime)} → {formatTime(profile.sleep.wake)}
          </div>
          <div>
            <span aria-hidden="true">💧</span> {profile.water.targetMl} ml
          </div>
          <div>
            <span aria-hidden="true">🏋️</span>{' '}
            {profile.workout.enabled ? `${formatTime(profile.workout.start)}–${formatTime(profile.workout.end)} · ${days(profile.workout.days)}` : t('common.off')}
            {profile.workout.alarm ? ' ⏰' : ''}
          </div>
          <div className="col-span-2">
            <span aria-hidden="true">🍽️</span> {targets.kcal} kcal · {targets.proteinG} g {t('food.protein').toLowerCase()}{' '}
            {targets.source === 'computed' ? `(${t('common.auto')})` : ''}
          </div>
          {profile.supplements.length > 0 && (
            <div className="col-span-2">
              <span aria-hidden="true">💊</span> {profile.supplements.map((s) => t('profile.supplementAt', { name: s.name, time: formatTime(s.time) })).join(' · ')}
            </div>
          )}
          {u.appearanceGoals && (
            <div className="col-span-2">
              <span aria-hidden="true">🎯</span> {u.appearanceGoals}
            </div>
          )}
        </div>
      </Card>

      <Card title={t('profile.appearance')}>
        <div className="grid grid-cols-3 gap-3">
          <Field label={t('profile.theme')}>
            <select
              className="input"
              value={settings.theme}
              onChange={async (e) => {
                const theme = e.target.value as Settings['theme'];
                await settingsRepo.set('theme', theme);
                await persist({ ...profile, preferences: { ...profile.preferences, theme } });
              }}
            >
              <option value="system">{t('profile.system')}</option>
              <option value="light">{t('profile.light')}</option>
              <option value="dark">{t('profile.dark')}</option>
            </select>
          </Field>
          <Field label={t('profile.weightUnit')}>
            <select
              className="input"
              value={settings.weightUnit}
              onChange={async (e) => {
                const weightUnit = e.target.value as Settings['weightUnit'];
                await settingsRepo.set('weightUnit', weightUnit);
                await persist({ ...profile, preferences: { ...profile.preferences, weightUnit } });
              }}
            >
              <option value="kg">{t('common.kg')}</option>
              <option value="lb">{t('common.lb')}</option>
            </select>
          </Field>
          <Field label={t('profile.heightUnit')}>
            <select
              className="input"
              value={settings.heightUnit}
              onChange={async (e) => {
                const hu = e.target.value as HeightUnit;
                await settingsRepo.set('heightUnit', hu);
                await persist({ ...profile, preferences: { ...profile.preferences, heightUnit: hu } });
              }}
            >
              <option value="cm">cm</option>
              <option value="ft_in">ft / in</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title={t('profile.notifications')}>
        <div className="space-y-3 text-sm">
          {exact === false && (
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              {t('profile.exactWarn')}
              <button
                className="btn-primary mt-2 w-full"
                onClick={async () => {
                  try {
                    await FitAlarms.requestExactAlarmPermission();
                    setTimeout(() => FitAlarms.canScheduleExactAlarms().then((r) => setExact(r.granted)), 1500);
                  } catch (e) {
                    toast(t('common.actionFailed', { msg: errMsg(e) }), 'error');
                  }
                }}
              >
                {t('profile.allowExact')}
              </button>
            </div>
          )}
          <Row label={t('profile.supplementAlarms')} hint={t('profile.supplementAlarmsHint')}>
            <Toggle checked={n.supplementAlarms !== false} label={t('profile.supplementAlarms')} onChange={(v) => setNotif({ supplementAlarms: v })} />
          </Row>
          <Row label={t('profile.workoutAlarm')} hint={t('profile.workoutAlarmHint', { time: formatTime(profile.workout.start) })}>
            <Toggle
              checked={profile.workout.alarm && n.workoutAlarm !== false}
              label={t('profile.workoutAlarm')}
              onChange={(v) => void persist({ ...profile, workout: { ...profile.workout, alarm: v }, notifications: { ...n, workoutAlarm: v } })}
            />
          </Row>
          <Row label={t('profile.habitReminders')} hint={t('profile.habitRemindersHint')}>
            <Toggle checked={n.habitReminders !== false} label={t('profile.habitReminders')} onChange={(v) => setNotif({ habitReminders: v })} />
          </Row>
          {n.habitReminders !== false && (
            <Field label={t('profile.eveningCheckIn')}>
              <div className="flex items-center gap-2">
                <TimeInput value={n.eveningCheckIn ?? '20:30'} onChange={(v) => setNotif({ eveningCheckIn: v })} label={t('profile.eveningCheckIn')} />
                <Toggle checked={!!n.eveningCheckIn} label={t('profile.eveningCheckIn')} onChange={(v) => setNotif({ eveningCheckIn: v ? '20:30' : null })} />
              </div>
            </Field>
          )}
          <Row label={t('profile.waterReminders')} hint={t('profile.waterRemindersHint')}>
            <Toggle checked={n.waterReminders !== false} label={t('profile.waterReminders')} onChange={(v) => setNotif({ waterReminders: v })} />
          </Row>
          {n.waterReminders !== false && (
            <Field label={t('profile.waterInterval')}>
              <input
                className="input"
                type="number"
                min={15}
                max={360}
                step={15}
                defaultValue={n.waterReminderIntervalMin ?? 90}
                onBlur={(e) => setNotif({ waterReminderIntervalMin: Math.min(360, Math.max(15, Number(e.target.value) || 90)) })}
              />
            </Field>
          )}
          <Row
            label={t('profile.fastingWindow')}
            hint={profile.fasting.enabled ? t('profile.fastingWindowHint', { n: n.fastingWarningMinutesBefore }) : t('profile.fastingOffHint')}
          >
            <Toggle
              checked={profile.fasting.enabled && n.fastingWindow !== false}
              disabled={!profile.fasting.enabled}
              label={t('profile.fastingWindow')}
              onChange={(v) => {
                if (profile.fasting.enabled) setNotif({ fastingWindow: v });
              }}
            />
          </Row>
          {profile.fasting.enabled && n.fastingWindow !== false && (
            <Field label={t('profile.fastingWarnMinutes')}>
              <input
                className="input"
                type="number"
                min={0}
                max={240}
                step={5}
                defaultValue={n.fastingWarningMinutesBefore}
                onBlur={(e) => setNotif({ fastingWarningMinutesBefore: Math.min(240, Math.max(0, Number(e.target.value) || 0)) })}
              />
            </Field>
          )}
          <Row label={t('profile.motivational')} hint={t('profile.motivationalHint', { times: n.motivational.times.map(formatTime).join(', ') || '—' })}>
            <Toggle
              checked={n.motivational.enabled}
              label={t('profile.motivational')}
              onChange={(v) => setNotif({ motivational: { ...n.motivational, enabled: v } })}
            />
          </Row>
          {n.motivational.enabled && (
            <Field label={t('profile.motivationalTimes')}>
              <input
                className="input"
                defaultValue={n.motivational.times.join(', ')}
                onBlur={(e) => {
                  const times = e.target.value
                    .split(',')
                    .map((x) => x.trim())
                    .filter((x) => /^([01]\d|2[0-3]):[0-5]\d$/.test(x))
                    .slice(0, 6);
                  setNotif({ motivational: { ...n.motivational, times } });
                }}
              />
            </Field>
          )}
          <Row label={t('profile.pinned')} hint={t('profile.pinnedHint')}>
            <Toggle checked={n.pinnedChecklist !== false} label={t('profile.pinned')} onChange={(v) => setNotif({ pinnedChecklist: v })} />
          </Row>
          <button
            className="btn-ghost w-full"
            onClick={async () => {
              try {
                const r = await FitAlarms.requestNotificationPermission();
                toast(r.granted ? t('profile.notifAllowed') : t('profile.notifDenied'), r.granted ? 'success' : 'error');
                void syncNative();
              } catch (e) {
                toast(t('common.actionFailed', { msg: errMsg(e) }), 'error');
              }
            }}
          >
            {t('profile.recheck')}
          </button>
        </div>
      </Card>

      <Card title={t('security.title')}>
        <div className="space-y-3 text-sm">
          <Row label={t('security.appLock')} hint={t('security.appLockHint')}>
            <Toggle checked={settings.appLockEnabled} label={t('security.appLock')} onChange={(v) => setPinDialog(v ? 'enable' : 'disable')} />
          </Row>
          {settings.appLockEnabled && (
            <>
              <Row
                label={t('security.biometric')}
                hint={
                  bioStatus === 'available'
                    ? t('security.biometricHint')
                    : bioStatus === 'none_enrolled'
                      ? t('security.biometricNone')
                      : bioStatus === 'no_hardware'
                        ? t('security.biometricNoHw')
                        : t('today.stepsUnsupported')
                }
              >
                <Toggle
                  checked={settings.biometricEnabled && bioStatus === 'available'}
                  disabled={bioStatus !== 'available'}
                  label={t('security.biometric')}
                  onChange={async (v) => {
                    if (bioStatus !== 'available') return;
                    if (!v) {
                      await settingsRepo.set('biometricEnabled', false);
                      notifyChange();
                      return;
                    }
                    setPinDialog('bio-verify');
                  }}
                />
              </Row>
              <Field label={t('security.autoLock')}>
                <select
                  className="input"
                  value={settings.lockTimeoutSec}
                  onChange={async (e) => {
                    await settingsRepo.set('lockTimeoutSec', Number(e.target.value));
                    notifyChange();
                  }}
                >
                  {LOCK_TIMEOUTS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {t(o.labelKey)}
                    </option>
                  ))}
                </select>
              </Field>
              <button className="btn-ghost w-full" onClick={() => setPinDialog('change')}>
                {t('security.changePin')}
              </button>
            </>
          )}
        </div>
      </Card>

      <Card title={t('profile.backup')}>
        <p className="text-xs text-slate-500">{t('profile.backupNote')}</p>
        <div className="mt-3 flex items-center justify-between gap-3">
          <div>
            <div className="text-sm">{t('profile.driveBackup')}</div>
            <div className="text-xs text-slate-500">{t('profile.driveHint')}</div>
          </div>
          <Toggle
            checked={profile.privacy.driveBackup}
            label={t('profile.driveBackup')}
            onChange={(v) => void persist({ ...profile, privacy: { ...profile.privacy, driveBackup: v } })}
          />
        </div>
        <div className="mt-3 flex gap-2">
          <button className="btn-primary flex-1" onClick={() => setBackupOpen(true)}>
            {t('profile.backupBtn')}
          </button>
          <button
            className="btn-ghost flex-1"
            onClick={async () => {
              try {
                const picked = await pickBackupFile();
                if (!picked) return;
                const v = parseBackup(picked.text);
                if (!v.ok) return toast(v.error, 'error');
                setPassphrase('');
                setRestoreTablesState(null);
                setRestoreFile(v.file);
                if (!v.file.encrypted) {
                  const u2 = await unpackBackup(v.file, '');
                  if (u2.ok) setRestoreTablesState(u2.tables);
                  else toast(u2.error, 'error');
                }
              } catch (e) {
                toast(t('profile.restoreFailed', { msg: errMsg(e) }), 'error');
              }
            }}
          >
            {t('profile.restoreBtn')}
          </button>
        </div>
      </Card>

      <h2 className="pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t('profile.advanced')}</h2>

      <Card title={t('profile.json')}>
        <div className="flex gap-2">
          <button className="btn-ghost flex-1" onClick={exportProfile}>
            {t('profile.export')}
          </button>
          <button className="btn-ghost flex-1" onClick={() => setMode('import')}>
            {t('profile.import')}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">{t('profile.jsonHint')}</p>
      </Card>

      <Card title={t('profile.danger')}>
        <button className="btn-danger w-full" onClick={() => setConfirmErase(true)}>
          {t('profile.erase')}
        </button>
      </Card>

      <p className="pb-4 text-center text-[11px] text-slate-400">{t('profile.footer')}</p>

      <ConfirmDialog
        open={confirmErase}
        title={t('profile.eraseTitle')}
        body={t('profile.eraseBody')}
        confirmLabel={t('profile.erase')}
        typedWord={t('profile.eraseWord')}
        onClose={() => setConfirmErase(false)}
        onConfirm={async () => {
          await eraseAllData();
          toast(t('profile.erased'), 'success');
        }}
      />

      <PinDialog
        open={pinDialog === 'enable'}
        mode="set"
        onClose={() => setPinDialog(null)}
        onDone={async (pin) => {
          await enableAppLock(pin);
          toast(t('security.pinSet'), 'success');
        }}
      />
      <PinDialog
        open={pinDialog === 'change'}
        mode="change"
        onClose={() => setPinDialog(null)}
        onDone={async (pin) => {
          await changePin(pin);
          toast(t('security.pinChanged'), 'success');
        }}
      />
      <PinDialog
        open={pinDialog === 'disable'}
        mode="verify"
        onClose={() => setPinDialog(null)}
        onDone={async () => {
          await disableAppLock();
          toast(t('security.lockOff'));
        }}
      />
      <PinDialog
        open={pinDialog === 'bio-verify'}
        mode="verify"
        onClose={() => setPinDialog(null)}
        onDone={async () => {
          await settingsRepo.set('biometricEnabled', true);
          notifyChange();
        }}
      />

      <Modal
        open={backupOpen}
        onClose={() => setBackupOpen(false)}
        title={t('profile.backupBtn')}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setBackupOpen(false)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn-primary"
              onClick={async () => {
                if (passphrase.length < 6) return toast(t('profile.passphraseShort'), 'error');
                try {
                  const ok = await exportBackup(passphrase);
                  if (ok) toast(t('profile.backupSaved'), 'success');
                  setBackupOpen(false);
                  setPassphrase('');
                } catch (e) {
                  toast(t('profile.backupFailed', { msg: errMsg(e) }), 'error');
                }
              }}
            >
              {t('common.save')}
            </button>
          </>
        }
      >
        <Field label={t('profile.passphrase')} hint={t('profile.passphraseHint')}>
          <input className="input" type="password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} autoFocus />
        </Field>
      </Modal>

      <Modal
        open={!!restoreFile}
        onClose={() => setRestoreFile(null)}
        title={t('profile.restoreTitle')}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setRestoreFile(null)}>
              {t('common.cancel')}
            </button>
            <button
              className="btn-danger"
              disabled={!restoreTablesState}
              onClick={async () => {
                if (!restoreTablesState) return;
                try {
                  await restoreTables(restoreTablesState);
                  setRestoreFile(null);
                  void syncNative();
                  toast(t('profile.restored'), 'success');
                } catch (e) {
                  toast(t('profile.restoreFailed', { msg: errMsg(e) }), 'error');
                }
              }}
            >
              {t('profile.replace')}
            </button>
          </>
        }
      >
        {restoreFile && (
          <>
            <p className="text-sm">{t('profile.restoreBody', { when: new Date(restoreFile.exportedAt).toLocaleString() })}</p>
            {restoreFile.encrypted && !restoreTablesState && (
              <div className="mt-3 flex gap-2">
                <input
                  className="input"
                  type="password"
                  placeholder={t('profile.passphrase')}
                  aria-label={t('profile.passphrase')}
                  value={passphrase}
                  onChange={(e) => setPassphrase(e.target.value)}
                />
                <button
                  className="btn-ghost"
                  onClick={async () => {
                    try {
                      const u2 = await unpackBackup(restoreFile, passphrase);
                      if (!u2.ok) return toast(u2.error === 'wrong_passphrase' ? t('profile.wrongPassphrase') : u2.error, 'error');
                      setRestoreTablesState(u2.tables);
                    } catch (e) {
                      toast(t('profile.restoreFailed', { msg: errMsg(e) }), 'error');
                    }
                  }}
                >
                  {t('common.ok')}
                </button>
              </div>
            )}
            {restoreTablesState && (
              <ul className="mt-3 grid grid-cols-2 gap-1 text-xs">
                {summarizeTables(restoreTablesState).map((r) => (
                  <li key={r.label} className="flex justify-between rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800/60">
                    <span>{r.label}</span>
                    <b>{r.count}</b>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-[48px] items-center justify-between gap-3">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
