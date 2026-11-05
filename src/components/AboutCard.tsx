import { Card } from './ui';
import { t } from '../i18n';

export const PRIVACY_POLICY_URL = 'https://github.com/s123dive-web/Fit-Sathi-PA/blob/main/PRIVACY.md';
export const SOURCE_URL = 'https://github.com/s123dive-web/Fit-Sathi-PA';
export const APP_VERSION: string = import.meta.env.VITE_APP_VERSION ?? '1.0.0';

const linkClass = 'inline-flex min-h-[44px] items-center text-brand-600 underline-offset-2 hover:underline';

/** App name + version, the on-device data promise, policy / source links and the wellness disclaimer. */
export function AboutCard() {
  return (
    <Card title={t('about.title')}>
      <div className="space-y-2 text-sm">
        <div className="font-medium">{t('about.version', { name: t('app.name'), version: APP_VERSION })}</div>
        <p className="text-xs text-slate-500">{t('about.local')}</p>
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
