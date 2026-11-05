import { useRef, useState } from 'react';
import type { ActivityLevel, DayName, DietType, HeightUnit, Profile, ProfileHabit, Supplement, WeightUnit } from '../types';
import { Card, Field, TimeInput, Toggle, WeekdayPicker } from './ui';
import { newId } from '../utils/ids';
import { cmToFtIn, displayWeight, ftInToCm, parseWeightInput } from '../utils/units';
import { dayNamesToWeekdays } from '../utils/dates';
import { t } from '../i18n';

const ACTIVITY: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const DIETS: DietType[] = ['veg', 'egg', 'non-veg', 'vegan', 'jain', 'other'];
const DAY_NAMES: DayName[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

const LIMITS = {
  age: { min: 10, max: 100 },
  heightCm: { min: 100, max: 250 },
  weightKg: { min: 20, max: 400 },
  waterMl: { min: 500, max: 10000 },
};

type NumKey = 'age' | 'heightCm' | 'ft' | 'inch' | 'currentWeight' | 'targetWeight' | 'waterMl';

function parseNum(s: string): number | null {
  const v = s.trim().replace(',', '.');
  if (v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Profile editor. Numeric fields keep string state so they can be cleared while typing; a value is only
 * written to the profile when it parses and is in range, and an inline message says what is wrong otherwise.
 */
export function ProfileForm({
  value,
  onChange,
  heightUnit,
  onHeightUnit,
  weightUnit = 'kg',
}: {
  value: Profile;
  onChange: (p: Profile) => void;
  heightUnit: HeightUnit;
  onHeightUnit: (u: HeightUnit) => void;
  weightUnit?: WeightUnit;
}) {
  const p = value;
  const set = (patch: Partial<Profile>) => onChange({ ...p, ...patch });
  const setUser = (patch: Partial<Profile['user']>) => set({ user: { ...p.user, ...patch } });
  const unitLabel = t(`common.${weightUnit}`);
  const wMin = displayWeight(LIMITS.weightKg.min, weightUnit);
  const wMax = displayWeight(LIMITS.weightKg.max, weightUnit);

  const [strs, setStrs] = useState<Record<NumKey, string>>(() => {
    const { ft, inch } = cmToFtIn(p.user.heightCm);
    return {
      age: String(p.user.age),
      heightCm: String(p.user.heightCm),
      ft: String(ft),
      inch: String(inch),
      currentWeight: String(displayWeight(p.user.currentWeightKg, weightUnit)),
      targetWeight: String(displayWeight(p.user.targetWeightKg, weightUnit)),
      waterMl: String(p.water.targetMl),
    };
  });
  const setStr = (k: NumKey, v: string) => setStrs((s) => ({ ...s, [k]: v }));

  const errorFor = (k: NumKey): string | null => {
    const n = parseNum(strs[k]);
    if (n === null) return strs[k].trim() === '' ? t('common.required') : t('form.invalidNumber');
    switch (k) {
      case 'age':
        return n < LIMITS.age.min || n > LIMITS.age.max ? t('form.ageRange', LIMITS.age) : null;
      case 'heightCm':
        return n < LIMITS.heightCm.min || n > LIMITS.heightCm.max ? t('form.heightRange', LIMITS.heightCm) : null;
      case 'ft':
      case 'inch': {
        const cm = ftInToCm(parseNum(strs.ft) ?? 0, parseNum(strs.inch) ?? 0);
        return cm < LIMITS.heightCm.min || cm > LIMITS.heightCm.max ? t('form.ftInRange', { min: '3′ 4″', max: '8′ 2″' }) : null;
      }
      case 'currentWeight':
      case 'targetWeight': {
        const kg = parseWeightInput(n, weightUnit);
        return kg < LIMITS.weightKg.min || kg > LIMITS.weightKg.max ? t('form.weightRange', { min: wMin, max: wMax, unit: unitLabel }) : null;
      }
      case 'waterMl':
        return n < LIMITS.waterMl.min || n > LIMITS.waterMl.max ? t('form.waterRange', LIMITS.waterMl) : null;
    }
  };

  const numInput = (k: NumKey, apply: (n: number) => void, extra: React.InputHTMLAttributes<HTMLInputElement> = {}) => (
    <input
      className="input"
      type="number"
      inputMode="decimal"
      value={strs[k]}
      aria-invalid={!!errorFor(k)}
      onChange={(e) => {
        setStr(k, e.target.value);
        const n = parseNum(e.target.value);
        if (n !== null) apply(n);
      }}
      {...extra}
    />
  );

  const updateSupplement = (id: string, patch: Partial<Supplement>) => set({ supplements: p.supplements.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const updateHabit = (i: number, patch: Partial<ProfileHabit>) => set({ habits: p.habits.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) });

  // Stable keys for habit rows (ProfileHabit has no id): one generated key per row position, kept in sync on add/remove.
  const habitKeys = useRef<string[]>([]);
  while (habitKeys.current.length < p.habits.length) habitKeys.current.push(newId('row'));
  if (habitKeys.current.length > p.habits.length) habitKeys.current.length = p.habits.length;
  const removeHabit = (i: number) => {
    habitKeys.current.splice(i, 1);
    set({ habits: p.habits.filter((_, idx) => idx !== i) });
  };

  return (
    <div className="space-y-4">
      <Card title={t('form.about')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label={t('form.name')}>
              <input className="input" value={p.user.name} onChange={(e) => setUser({ name: e.target.value })} placeholder={t('form.name')} />
            </Field>
          </div>
          <Field label={t('form.age')} error={errorFor('age')}>
            {numInput(
              'age',
              (n) => {
                if (n >= LIMITS.age.min && n <= LIMITS.age.max) setUser({ age: Math.round(n) });
              },
              { min: LIMITS.age.min, max: LIMITS.age.max, inputMode: 'numeric' },
            )}
          </Field>
          <Field label={t('form.sex')}>
            <select className="input" value={p.user.sex ?? 'other'} onChange={(e) => setUser({ sex: e.target.value as Profile['user']['sex'] })}>
              <option value="male">{t('form.male')}</option>
              <option value="female">{t('form.female')}</option>
              <option value="other">{t('form.noSay')}</option>
            </select>
          </Field>
          <Field label={t('form.city')}>
            <input className="input" value={p.user.city ?? ''} onChange={(e) => setUser({ city: e.target.value })} />
          </Field>
          <Field label={t('form.cuisine')}>
            <input className="input" value={p.user.cuisine ?? ''} onChange={(e) => setUser({ cuisine: e.target.value })} />
          </Field>
        </div>
      </Card>

      <Card title={t('form.body')}>
        <div className="grid grid-cols-2 gap-3">
          <Field label={t('profile.heightUnit')}>
            <select
              className="input"
              value={heightUnit}
              onChange={(e) => {
                const u = e.target.value as HeightUnit;
                const { ft, inch } = cmToFtIn(p.user.heightCm);
                setStrs((s) => ({ ...s, heightCm: String(Math.round(p.user.heightCm)), ft: String(ft), inch: String(inch) }));
                onHeightUnit(u);
              }}
            >
              <option value="cm">cm</option>
              <option value="ft_in">ft / in</option>
            </select>
          </Field>
          {heightUnit === 'cm' ? (
            <Field label={t('form.heightCm')} error={errorFor('heightCm')}>
              {numInput(
                'heightCm',
                (n) => {
                  if (n >= LIMITS.heightCm.min && n <= LIMITS.heightCm.max) setUser({ heightCm: n });
                },
                { min: LIMITS.heightCm.min, max: LIMITS.heightCm.max },
              )}
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('form.ft')} error={errorFor('ft')}>
                {numInput(
                  'ft',
                  (n) => {
                    const cm = ftInToCm(n, parseNum(strs.inch) ?? 0);
                    if (cm >= LIMITS.heightCm.min && cm <= LIMITS.heightCm.max) setUser({ heightCm: cm });
                  },
                  { min: 3, max: 8, inputMode: 'numeric' },
                )}
              </Field>
              <Field label={t('form.in')} error={errorFor('inch')}>
                {numInput(
                  'inch',
                  (n) => {
                    const cm = ftInToCm(parseNum(strs.ft) ?? 0, n);
                    if (cm >= LIMITS.heightCm.min && cm <= LIMITS.heightCm.max) setUser({ heightCm: cm });
                  },
                  { min: 0, max: 11, inputMode: 'numeric' },
                )}
              </Field>
            </div>
          )}
          <Field label={t('form.currentWeightUnit', { unit: unitLabel })} error={errorFor('currentWeight')}>
            {numInput(
              'currentWeight',
              (n) => {
                const kg = parseWeightInput(n, weightUnit);
                if (kg >= LIMITS.weightKg.min && kg <= LIMITS.weightKg.max) setUser({ currentWeightKg: Math.round(kg * 10) / 10 });
              },
              { step: '0.1', min: wMin, max: wMax },
            )}
          </Field>
          <Field label={t('form.targetWeightUnit', { unit: unitLabel })} error={errorFor('targetWeight')}>
            {numInput(
              'targetWeight',
              (n) => {
                const kg = parseWeightInput(n, weightUnit);
                if (kg >= LIMITS.weightKg.min && kg <= LIMITS.weightKg.max) setUser({ targetWeightKg: Math.round(kg * 10) / 10 });
              },
              { step: '0.1', min: wMin, max: wMax },
            )}
          </Field>
          <div className="col-span-2">
            <Field label={t('form.activity')}>
              <select className="input" value={p.user.activityLevel} onChange={(e) => setUser({ activityLevel: e.target.value as ActivityLevel })}>
                {ACTIVITY.map((a) => (
                  <option key={a} value={a}>
                    {t(`form.${a}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label={t('form.diet')}>
              <select className="input" value={p.user.dietType} onChange={(e) => setUser({ dietType: e.target.value as DietType })}>
                {DIETS.map((d) => (
                  <option key={d} value={d}>
                    {t(`form.${d}`)}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Card>

      <Card title={t('form.rhythm')}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t('form.fasting')}</span>
            <Toggle checked={p.fasting.enabled} onChange={(v) => set({ fasting: { ...p.fasting, enabled: v } })} label={t('form.fasting')} />
          </div>
          {p.fasting.enabled && (
            <div className="grid grid-cols-2 gap-3">
              <Field label={t('form.eatStart')}>
                <TimeInput value={p.fasting.eatStart} onChange={(v) => set({ fasting: { ...p.fasting, eatStart: v } })} />
              </Field>
              <Field label={t('form.eatEnd')}>
                <TimeInput value={p.fasting.eatEnd} onChange={(v) => set({ fasting: { ...p.fasting, eatEnd: v } })} />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('form.bedtime')}>
              <TimeInput value={p.sleep.bedtime} onChange={(v) => set({ sleep: { ...p.sleep, bedtime: v } })} />
            </Field>
            <Field label={t('form.wake')}>
              <TimeInput value={p.sleep.wake} onChange={(v) => set({ sleep: { ...p.sleep, wake: v } })} />
            </Field>
          </div>
          <Field label={t('form.waterTarget')} error={errorFor('waterMl')}>
            {numInput(
              'waterMl',
              (n) => {
                if (n >= LIMITS.waterMl.min && n <= LIMITS.waterMl.max) set({ water: { targetMl: Math.round(n) } });
              },
              { step: 250, min: LIMITS.waterMl.min, max: LIMITS.waterMl.max, inputMode: 'numeric' },
            )}
          </Field>
        </div>
      </Card>

      <Card title={t('form.workout')}>
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">{t('form.workoutEnabled')}</span>
            <Toggle checked={p.workout.enabled} onChange={(v) => set({ workout: { ...p.workout, enabled: v } })} label={t('form.workoutEnabled')} />
          </div>
          {p.workout.enabled && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('form.start')}>
                  <TimeInput value={p.workout.start} onChange={(v) => set({ workout: { ...p.workout, start: v } })} />
                </Field>
                <Field label={t('form.end')}>
                  <TimeInput value={p.workout.end} onChange={(v) => set({ workout: { ...p.workout, end: v } })} />
                </Field>
              </div>
              <Field label={t('form.days')}>
                <WeekdayPicker
                  value={dayNamesToWeekdays(p.workout.days)}
                  onChange={(wd) => set({ workout: { ...p.workout, days: wd.map((w) => DAY_NAMES[w - 1]) } })}
                />
              </Field>
              <Field label={t('form.location')}>
                <input className="input" value={p.workout.location ?? ''} onChange={(e) => set({ workout: { ...p.workout, location: e.target.value } })} />
              </Field>
              <div className="flex items-center justify-between">
                <span className="text-sm">{t('form.workoutAlarm')}</span>
                <Toggle checked={p.workout.alarm} onChange={(v) => set({ workout: { ...p.workout, alarm: v } })} label={t('form.workoutAlarm')} />
              </div>
            </>
          )}
        </div>
      </Card>

      <Card
        title={t('form.supplements')}
        action={
          <button
            className="btn-ghost py-1 text-xs"
            onClick={() => set({ supplements: [...p.supplements, { id: newId('sup'), name: '', dose: '', time: '08:00', alarm: true }] })}
          >
            {t('form.add')}
          </button>
        }
      >
        {p.supplements.length === 0 && <p className="text-sm text-slate-500">{t('form.noSupplements')}</p>}
        <div className="space-y-3">
          {p.supplements.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <input
                    className="input"
                    placeholder={t('form.supplementName')}
                    aria-label={t('form.supplementName')}
                    value={s.name}
                    onChange={(e) => updateSupplement(s.id, { name: e.target.value })}
                  />
                </div>
                <input
                  className="input"
                  placeholder={t('form.dose')}
                  aria-label={t('form.dose')}
                  value={s.dose}
                  onChange={(e) => updateSupplement(s.id, { dose: e.target.value })}
                />
                <TimeInput value={s.time} onChange={(v) => updateSupplement(s.id, { time: v })} label={t('food.time')} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span className="flex items-center gap-2 text-sm">
                  <Toggle checked={s.alarm} onChange={(v) => updateSupplement(s.id, { alarm: v })} label={t('form.alarm')} /> {t('form.alarm')}
                </span>
                <button className="min-h-[44px] px-2 text-xs text-rose-600" onClick={() => set({ supplements: p.supplements.filter((x) => x.id !== s.id) })}>
                  {t('common.remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card
        title={t('form.habits')}
        action={
          <button className="btn-ghost py-1 text-xs" onClick={() => set({ habits: [...p.habits, { name: '', schedule: 'daily' }] })}>
            {t('form.add')}
          </button>
        }
      >
        {p.habits.length === 0 && <p className="text-sm text-slate-500">{t('form.noHabits')}</p>}
        <div className="space-y-3">
          {p.habits.map((h, i) => (
            <div key={habitKeys.current[i]} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <input
                className="input"
                placeholder={t('form.habitName')}
                aria-label={t('form.habitName')}
                value={h.name}
                onChange={(e) => updateHabit(i, { name: e.target.value })}
              />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select
                  className="input"
                  aria-label={t('habits.schedule')}
                  value={h.schedule}
                  onChange={(e) => updateHabit(i, { schedule: e.target.value as ProfileHabit['schedule'] })}
                >
                  <option value="daily">{t('form.daily')}</option>
                  <option value="weekly">{t('form.weekly')}</option>
                  <option value="weekdays">{t('form.weekdays')}</option>
                </select>
                {h.schedule === 'weekly' && (
                  <input
                    className="input"
                    type="number"
                    min={1}
                    max={7}
                    aria-label={t('form.weekly')}
                    value={h.targetPerWeek ?? 1}
                    onChange={(e) => updateHabit(i, { targetPerWeek: Math.min(7, Math.max(1, Number(e.target.value) || 1)) })}
                  />
                )}
                {h.schedule === 'weekdays' && (
                  <div className="col-span-2">
                    <WeekdayPicker value={dayNamesToWeekdays(h.days ?? [])} onChange={(wd) => updateHabit(i, { days: wd.map((w) => DAY_NAMES[w - 1]) })} />
                  </div>
                )}
              </div>
              <div className="mt-2 flex justify-end">
                <button className="min-h-[44px] px-2 text-xs text-rose-600" onClick={() => removeHabit(i)}>
                  {t('common.remove')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title={t('form.goals')}>
        <div className="space-y-3">
          <Field label={t('form.appearanceGoals')} hint={t('form.appearanceHint')}>
            <textarea className="input min-h-[80px]" value={p.user.appearanceGoals} onChange={(e) => setUser({ appearanceGoals: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t('form.kcalTarget')}>
              <input
                className="input"
                type="number"
                min={0}
                value={p.nutritionTargets?.kcal ?? ''}
                placeholder={t('common.auto')}
                onChange={(e) => set({ nutritionTargets: { ...p.nutritionTargets, kcal: e.target.value ? Math.max(0, Number(e.target.value)) : undefined } })}
              />
            </Field>
            <Field label={t('form.proteinTarget')}>
              <input
                className="input"
                type="number"
                min={0}
                value={p.nutritionTargets?.proteinG ?? ''}
                placeholder={t('common.auto')}
                onChange={(e) =>
                  set({ nutritionTargets: { ...p.nutritionTargets, proteinG: e.target.value ? Math.max(0, Number(e.target.value)) : undefined } })
                }
              />
            </Field>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">{t('form.photos')}</div>
              <p className="text-xs text-slate-500">{t('form.photosHint')}</p>
            </div>
            <Toggle checked={p.privacy.photoConsent} onChange={(v) => set({ privacy: { ...p.privacy, photoConsent: v } })} label={t('form.photos')} />
          </div>
        </div>
      </Card>
    </div>
  );
}
