import { t } from '../i18n';

export type Tab = 'today' | 'habits' | 'food' | 'progress' | 'profile';

const TABS: { id: Tab; icon: string }[] = [
  { id: 'today', icon: '☀️' },
  { id: 'habits', icon: '✅' },
  { id: 'food', icon: '🍛' },
  { id: 'progress', icon: '📈' },
  { id: 'profile', icon: '👤' },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
      // Native pads the WebView for system bars (so --safe-bottom is 0 there); a fixed 12px keeps the bar
      // comfortably clear of the gesture area on both native and the web preview.
      style={{ paddingBottom: 'calc(12px + var(--safe-bottom))' }}
      aria-label={t('nav.main')}
    >
      <div className="mx-auto flex max-w-lg md:max-w-3xl">
        {TABS.map((tb) => (
          <button
            key={tb.id}
            onClick={() => onChange(tb.id)}
            className={`flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium ${tab === tb.id ? 'text-brand-600' : 'text-slate-500'}`}
            aria-current={tab === tb.id ? 'page' : undefined}
          >
            <span className="text-lg leading-none" aria-hidden="true">
              {tb.icon}
            </span>
            {t(`nav.${tb.id}`)}
          </button>
        ))}
      </div>
    </nav>
  );
}
