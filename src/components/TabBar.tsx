export type Tab = 'today' | 'habits' | 'food' | 'progress' | 'profile';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'today', label: 'Today', icon: '☀️' },
  { id: 'habits', label: 'Habits', icon: '✅' },
  { id: 'food', label: 'Food', icon: '🍛' },
  { id: 'progress', label: 'Progress', icon: '📈' },
  { id: 'profile', label: 'Profile', icon: '👤' },
];

export function TabBar({ tab, onChange }: { tab: Tab; onChange: (t: Tab) => void }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95"
      style={{ paddingBottom: 'var(--safe-bottom)' }}
    >
      <div className="mx-auto flex max-w-lg">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => onChange(t.id)}
            className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${tab === t.id ? 'text-brand-600' : 'text-slate-500'}`}
            aria-current={tab === t.id ? 'page' : undefined}
          >
            <span className="text-lg leading-none">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
