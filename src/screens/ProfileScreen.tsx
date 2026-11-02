import { useEffect, useState } from 'react';
import type { Profile, Settings } from '../types';
import { profileRepo, settingsRepo } from '../db/repos';
import { getDb } from '../db/database';
import { notifyChange, toast } from '../store/appStore';
import { Card, Field, Modal, Stat, TimeInput, Toggle } from '../components/ui';
import { ProfileForm, normalizeProfile } from '../components/ProfileForm';
import { ProfileImport } from '../components/ProfileImport';
import { exportProfileJson, validateProfile } from '../logic/profile';
import { nutritionTargets } from '../logic/nutrition';
import { bmi, formatHeight, formatWeight, heightToCm } from '../logic/units';
import { FitAlarms, FitBackup } from '../native/plugins';
import { syncNative } from '../services/sync';
import { exportBackup, pickBackupFile, restoreBackup, summarizeBackup, validateBackup, type BackupFile } from '../services/backup';
import { todayISO } from '../logic/dates';

export function ProfileScreen({ profile, settings }: { profile: Profile; settings: Settings }) {
  const [mode, setMode] = useState<'view' | 'edit' | 'import'>('view');
  const [draft, setDraft] = useState<Profile>(profile);
  const [errors, setErrors] = useState<string[]>([]);
  const [exact, setExact] = useState<boolean | null>(null);
  const [restoreCandidate, setRestoreCandidate] = useState<BackupFile | null>(null);
  const targets = nutritionTargets(profile);
  const cm = heightToCm(profile.height);

  useEffect(() => {
    FitAlarms.canScheduleExactAlarms()
      .then((r) => setExact(r.granted))
      .catch(() => setExact(null));
  }, []);

  const saveProfile = async () => {
    const normalized = normalizeProfile(draft);
    const res = validateProfile(normalized);
    if (!res.ok) return setErrors(res.errors);
    setErrors([]);
    await profileRepo.save(res.profile!);
    await settingsRepo.update({ theme: res.profile!.preferences?.theme ?? settings.theme, weightUnit: res.profile!.preferences?.weightUnit ?? settings.weightUnit });
    notifyChange();
    void syncNative();
    toast('Profile saved', 'success');
    setMode('view');
  };

  const savePrefs = async (prefs: NonNullable<Profile['preferences']>) => {
    const next = { ...profile, preferences: { ...profile.preferences, ...prefs } };
    await profileRepo.save(next);
    if (prefs.theme) await settingsRepo.set('theme', prefs.theme);
    if (prefs.weightUnit) await settingsRepo.set('weightUnit', prefs.weightUnit);
    notifyChange();
    void syncNative();
  };

  const exportProfile = async () => {
    const res = await FitBackup.saveDocument({ filename: `${profile.name.toLowerCase().replace(/\s+/g, '_') || 'profile'}_profile.json`, mimeType: 'application/json', data: exportProfileJson(profile) });
    if (res.saved) toast('Profile exported', 'success');
  };

  if (mode === 'edit') {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Edit profile</h1>
          <button className="btn-ghost" onClick={() => setMode('view')}>
            Cancel
          </button>
        </header>
        <ProfileForm value={draft} onChange={setDraft} />
        {errors.length > 0 && (
          <div className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-200">
            <ul className="list-disc pl-5">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          </div>
        )}
        <button className="btn-primary w-full" onClick={saveProfile}>
          Save changes
        </button>
      </div>
    );
  }

  if (mode === 'import') {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-xl font-bold">Import profile</h1>
          <button className="btn-ghost" onClick={() => setMode('view')}>
            Cancel
          </button>
        </header>
        <ProfileImport
          existing={profile}
          onImported={async (p) => {
            await profileRepo.save(p);
            await settingsRepo.update({ theme: p.preferences?.theme ?? settings.theme, weightUnit: p.preferences?.weightUnit ?? settings.weightUnit });
            notifyChange();
            void syncNative();
            toast('Profile imported', 'success');
            setMode('view');
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Profile</h1>
        <button
          className="btn-primary"
          onClick={() => {
            setDraft(profile);
            setMode('edit');
          }}
        >
          Edit
        </button>
      </header>

      <Card>
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-600 text-2xl font-bold text-white">{profile.name.charAt(0).toUpperCase()}</div>
          <div>
            <div className="text-lg font-semibold">{profile.name}</div>
            <div className="text-sm text-slate-500">
              {profile.age} y · {formatHeight(profile.height)}
              {profile.city ? ` · ${profile.city}` : ''}
            </div>
            <div className="text-xs text-slate-500">
              {profile.dietType.replace('_', '-')} · {profile.activityLevel.replace('_', ' ')}
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <Stat label="Current" value={formatWeight(profile.currentWeightKg, settings.weightUnit, 1)} />
          <Stat label="Target" value={formatWeight(profile.targetWeightKg, settings.weightUnit, 1)} />
          <Stat label="BMI" value={bmi(profile.currentWeightKg, cm)} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-500">
          <div>⏳ Fasting: {profile.fasting.enabled ? `${profile.fasting.start} → ${profile.fasting.end}` : 'off'}</div>
          <div>😴 Sleep: {profile.sleep.start} → {profile.sleep.end}</div>
          <div>💧 Water: {profile.waterTargetMl} ml</div>
          <div>🏋️ Workout: {profile.workout.start}–{profile.workout.end}</div>
          <div className="col-span-2">🍽️ Targets: {targets.kcal} kcal · {targets.proteinG} g protein {targets.source === 'computed' ? '(auto from profile)' : ''}</div>
          {profile.appearanceGoals && <div className="col-span-2">🎯 {profile.appearanceGoals}</div>}
        </div>
      </Card>

      <Card title="Profile JSON">
        <div className="flex gap-2">
          <button className="btn-primary flex-1" onClick={exportProfile}>
            Export JSON
          </button>
          <button className="btn-ghost flex-1" onClick={() => setMode('import')}>
            Import JSON…
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">Import validates against the schema and shows a diff before overwriting.</p>
      </Card>

      <Card title="Appearance & units">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Theme">
            <select className="input" value={settings.theme} onChange={(e) => void savePrefs({ theme: e.target.value as Settings['theme'] })}>
              <option value="system">System</option>
              <option value="light">Light</option>
              <option value="dark">Dark</option>
            </select>
          </Field>
          <Field label="Weight unit">
            <select className="input" value={settings.weightUnit} onChange={(e) => void savePrefs({ weightUnit: e.target.value as Settings['weightUnit'] })}>
              <option value="kg">kg</option>
              <option value="lb">lb</option>
            </select>
          </Field>
        </div>
      </Card>

      <Card title="Notifications & alarms">
        <div className="space-y-3 text-sm">
          {exact === false && (
            <div className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-900/30 dark:text-amber-200">
              Exact alarms are not allowed yet. Supplement alarms may be late without this permission.
              <button
                className="btn-primary mt-2 w-full"
                onClick={async () => {
                  await FitAlarms.requestExactAlarmPermission();
                  setTimeout(() => FitAlarms.canScheduleExactAlarms().then((r) => setExact(r.granted)), 1500);
                }}
              >
                Allow exact alarms
              </button>
            </div>
          )}
          <Row label="Pinned habit notification" hint="Ongoing notification with tick buttons">
            <Toggle
              checked={settings.pinnedNotificationEnabled}
              label="Pinned notification"
              onChange={async (v) => {
                await settingsRepo.set('pinnedNotificationEnabled', v);
                notifyChange();
                void syncNative();
              }}
            />
          </Row>
          <Row label="Water reminders" hint="Between wake-up and bedtime">
            <Toggle checked={profile.preferences?.waterReminders !== false} label="Water reminders" onChange={(v) => void savePrefs({ waterReminders: v })} />
          </Row>
          {profile.preferences?.waterReminders !== false && (
            <Field label="Water reminder interval (minutes)">
              <input className="input" type="number" min={15} max={360} step={15} value={profile.preferences?.waterReminderIntervalMin ?? 90} onChange={(e) => void savePrefs({ waterReminderIntervalMin: Math.max(15, Number(e.target.value) || 90) })} />
            </Field>
          )}
          <Row label="Fasting window notifications" hint="When the eating window opens / closes">
            <Toggle checked={profile.preferences?.fastingNotifications !== false} label="Fasting notifications" onChange={(v) => void savePrefs({ fastingNotifications: v })} />
          </Row>
          <Field label="Evening habit check-in">
            <TimeInput value={profile.preferences?.habitReminderTime ?? '20:30'} onChange={(v) => void savePrefs({ habitReminderTime: v })} />
          </Field>
          <button
            className="btn-ghost w-full"
            onClick={async () => {
              const r = await FitAlarms.requestNotificationPermission();
              toast(r.granted ? 'Notifications allowed' : 'Notifications not allowed', r.granted ? 'success' : 'error');
              void syncNative();
            }}
          >
            Re-check notification permission
          </button>
        </div>
      </Card>

      <Card title="Backup & restore">
        <p className="text-xs text-slate-500">Creates a JSON file with all your data (habits, logs, meals, weights, summaries). You choose where it goes — Google Drive, Downloads, etc. The app itself never uploads anything. Photos stay on-device and are not included.</p>
        <div className="mt-3 flex gap-2">
          <button
            className="btn-primary flex-1"
            onClick={async () => {
              try {
                const ok = await exportBackup();
                if (ok) toast('Backup saved', 'success');
              } catch (e) {
                toast(`Backup failed: ${(e as Error).message}`, 'error');
              }
            }}
          >
            Back up to Drive / file
          </button>
          <button
            className="btn-ghost flex-1"
            onClick={async () => {
              const picked = await pickBackupFile();
              if (!picked) return;
              const v = validateBackup(picked.text);
              if (!v.ok) return toast(v.error, 'error');
              setRestoreCandidate(v.file);
            }}
          >
            Restore…
          </button>
        </div>
      </Card>

      <Card title="Danger zone">
        <button
          className="btn-danger w-full"
          onClick={async () => {
            if (!confirm('Erase ALL data on this device (profile, habits, logs, photos metadata)? This cannot be undone.')) return;
            const db = await getDb();
            await db.wipe();
            try {
              await FitAlarms.syncAlarms({ alarms: [] });
              await FitAlarms.updatePinned({ enabled: false, title: '', date: todayISO(), items: [] });
            } catch {
              /* ignore */
            }
            notifyChange();
          }}
        >
          Erase all data
        </button>
      </Card>

      <p className="pb-4 text-center text-[11px] text-slate-400">FitSaathi · offline-first · no accounts, no analytics</p>

      <Modal
        open={!!restoreCandidate}
        onClose={() => setRestoreCandidate(null)}
        title="Restore backup?"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setRestoreCandidate(null)}>
              Cancel
            </button>
            <button
              className="btn-danger"
              onClick={async () => {
                if (!restoreCandidate) return;
                await restoreBackup(restoreCandidate);
                setRestoreCandidate(null);
                void syncNative();
                toast('Backup restored', 'success');
              }}
            >
              Replace my data
            </button>
          </>
        }
      >
        {restoreCandidate && (
          <>
            <p className="text-sm">
              Exported {new Date(restoreCandidate.exportedAt).toLocaleString()}. This will <b>replace</b> everything currently on this device.
            </p>
            <ul className="mt-3 grid grid-cols-2 gap-1 text-xs">
              {summarizeBackup(restoreCandidate).map((r) => (
                <li key={r.label} className="flex justify-between rounded-lg bg-slate-50 px-2 py-1 dark:bg-slate-800/60">
                  <span>{r.label}</span>
                  <b>{r.count}</b>
                </li>
              ))}
            </ul>
          </>
        )}
      </Modal>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <div className="text-sm">{label}</div>
        {hint && <div className="text-xs text-slate-500">{hint}</div>}
      </div>
      {children}
    </div>
  );
}
