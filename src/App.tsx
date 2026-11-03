import { useEffect, useState } from 'react';
import { App as CapApp } from '@capacitor/app';
import type { Profile, Settings } from './types';
import { foodRepo, profileRepo, settingsRepo } from './db/repos';
import { getDb } from './db/database';
import { useRevision } from './store/appStore';
import { Overlays, Spinner } from './components/ui';
import { TabBar, type Tab } from './components/TabBar';
import { Onboarding } from './screens/Onboarding';
import { Today } from './screens/Today';
import { Habits } from './screens/Habits';
import { Food } from './screens/Food';
import { Progress } from './screens/Progress';
import { ProfileScreen } from './screens/ProfileScreen';
import { ensureWeeklySummaries } from './services/weekly';
import { applyNativeAction, consumePendingActions, syncNative } from './services/sync';
import { FitAlarms } from './native/plugins';
import { refreshSteps } from './services/health';
import { t } from './i18n';

function applyTheme(theme: Settings['theme']) {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
}

export default function App() {
  const revision = useRevision();
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
        setReady(true);
        if (s.onboarded) {
          await consumePendingActions();
          await ensureWeeklySummaries();
          void syncNative();
          void refreshSteps();
        }
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
        if (isActive) {
          await consumePendingActions();
          await ensureWeeklySummaries();
          void syncNative();
          void refreshSteps();
        }
      });
      actionHandle = await FitAlarms.addListener('action', (a) => void applyNativeAction(a));
    })();
    return () => {
      handle?.remove();
      actionHandle?.remove();
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

  return (
    <div className="flex h-full flex-col">
      <main className="flex-1 overflow-y-auto px-4 pb-24" style={{ paddingTop: 'calc(0.75rem + var(--safe-top))' }}>
        {tab === 'today' && <Today profile={profile} settings={settings} onOpenHabits={() => setTab('habits')} />}
        {tab === 'habits' && <Habits profile={profile} />}
        {tab === 'food' && <Food profile={profile} />}
        {tab === 'progress' && <Progress profile={profile} settings={settings} />}
        {tab === 'profile' && <ProfileScreen profile={profile} settings={settings} />}
      </main>
      <TabBar tab={tab} onChange={setTab} />
      <Overlays />
    </div>
  );
}
