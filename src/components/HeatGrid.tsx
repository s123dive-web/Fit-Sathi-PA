import type { HabitLog, HabitStatus, ISODate } from '../types';
import { addDays, isoWeekday, weekStart } from '../logic/dates';

/** GitHub-style heat grid, last `weeks` weeks, Monday at the top. */
export function HeatGrid({ logs, today, weeks = 16, color = '#22a566', scheduled }: { logs: HabitLog[]; today: ISODate; weeks?: number; color?: string; scheduled?: (d: ISODate) => boolean }) {
  const byDate = new Map<ISODate, HabitStatus>();
  for (const l of logs) byDate.set(l.date, l.status);
  const end = weekStart(today);
  const start = addDays(end, -(weeks - 1) * 7);
  const cols: ISODate[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const ws = addDays(start, w * 7);
    cols.push(Array.from({ length: 7 }, (_, i) => addDays(ws, i)));
  }
  const labels = ['M', '', 'W', '', 'F', '', 'S'];
  return (
    <div className="flex gap-1 overflow-x-auto pb-1">
      <div className="flex flex-col gap-1 pr-1 text-[9px] leading-none text-slate-400">
        {labels.map((l, i) => (
          <div key={i} className="flex h-3 items-center">
            {l}
          </div>
        ))}
      </div>
      {cols.map((col, ci) => (
        <div key={ci} className="flex flex-col gap-1">
          {col.map((d) => {
            const st = byDate.get(d);
            const future = d > today;
            const isSched = scheduled ? scheduled(d) : true;
            let style: React.CSSProperties = {};
            let cls = 'bg-slate-100 dark:bg-slate-800';
            if (future) cls = 'bg-transparent';
            else if (st === 'done') {
              style = { background: color };
              cls = '';
            } else if (st === 'skip') cls = 'bg-sky-200 dark:bg-sky-900';
            else if (st === 'miss' || (isSched && d < today)) cls = 'bg-rose-100 dark:bg-rose-950';
            if (!isSched && !st && !future) cls = 'bg-slate-50 dark:bg-slate-900';
            return <div key={d} title={`${d}${st ? ` · ${st}` : ''}`} className={`h-3 w-3 rounded-[3px] ${cls} ${d === today ? 'ring-1 ring-slate-400' : ''}`} style={style} />;
          })}
        </div>
      ))}
    </div>
  );
}

export function weekdayOf(d: ISODate) {
  return isoWeekday(d);
}
