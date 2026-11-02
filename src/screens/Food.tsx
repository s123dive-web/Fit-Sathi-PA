import { useMemo, useState } from 'react';
import type { FoodItem, MealLog, Profile } from '../types';
import { foodRepo, mealRepo } from '../db/repos';
import { notifyChange, toast, useAsyncData } from '../store/appStore';
import { Card, EmptyState, Field, Modal, Spinner, Stat } from '../components/ui';
import { addDays, formatDateShort, formatHHMM12, nowHHMM, todayISO } from '../logic/dates';
import { nutritionTargets } from '../logic/nutrition';
import { isInEatingWindow } from '../logic/fasting';
import { newId } from '../logic/ids';
import { logMeal, removeMeal } from '../services/actions';
import { FOOD_CATEGORIES } from '../data/indianFoods';

export function Food({ profile }: { profile: Profile }) {
  const [date, setDate] = useState(todayISO());
  const [picker, setPicker] = useState(false);
  const [custom, setCustom] = useState(false);
  const targets = useMemo(() => nutritionTargets(profile), [profile]);
  const { data, loading } = useAsyncData(async () => {
    const [foods, meals, week] = await Promise.all([foodRepo.all(), mealRepo.on(date), mealRepo.between(addDays(date, -6), date)]);
    return { foods, meals, week };
  }, [date]);
  if (loading && !data) return <Spinner />;
  if (!data) return null;

  const totals = data.meals.reduce(
    (a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.proteinG, c: a.c + m.carbsG, f: a.f + m.fatG }),
    { kcal: 0, p: 0, c: 0, f: 0 },
  );
  const weekDays = new Set(data.week.map((m) => m.date)).size;
  const weeklyProteinAvg = weekDays ? Math.round(data.week.reduce((a, m) => a + m.proteinG, 0) / weekDays) : 0;
  const outside = data.meals.filter((m) => m.outsideFastingWindow).length;

  return (
    <div className="mx-auto max-w-lg space-y-4">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Food</h1>
        <div className="flex items-center gap-1">
          <button className="btn-ghost h-9 w-9 p-0" onClick={() => setDate(addDays(date, -1))} aria-label="Previous day">
            ‹
          </button>
          <span className="w-16 text-center text-sm font-medium">{date === todayISO() ? 'Today' : formatDateShort(date)}</span>
          <button className="btn-ghost h-9 w-9 p-0" onClick={() => setDate(addDays(date, 1))} disabled={date >= todayISO()} aria-label="Next day">
            ›
          </button>
        </div>
      </header>

      <Card title={`Daily totals · target ${targets.kcal} kcal${targets.source === 'computed' ? ' (auto)' : ''}`}>
        <div className="mb-3">
          <div className="flex items-end justify-between">
            <div className="text-3xl font-bold">
              {Math.round(totals.kcal)} <span className="text-sm font-normal text-slate-500">kcal</span>
            </div>
            <div className={`text-sm font-medium ${totals.kcal > targets.kcal ? 'text-rose-600' : 'text-brand-600'}`}>
              {totals.kcal > targets.kcal ? `+${Math.round(totals.kcal - targets.kcal)} over` : `${Math.round(targets.kcal - totals.kcal)} left`}
            </div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
            <div className={`h-full rounded-full ${totals.kcal > targets.kcal ? 'bg-rose-500' : 'bg-brand-500'}`} style={{ width: `${Math.min(100, (totals.kcal / targets.kcal) * 100)}%` }} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Macro label="Protein" value={totals.p} target={targets.proteinG} color="#8b5cf6" />
          <Macro label="Carbs" value={totals.c} target={targets.carbsG} color="#f59e0b" />
          <Macro label="Fat" value={totals.f} target={targets.fatG} color="#0ea5e9" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label="7-day protein avg" value={`${weeklyProteinAvg} g`} sub={`target ${targets.proteinG} g/day`} />
          <Stat label="Outside eating window" value={outside} sub={profile.fasting.enabled ? `${profile.fasting.end}–${profile.fasting.start}` : 'fasting off'} />
        </div>
      </Card>

      <Card
        title="Meals"
        action={
          <button className="btn-primary py-1 text-xs" onClick={() => setPicker(true)}>
            + Log food
          </button>
        }
      >
        {data.meals.length === 0 ? (
          <p className="text-sm text-slate-500">Nothing logged on this day yet.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.meals.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <div className="w-14 text-xs text-slate-500">{formatHHMM12(m.time)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {m.foodName} {m.servings !== 1 && <span className="text-slate-500">× {m.servings}</span>}
                    {m.outsideFastingWindow && <span className="chip ml-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">outside window</span>}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {Math.round(m.kcal)} kcal · P {Math.round(m.proteinG)} · C {Math.round(m.carbsG)} · F {Math.round(m.fatG)}
                  </div>
                </div>
                <button className="text-xs text-rose-600" onClick={() => void removeMeal(m.id, m.date)}>
                  Remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.foods.length === 0 && <EmptyState emoji="🍛" title="Food database is empty" />}

      <FoodPicker open={picker} onClose={() => setPicker(false)} foods={data.foods} profile={profile} date={date} onCustom={() => { setPicker(false); setCustom(true); }} />
      <CustomFoodEditor open={custom} onClose={() => setCustom(false)} />
    </div>
  );
}

function Macro({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm font-semibold">
        {Math.round(value)} <span className="text-xs font-normal text-slate-500">/ {target} g</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / Math.max(1, target)) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

function FoodPicker({ open, onClose, foods, profile, date, onCustom }: { open: boolean; onClose: () => void; foods: FoodItem[]; profile: Profile; date: string; onCustom: () => void }) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [sel, setSel] = useState<FoodItem | null>(null);
  const [servings, setServings] = useState(1);
  const [time, setTime] = useState(nowHHMM());
  const vegOnly = profile.dietType === 'vegetarian' || profile.dietType === 'vegan' || profile.dietType === 'jain';
  const list = foods.filter((f) => {
    if (vegOnly && !f.vegetarian && !f.custom) return false;
    if (cat !== 'all' && f.category !== cat) return false;
    if (q && !`${f.name} ${f.nameLocal ?? ''} ${f.category}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const categories = ['all', ...new Set([...FOOD_CATEGORIES, ...foods.map((f) => f.category)])];
  const outside = profile.fasting.enabled && !isInEatingWindow(profile.fasting, time);

  const save = async (e: React.MouseEvent) => {
    if (!sel) return;
    const m: Omit<MealLog, 'id' | 'loggedAt' | 'outsideFastingWindow'> = {
      date,
      time,
      foodId: sel.id,
      foodName: sel.name,
      servings,
      kcal: sel.kcal * servings,
      proteinG: sel.proteinG * servings,
      carbsG: sel.carbsG * servings,
      fatG: sel.fatG * servings,
    };
    await logMeal(profile, m, { x: e.clientX, y: e.clientY });
    setSel(null);
    setServings(1);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Log food">
      {!sel ? (
        <>
          <input className="input" placeholder="Search (poha, bhakri, dal…)" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
            {categories.map((c) => (
              <button key={c} className={`chip shrink-0 ${cat === c ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`} onClick={() => setCat(c)}>
                {c === 'all' ? 'All' : c}
              </button>
            ))}
          </div>
          <ul className="mt-2 max-h-[50vh] divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
            {list.map((f) => (
              <li key={f.id}>
                <button className="flex w-full items-center justify-between py-2 text-left" onClick={() => setSel(f)}>
                  <div>
                    <div className="text-sm font-medium">
                      {f.name} {f.nameLocal && <span className="text-xs text-slate-400">{f.nameLocal}</span>}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {f.servingLabel} · {f.kcal} kcal · P {f.proteinG}g
                    </div>
                  </div>
                  {!f.vegetarian && <span className="chip bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">non-veg</span>}
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="py-6 text-center text-sm text-slate-500">No match.</li>}
          </ul>
          <button className="btn-ghost mt-3 w-full" onClick={onCustom}>
            + Add custom food
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <button className="text-xs text-brand-600" onClick={() => setSel(null)}>
            ← back to list
          </button>
          <div>
            <div className="font-semibold">{sel.name}</div>
            <div className="text-xs text-slate-500">
              {sel.servingLabel} · {sel.kcal} kcal · P {sel.proteinG} · C {sel.carbsG} · F {sel.fatG}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Servings">
              <div className="flex items-center gap-2">
                <button className="btn-ghost h-9 w-9 p-0" onClick={() => setServings(Math.max(0.25, servings - 0.5))}>
                  −
                </button>
                <input className="input text-center" type="number" step="0.25" min="0.25" value={servings} onChange={(e) => setServings(Number(e.target.value) || 1)} />
                <button className="btn-ghost h-9 w-9 p-0" onClick={() => setServings(servings + 0.5)}>
                  +
                </button>
              </div>
            </Field>
            <Field label="Time">
              <input type="time" className="input" value={time} onChange={(e) => e.target.value && setTime(e.target.value)} />
            </Field>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <b>{Math.round(sel.kcal * servings)} kcal</b> · P {Math.round(sel.proteinG * servings)} g · C {Math.round(sel.carbsG * servings)} g · F {Math.round(sel.fatG * servings)} g
            {outside && <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">⚠️ {time} is outside your eating window ({profile.fasting.end}–{profile.fasting.start}). It will be flagged.</div>}
          </div>
          <button className="btn-primary w-full" onClick={save}>
            Log meal
          </button>
        </div>
      )}
    </Modal>
  );
}

function CustomFoodEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState<FoodItem>({ id: '', name: '', category: 'Custom', servingLabel: '1 serving', servingGrams: 100, kcal: 0, proteinG: 0, carbsG: 0, fatG: 0, vegetarian: true, custom: true });
  const set = (p: Partial<FoodItem>) => setF({ ...f, ...p });
  const num = (k: keyof FoodItem) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [k]: Number(e.target.value) } as Partial<FoodItem>);
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Custom food"
      footer={
        <button
          className="btn-primary"
          onClick={async () => {
            if (!f.name.trim()) return toast('Name is required', 'error');
            await foodRepo.upsert({ ...f, id: newId('food'), name: f.name.trim() });
            notifyChange();
            toast('Food added', 'success');
            onClose();
          }}
        >
          Save
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label="Name">
            <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
          </Field>
        </div>
        <Field label="Category">
          <input className="input" value={f.category} onChange={(e) => set({ category: e.target.value })} />
        </Field>
        <Field label="Serving label">
          <input className="input" value={f.servingLabel} onChange={(e) => set({ servingLabel: e.target.value })} />
        </Field>
        <Field label="kcal">
          <input className="input" type="number" value={f.kcal} onChange={num('kcal')} />
        </Field>
        <Field label="Protein (g)">
          <input className="input" type="number" value={f.proteinG} onChange={num('proteinG')} />
        </Field>
        <Field label="Carbs (g)">
          <input className="input" type="number" value={f.carbsG} onChange={num('carbsG')} />
        </Field>
        <Field label="Fat (g)">
          <input className="input" type="number" value={f.fatG} onChange={num('fatG')} />
        </Field>
        <label className="col-span-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={f.vegetarian} onChange={(e) => set({ vegetarian: e.target.checked })} /> Vegetarian
        </label>
      </div>
    </Modal>
  );
}
