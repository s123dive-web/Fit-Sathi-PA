import { lazy, Suspense, useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import type { Profile, Settings } from './types';
import { foodRepo, profileRepo, settingsRepo } from './db/repos';
import { getDb } from './db/database';
import { useRevision } from './store/appStore';
import { useLockStore } from './store/lockStore';
import { LockScreen } from './screens/LockScreen';
import { Overlays, Spinner } from './components/ui';
import { TabBar, type Tab } from './components/TabBar';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Habits } from './screens/Habits';
import { Food } from './screens/Food';
const Progress = lazy(() => import('./screens/Progress').then((m) => ({ default: m.Progress })));
import { ProfileScreen } from './screens/ProfileScreen';
import { ensureWeeklySummaries } from './services/weekly';
import { applyNativeAction, consumePendingActions, syncNative } from './services/sync';
import { FitAlarms, FitBiometric } from './native/plugins';
import { refreshSteps } from './services/health';
import { todayISO } from './utils/dates';
import { notifyChange, toast } from './store/appStore';
import { t } from './i18n';

/** Housekeeping on launch and on every return to the foreground. Never throws: a bad row must not block the UI. */
async function onForeground(): Promise<void> {
  try {
    await consumePendingActions();
  } catch (e) {
    console.warn('pending actions failed', e);
  }
  try {
    await ensureWeeklySummaries();
  } catch (e) {
    console.warn('weekly summaries failed', e);
    toast(t('errors.weeklyFailed'), 'error');
  }
  void syncNative();
  void refreshSteps();
}

function applyTheme(theme: Settings['theme']) {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}

export default function App() {
  const revision = useRevision();
  const locked = useLockStore((s) => s.locked);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tab, setTab] = useState<Tab>('today');

  useEffect(() => {
    (async () => {
      try {
        await getDb();
        await foodRepo.seedIfEmpty();
        const [p, s] = await Promise.all([profileRepo.get(), settingsRepo.get()]);
        setProfile(p);
        setSettings(s);
        applyTheme(s.theme);
        useLockStore.getState().initialize(s.onboarded && s.appLockEnabled);
        // Block screenshots / recents thumbnails while the app lock is on (FLAG_SECURE on Android).
        FitBiometric.setSecureScreen({ enabled: s.appLockEnabled }).catch(() => undefined);
        setReady(true);
        if (s.onboarded) await onForeground();
      } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  useEffect(() => {
    if (!ready) return;
    (async () => {
      const [p, s] = await Promise.all([profileRepo.get(), settingsRepo.get()]);
      setProfile(p);
      setSettings((prev) => {
        if (prev && !prev.onboarded && s.onboarded) setTab('today'); // fresh onboarding always lands on Today
        return s;
      });
      applyTheme(s.theme);
    })();
  }, [revision, ready]);

  // Midnight rollover: screens compute "today" when they render, so bump the revision when the date changes
  // (checked every minute and whenever the page becomes visible again).
  useEffect(() => {
    let last = todayISO();
    const check = () => {
      const now = todayISO();
      if (now !== last) {
        last = now;
        notifyChange();
        void syncNative();
      }
    };
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const onChange = () => settings && applyTheme(settings.theme);
    media?.addEventListener?.('change', onChange);
    return () => media?.removeEventListener?.('change', onChange);
  }, [settings]);

  useEffect(() => {
    let handle: { remove: () => void } | null = null;
    let actionHandle: { remove: () => void } | null = null;
    (async () => {
      handle = await CapApp.addListener('appStateChange', async ({ isActive }) => {
        if (!isActive) {
          useLockStore.getState().onBackground();
          return;
        }
        {
          const s = await settingsRepo.get();
          useLockStore.getState().onForeground(s.onboarded && s.appLockEnabled, s.lockTimeoutSec);
        }
        await onForeground();
      });
      actionHandle = await FitAlarms.addListener('action', (a) => void applyNativeAction(a));
    })();
    // Web / browser preview: mirror background & foreground through the Page Visibility API.
    const onVis = async () => {
      if (document.visibilityState === 'hidden') useLockStore.getState().onBackground();
      else {
        const s = await settingsRepo.get();
        useLockStore.getState().onForeground(s.onboarded && s.appLockEnabled, s.lockTimeoutSec);
      }
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      handle?.remove();
      actionHandle?.remove();
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  if (error) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6 text-center">
        <div className="text-3xl">⚠️</div>
        <h1 className="mt-2 font-semibold">{t('errors.dbTitle')}</h1>
        <p className="mt-1 text-sm text-slate-500">{error}</p>
      </div>
    );
  }
  if (!ready || !settings) return <Spinner />;

  if (!settings.onboarded || !profile) {
    return (
      <>
        <Onboarding existing={profile} />
        <Overlays />
      </>
    );
  }

  if (settings.appLockEnabled && locked) {
    return (
      <>
        <LockScreen settings={settings} name={profile.user.name.split(' ')[0]} />
        <Overlays />
      </>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-24" style={{ paddingTop: 'calc(0.75rem + var(--safe-top))' }}>
        {tab === 'today' && <Today profile={profile} settings={settings} onOpenHabits={() => setTab('habits')} />}
        {tab === 'habits' && <Habits profile={profile} />}
        {tab === 'food' && <Food profile={profile} />}
        {tab === 'progress' && (
          <Suspense fallback={<Spinner />}>
            <Progress profile={profile} settings={settings} />
          </Suspense>
        )}
        {tab === 'profile' && <ProfileScreen profile={profile} settings={settings} />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
      <Overlays />
    </div>
  );
}
