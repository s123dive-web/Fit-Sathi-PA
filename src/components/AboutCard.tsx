import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { App as CapApp } from '@capacitor/app';
import { Card } from './ui';
import { t } from '../i18n';

export const PRIVACY_POLICY_URL = 'https://github.com/s123dive-web/Fit-Sathi-PA/blob/main/PRIVACY.md';
export const SOURCE_URL = 'https://github.com/s123dive-web/Fit-Sathi-PA';
/** Newest CI build (see .github/workflows/build.yml). Opens in the system browser; the app itself stays offline. */
export const UPDATE_URL = 'https://github.com/s123dive-web/Fit-Sathi-PA/releases/latest';
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? '1.0.0';

const linkClass = 'inline-flex min-h-[44px] items-center text-brand-600 underline-offset-2 hover:underline';

/** Installed versionCode (the CI build number) on Android; null on web or if the lookup fails. */
function useInstalledBuild(): string | null {
  const [build, setBuild] = useState<string | null>(null);
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let alive = true;
    CapApp.getInfo()
      .then((info) => alive && setBuild(info.build))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);
  return build;
}

/** App name + version, the on-device data promise, update / policy / source links and the wellness disclaimer. */
export function AboutCard() {
  const build = useInstalledBuild();
  return (
    <Card title={t('about.title')}>
      <div className="space-y-2 text-sm">
        <div className="font-medium">
          {t('about.version', { name: t('app.name'), version: APP_VERSION })}
          {build && <span className="ml-1 font-normal text-slate-500">{t('about.build', { build })}</span>}
        </div>
        <p className="text-xs text-slate-500">{t('about.local')}</p>
        <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
          <div className="text-xs font-medium">{t('about.updateTitle')}</div>
          <p className="mt-1 text-xs text-slate-500">{t('about.updateHelp')}</p>
          <a className={linkClass + ' text-xs font-medium'} href={UPDATE_URL} target="_blank" rel="noopener noreferrer">
            {t('about.updateCta')}
          </a>
          <p className="text-[11px] leading-relaxed text-slate-400">{t('about.updateWarning')}</p>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
          <a className={linkClass} href={PRIVACY_POLICY_URL} target="_blank" rel="noopener noreferrer">
            {t('about.privacyPolicy')}
          </a>
          <a className={linkClass} href={SOURCE_URL} target="_blank" rel="noopener noreferrer">
            {t('about.source')}
          </a>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">{t('about.disclaimer')}</p>
      </div>
    </Card>
  );
}
