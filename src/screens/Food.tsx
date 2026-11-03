import { useEffect, useMemo, useState } from 'react';
import type { FoodItem, MealLog, Profile } from '../types';
import { foodRepo, mealRepo } from '../db/repos';
import { notifyChange, toast, useAsyncData } from '../store/appStore';
import { Card, EmptyState, ErrorCard, Field, Modal, Spinner, Stat, eventAnchor } from '../components/ui';
import { addDays, formatDateShort, formatTime, nowHHMM, todayISO } from '../utils/dates';
import { nutritionTargets } from '../utils/nutrition';
import { isInEatingWindow } from '../utils/fasting';
import { newId } from '../utils/ids';
import { logMeal, removeMeal } from '../services/actions';
import { FOOD_CATEGORIES } from '../data/indianFoods';
import { isVegetarianDiet } from '../utils/nutrition';
import { t } from '../i18n';

const SERVINGS_MIN = 0.25;
const SERVINGS_MAX = 20;
const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));

export function Food({ profile }: { profile: Profile }) {
  const [date, setDate] = useState(todayISO());
  const [picker, setPicker] = useState(false);
  const [custom, setCustom] = useState(false);
  const targets = useMemo(() => nutritionTargets(profile), [profile]);
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [foods, meals, week] = await Promise.all([foodRepo.all(), mealRepo.on(date), mealRepo.between(addDays(date, -6), date)]);
    return { foods, meals, week };
  }, [date]);
  if (!data) {
    if (error) return <ErrorCard message={error} onRetry={reload} />;
    if (loading) return <Spinner />;
    return null;
  }

  const today = todayISO();
  const totals = data.meals.reduce((a, m) => ({ kcal: a.kcal + m.kcal, p: a.p + m.proteinG, c: a.c + m.carbsG, f: a.f + m.fatG }), {
    kcal: 0,
    p: 0,
    c: 0,
    f: 0,
  });
  const weekDays = new Set(data.week.map((m) => m.date)).size;
  const weeklyProteinAvg = weekDays ? Math.round(data.week.reduce((a, m) => a + m.proteinG, 0) / weekDays) : 0;
  const outside = data.meals.filter((m) => m.outsideFastingWindow).length;
  const title = `${t('food.totals', { kcal: targets.kcal })}${targets.source === 'computed' ? ` ${t('food.autoTag')}` : ''}`;

  return (
    <div className="mx-auto max-w-lg space-y-4 md:max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{t('food.title')}</h1>
        <div className="flex items-center gap-1">
          <button className="btn-ghost w-12 p-0" onClick={() => setDate(addDays(date, -1))} aria-label={t('food.prevDay')}>
            ‹
          </button>
          <span className="w-16 text-center text-sm font-medium" aria-live="polite">
            {date === today ? t('common.today') : formatDateShort(date)}
          </span>
          <button className="btn-ghost w-12 p-0" onClick={() => setDate(addDays(date, 1))} disabled={date >= today} aria-label={t('food.nextDay')}>
            ›
          </button>
        </div>
      </header>
      {date !== today && (
        <button className="btn-ghost w-full" onClick={() => setDate(today)}>
          {t('food.backToToday')}
        </button>
      )}

      <Card title={title}>
        <div className="mb-3">
          <div className="flex items-end justify-between">
            <div className="text-3xl font-bold">
              {Math.round(totals.kcal)} <span className="text-sm font-normal text-slate-500">{t('food.kcal')}</span>
            </div>
            <div className={`text-sm font-medium ${totals.kcal > targets.kcal ? 'text-rose-600' : 'text-brand-600'}`}>
              {totals.kcal > targets.kcal
                ? t('food.over', { n: Math.round(totals.kcal - targets.kcal) })
                : t('food.left', { n: Math.round(targets.kcal - totals.kcal) })}
            </div>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" aria-hidden="true">
            <div
              className={`h-full rounded-full ${totals.kcal > targets.kcal ? 'bg-rose-500' : 'bg-brand-500'}`}
              style={{ width: `${Math.min(100, (totals.kcal / targets.kcal) * 100)}%` }}
            />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Macro label={t('food.protein')} value={totals.p} target={targets.proteinG} color="#8b5cf6" />
          <Macro label={t('food.carbs')} value={totals.c} target={targets.carbsG} color="#f59e0b" />
          <Macro label={t('food.fat')} value={totals.f} target={targets.fatG} color="#0ea5e9" />
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Stat label={t('food.proteinAvg')} value={`${weeklyProteinAvg} ${t('food.grams')}`} sub={t('food.proteinTarget', { n: targets.proteinG })} />
          <Stat
            label={t('food.outsideWindow')}
            value={outside}
            sub={
              profile.fasting.enabled
                ? t('food.windowRange', { start: formatTime(profile.fasting.eatStart), end: formatTime(profile.fasting.eatEnd) })
                : t('food.fastingOff')
            }
          />
        </div>
      </Card>

      <button className="btn-primary w-full" onClick={() => setPicker(true)}>
        {t('food.logFood')}
      </button>

      <Card
        title={t('food.meals')}
        action={
          <button className="min-h-[44px] px-2 text-xs font-medium text-brand-600" onClick={() => setPicker(true)}>
            {t('food.logFood')}
          </button>
        }
      >
        {data.meals.length === 0 ? (
          <p className="text-sm text-slate-500">{t('food.nothingLogged')}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.meals.map((m) => (
              <li key={m.id} className="flex items-center gap-3 py-2">
                <div className="w-16 text-xs text-slate-500">{formatTime(m.time)}</div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {m.foodName} {m.servings !== 1 && <span className="text-slate-500">{t('food.servingsMult', { n: m.servings })}</span>}
                    {m.outsideFastingWindow && (
                      <span className="chip ml-1 bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200">{t('food.outsideTag')}</span>
                    )}
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {t('food.macroLine', { kcal: Math.round(m.kcal), p: Math.round(m.proteinG), c: Math.round(m.carbsG), f: Math.round(m.fatG) })}
                  </div>
                </div>
                <button
                  className="min-h-[44px] px-2 text-xs text-rose-600"
                  aria-label={`${t('common.remove')}: ${m.foodName}`}
                  onClick={() => void removeMeal(m.id, m.date).catch((e) => toast(t('common.actionFailed', { msg: errMsg(e) }), 'error'))}
                >
                  {t('common.remove')}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data.foods.length === 0 && <EmptyState emoji="🍛" title={t('food.noMatch')} />}

      <FoodPicker
        open={picker}
        onClose={() => setPicker(false)}
        foods={data.foods}
        profile={profile}
        date={date}
        onCustom={() => {
          setPicker(false);
          setCustom(true);
        }}
      />
      <CustomFoodEditor open={custom} onClose={() => setCustom(false)} />
    </div>
  );
}

function Macro({ label, value, target, color }: { label: string; value: number; target: number; color: string }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2 dark:bg-slate-800/60">
      <div className="text-[11px] text-slate-500">{label}</div>
      <div className="text-sm font-semibold">
        {Math.round(value)} <span className="text-xs font-normal text-slate-500">{t('food.perTarget', { n: target })}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700" aria-hidden="true">
        <div className="h-full rounded-full" style={{ width: `${Math.min(100, (value / Math.max(1, target)) * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

const clampServings = (n: number): number => Math.min(SERVINGS_MAX, Math.max(SERVINGS_MIN, Math.round(n * 4) / 4));

function FoodPicker({
  open,
  onClose,
  foods,
  profile,
  date,
  onCustom,
}: {
  open: boolean;
  onClose: () => void;
  foods: FoodItem[];
  profile: Profile;
  date: string;
  onCustom: () => void;
}) {
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<string>('all');
  const [sel, setSel] = useState<FoodItem | null>(null);
  const [servingsStr, setServingsStr] = useState('1');
  const [time, setTime] = useState(nowHHMM());
  const [saving, setSaving] = useState(false);

  // Fresh state on every open: the time is "now", not whenever the tab was first mounted.
  useEffect(() => {
    if (!open) return;
    setQ('');
    setCat('all');
    setSel(null);
    setServingsStr('1');
    setTime(nowHHMM());
    setSaving(false);
  }, [open]);

  const parsed = Number(servingsStr);
  const servingsValid = servingsStr.trim() !== '' && Number.isFinite(parsed) && parsed >= SERVINGS_MIN && parsed <= SERVINGS_MAX;
  const servings = servingsValid ? parsed : clampServings(Number.isFinite(parsed) && parsed > 0 ? parsed : 1);
  const servingsError = servingsValid ? null : t('food.servingsRange', { min: SERVINGS_MIN, max: SERVINGS_MAX });

  const vegOnly = isVegetarianDiet(profile.user.dietType);
  const typical = [
    ...new Set([
      ...(profile.typicalMeals?.breakfast ?? []),
      ...(profile.typicalMeals?.lunch ?? []),
      ...(profile.typicalMeals?.dinner ?? []),
      ...(profile.typicalMeals?.snacks ?? []),
    ]),
  ];
  const typicalFoods = typical
    .map((name) => foods.find((f) => f.name.toLowerCase().includes(name.toLowerCase()) || name.toLowerCase().includes(f.name.toLowerCase().split(' ')[0])))
    .filter((f): f is FoodItem => !!f)
    .filter((f, i, arr) => arr.indexOf(f) === i);
  const list = foods.filter((f) => {
    if (vegOnly && !f.vegetarian && !f.custom) return false;
    if (cat !== 'all' && f.category !== cat) return false;
    if (q && !`${f.name} ${f.nameLocal ?? ''} ${f.category}`.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });
  const categories = ['all', ...new Set([...FOOD_CATEGORIES, ...foods.map((f) => f.category)])];
  const outside = profile.fasting.enabled && !isInEatingWindow(profile.fasting, time);

  const save = async (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!sel || saving) return;
    if (!servingsValid) {
      toast(servingsError ?? '', 'error');
      return;
    }
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
    setSaving(true);
    try {
      await logMeal(profile, m, eventAnchor(e));
      setSel(null);
      setServingsStr('1');
      onClose();
    } catch (err) {
      toast(t('food.logFailed', { msg: errMsg(err) }), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('food.logFoodTitle')}>
      {!sel ? (
        <>
          <input className="input" placeholder={t('food.search')} aria-label={t('food.search')} value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          {!q && typicalFoods.length > 0 && (
            <div className="mt-2">
              <div className="label">{t('food.typical')}</div>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {typicalFoods.map((f) => (
                  <button
                    key={f.id}
                    className="chip min-h-[44px] shrink-0 bg-brand-50 px-3 text-brand-700 dark:bg-brand-900/40 dark:text-brand-200"
                    onClick={() => setSel(f)}
                  >
                    {f.name}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="mt-2 flex gap-1 overflow-x-auto pb-1" role="group" aria-label={t('food.category')}>
            {categories.map((c) => (
              <button
                key={c}
                aria-pressed={cat === c}
                className={`chip min-h-[44px] min-w-[44px] shrink-0 px-3 ${cat === c ? 'bg-brand-600 text-white' : 'bg-slate-100 dark:bg-slate-800'}`}
                onClick={() => setCat(c)}
              >
                {c === 'all' ? t('food.all') : c}
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
                    <div className="text-[11px] text-slate-500">{t('food.pickerLine', { serving: f.servingLabel, kcal: f.kcal, p: f.proteinG })}</div>
                  </div>
                  {!f.vegetarian && <span className="chip bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200">{t('food.nonVeg')}</span>}
                </button>
              </li>
            ))}
            {list.length === 0 && <li className="py-6 text-center text-sm text-slate-500">{t('food.noMatch')}</li>}
          </ul>
          <button className="btn-ghost mt-3 w-full" onClick={onCustom}>
            {t('food.addCustom')}
          </button>
        </>
      ) : (
        <div className="space-y-3">
          <button className="min-h-[44px] text-xs text-brand-600" onClick={() => setSel(null)}>
            {t('food.backToList')}
          </button>
          <div>
            <div className="font-semibold">{sel.name}</div>
            <div className="text-xs text-slate-500">
              {sel.servingLabel} · {t('food.macroLine', { kcal: sel.kcal, p: sel.proteinG, c: sel.carbsG, f: sel.fatG })}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('food.servings')} error={servingsError}>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-ghost w-12 p-0"
                  aria-label={t('food.servingsLess')}
                  disabled={servings <= SERVINGS_MIN}
                  onClick={() => setServingsStr(String(clampServings(servings - 0.5)))}
                >
                  −
                </button>
                <input
                  className="input text-center"
                  type="number"
                  inputMode="decimal"
                  step="0.25"
                  min={SERVINGS_MIN}
                  max={SERVINGS_MAX}
                  value={servingsStr}
                  aria-label={t('food.servings')}
                  aria-invalid={!servingsValid}
                  onChange={(e) => setServingsStr(e.target.value)}
                  onBlur={() => setServingsStr(String(clampServings(Number(servingsStr) || 1)))}
                />
                <button
                  type="button"
                  className="btn-ghost w-12 p-0"
                  aria-label={t('food.servingsMore')}
                  disabled={servings >= SERVINGS_MAX}
                  onClick={() => setServingsStr(String(clampServings(servings + 0.5)))}
                >
                  +
                </button>
              </div>
            </Field>
            <Field label={t('food.time')}>
              <input type="time" className="input" value={time} aria-label={t('food.time')} onChange={(e) => e.target.value && setTime(e.target.value)} />
            </Field>
          </div>
          <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
            <b>
              {Math.round(sel.kcal * servings)} {t('food.kcal')}
            </b>{' '}
            ·{' '}
            {t('food.macroRest', {
              p: Math.round(sel.proteinG * servings),
              c: Math.round(sel.carbsG * servings),
              f: Math.round(sel.fatG * servings),
            })}
            {outside && (
              <div className="mt-1 text-xs text-amber-700 dark:text-amber-300">
                {t('food.outsideWarn', { time: formatTime(time), start: formatTime(profile.fasting.eatStart), end: formatTime(profile.fasting.eatEnd) })}
              </div>
            )}
          </div>
          <button className="btn-primary w-full" onClick={save} disabled={saving || !servingsValid}>
            {saving ? t('common.saving') : t('food.logMeal')}
          </button>
        </div>
      )}
    </Modal>
  );
}

type MacroKey = 'kcal' | 'proteinG' | 'carbsG' | 'fatG';

const blankFood = (): FoodItem => ({
  id: '',
  name: '',
  category: 'Custom',
  servingLabel: '1 serving',
  servingGrams: 100,
  kcal: 0,
  proteinG: 0,
  carbsG: 0,
  fatG: 0,
  vegetarian: true,
  custom: true,
});

function CustomFoodEditor({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [f, setF] = useState<FoodItem>(blankFood);
  const [nums, setNums] = useState<Record<MacroKey, string>>({ kcal: '0', proteinG: '0', carbsG: '0', fatG: '0' });
  const [saving, setSaving] = useState(false);
  const reset = () => {
    setF(blankFood());
    setNums({ kcal: '0', proteinG: '0', carbsG: '0', fatG: '0' });
  };
  useEffect(() => {
    if (open) reset();
  }, [open]);
  const set = (p: Partial<FoodItem>) => setF((cur) => ({ ...cur, ...p }));
  const numError = (k: MacroKey): string | null => {
    const v = nums[k].trim();
    if (v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return t('form.invalidNumber');
    if (n < 0) return t('food.macroNegative');
    return null;
  };
  const num = (k: MacroKey) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setNums((cur) => ({ ...cur, [k]: e.target.value }));
    const n = Number(e.target.value);
    set({ [k]: Number.isFinite(n) ? Math.max(0, n) : 0 });
  };
  const close = () => {
    reset();
    onClose();
  };
  const anyError = (['kcal', 'proteinG', 'carbsG', 'fatG'] as MacroKey[]).some((k) => numError(k));
  return (
    <Modal
      open={open}
      onClose={close}
      title={t('food.customFood')}
      footer={
        <button
          className="btn-primary"
          disabled={saving || anyError}
          onClick={async () => {
            if (!f.name.trim()) return toast(t('food.nameRequired'), 'error');
            setSaving(true);
            try {
              await foodRepo.upsert({
                ...f,
                id: newId('food'),
                name: f.name.trim(),
                kcal: Math.max(0, f.kcal),
                proteinG: Math.max(0, f.proteinG),
                carbsG: Math.max(0, f.carbsG),
                fatG: Math.max(0, f.fatG),
              });
              notifyChange();
              toast(t('food.foodAdded'), 'success');
              close();
            } catch (e) {
              toast(t('common.actionFailed', { msg: errMsg(e) }), 'error');
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? t('common.saving') : t('common.save')}
        </button>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <Field label={t('habits.name')}>
            <input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} autoFocus />
          </Field>
        </div>
        <Field label={t('food.category')}>
          <input className="input" value={f.category} onChange={(e) => set({ category: e.target.value })} />
        </Field>
        <Field label={t('food.servingLabel')}>
          <input className="input" value={f.servingLabel} onChange={(e) => set({ servingLabel: e.target.value })} />
        </Field>
        <Field label={t('food.kcal')} error={numError('kcal')}>
          <input className="input" type="number" min={0} inputMode="decimal" value={nums.kcal} aria-invalid={!!numError('kcal')} onChange={num('kcal')} />
        </Field>
        <Field label={t('food.gramsLabel', { label: t('food.protein') })} error={numError('proteinG')}>
          <input className="input" type="number" min={0} inputMode="decimal" value={nums.proteinG} aria-invalid={!!numError('proteinG')} onChange={num('proteinG')} />
        </Field>
        <Field label={t('food.gramsLabel', { label: t('food.carbs') })} error={numError('carbsG')}>
          <input className="input" type="number" min={0} inputMode="decimal" value={nums.carbsG} aria-invalid={!!numError('carbsG')} onChange={num('carbsG')} />
        </Field>
        <Field label={t('food.gramsLabel', { label: t('food.fat') })} error={numError('fatG')}>
          <input className="input" type="number" min={0} inputMode="decimal" value={nums.fatG} aria-invalid={!!numError('fatG')} onChange={num('fatG')} />
        </Field>
        <label className="col-span-2 flex min-h-[44px] items-center gap-2 text-sm">
          <input type="checkbox" checked={f.vegetarian} onChange={(e) => set({ vegetarian: e.target.checked })} /> {t('food.vegetarian')}
        </label>
      </div>
    </Modal>
  );
}
