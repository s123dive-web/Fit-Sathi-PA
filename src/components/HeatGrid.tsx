import { useState } from 'react';
import type { HabitLog, HabitStatus, ISODate } from '../types';
import { addDays, formatDateShort, isoWeekday, weekStart } from '../utils/dates';
import { t } from '../i18n';

/** GitHub-style heat grid, last `weeks` weeks, Monday at the top. Tap a cell to reveal its label. */
export function HeatGrid({
  logs,
  today,
  weeks = 16,
  color = '#22a566',
  scheduled,
}: {
  logs: HabitLog[];
  today: ISODate;
  weeks?: number;
  color?: string;
  scheduled?: (d: ISODate) => boolean;
}) {
  const [picked, setPicked] = useState<ISODate | null>(null);
  const byDate = new Map<ISODate, HabitStatus>();
  for (const l of logs) byDate.set(l.date, l.status);
  const end = weekStart(today);
  const start = addDays(end, -(weeks - 1) * 7);
  const cols: ISODate[][] = [];
  for (let w = 0; w < weeks; w += 1) {
    const ws = addDays(start, w * 7);
    cols.push(Array.from({ length: 7 }, (_, i) => addDays(ws, i)));
  }
  const dayLabel = (i: number) => t(`days.${['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'][i]}`).slice(0, 1);
  const labels = [dayLabel(0), '', dayLabel(2), '', dayLabel(4), '', dayLabel(6)];

  const describe = (d: ISODate): string => {
    const st = byDate.get(d);
    const isSched = scheduled ? scheduled(d) : true;
    const status =
      d > today
        ? t('habits.future')
        : st
          ? t(`habits.legend${st === 'done' ? 'Done' : st === 'skip' ? 'Skipped' : 'Missed'}`)
          : !isSched
            ? t('habits.notScheduled')
            : d < today
              ? t('habits.legendMissed')
              : t('habits.noLog');
    return t('habits.cellLabel', { date: formatDateShort(d), status });
  };

  return (
    <div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="grid" aria-label={t('habits.history')}>
        <div className="flex flex-col gap-1 pr-1 text-[9px] leading-none text-slate-400" aria-hidden="true">
          {labels.map((l, i) => (
            <div key={i} className="flex h-3 items-center">
              {l}
            </div>
          ))}
        </div>
        {cols.map((col, ci) => (
          <div key={ci} className="flex flex-col gap-1" role="row">
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
              return (
                <button
                  key={d}
                  type="button"
                  role="gridcell"
                  aria-label={describe(d)}
                  aria-pressed={picked === d}
                  title={describe(d)}
                  onClick={() => setPicked((p) => (p === d ? null : d))}
                  className={`h-3 w-3 rounded-[3px] ${cls} ${d === today ? 'ring-1 ring-slate-400' : ''} ${picked === d ? 'ring-2 ring-brand-500' : ''}`}
                  style={style}
                />
              );
            })}
          </div>
        ))}
      </div>
      <div className="mt-1 min-h-[1rem] text-[11px] text-slate-500" aria-live="polite">
        {picked ? describe(picked) : ''}
      </div>
    </div>
  );
}

export function weekdayOf(d: ISODate) {
  return isoWeekday(d);
}
