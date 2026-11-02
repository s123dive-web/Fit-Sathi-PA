import { useState } from 'react';
import type { ActivityLevel, DayName, DietType, HeightUnit, Profile, ProfileHabit, Supplement } from '../types';
import { Card, Field, TimeInput, Toggle, WeekdayPicker } from './ui';
import { newId } from '../utils/ids';
import { cmToFtIn, ftInToCm } from '../utils/units';
import { dayNamesToWeekdays } from '../utils/dates';
import { t } from '../i18n';

const ACTIVITY: ActivityLevel[] = ['sedentary', 'light', 'moderate', 'active', 'very_active'];
const DIETS: DietType[] = ['veg', 'egg', 'non-veg', 'vegan', 'jain', 'other'];
const DAY_NAMES: DayName[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function ProfileForm({
  value,
  onChange,
  heightUnit,
  onHeightUnit,
}: {
  value: Profile;
  onChange: (p: Profile) => void;
  heightUnit: HeightUnit;
  onHeightUnit: (u: HeightUnit) => void;
}) {
  const p = value;
  const set = (patch: Partial<Profile>) => onChange({ ...p, ...patch });
  const setUser = (patch: Partial<Profile['user']>) => set({ user: { ...p.user, ...patch } });
  const [ftIn, setFtIn] = useState(() => cmToFtIn(p.user.heightCm));

  const updateSupplement = (id: string, patch: Partial<Supplement>) => set({ supplements: p.supplements.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  const updateHabit = (i: number, patch: Partial<ProfileHabit>) => set({ habits: p.habits.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) });

  return (
    <div className="space-y-4">
      <Card title={t('form.about')}>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label={t('form.name')}>
              <input className="input" value={p.user.name} onChange={(e) => setUser({ name: e.target.value })} placeholder={t('form.name')} />
            </Field>
          </div>
          <Field label={t('form.age')}>
            <input className="input" type="number" min={10} max={120} value={p.user.age} onChange={(e) => setUser({ age: Number(e.target.value) })} />
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
            <select className="input" value={heightUnit} onChange={(e) => onHeightUnit(e.target.value as HeightUnit)}>
              <option value="cm">cm</option>
              <option value="ft_in">ft / in</option>
            </select>
          </Field>
          {heightUnit === 'cm' ? (
            <Field label={t('form.heightCm')}>
              <input className="input" type="number" value={p.user.heightCm} onChange={(e) => setUser({ heightCm: Number(e.target.value) })} />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label={t('form.ft')}>
                <input
                  className="input"
                  type="number"
                  value={ftIn.ft}
                  onChange={(e) => {
                    const next = { ...ftIn, ft: Number(e.target.value) };
                    setFtIn(next);
                    setUser({ heightCm: ftInToCm(next.ft, next.inch) });
                  }}
                />
              </Field>
              <Field label={t('form.in')}>
                <input
                  className="input"
                  type="number"
                  value={ftIn.inch}
                  onChange={(e) => {
                    const next = { ...ftIn, inch: Number(e.target.value) };
                    setFtIn(next);
                    setUser({ heightCm: ftInToCm(next.ft, next.inch) });
                  }}
                />
              </Field>
            </div>
          )}
          <Field label={t('form.currentWeight')}>
            <input
              className="input"
              type="number"
              step="0.1"
              value={p.user.currentWeightKg}
              onChange={(e) => setUser({ currentWeightKg: Number(e.target.value) })}
            />
          </Field>
          <Field label={t('form.targetWeight')}>
            <input
              className="input"
              type="number"
              step="0.1"
              value={p.user.targetWeightKg}
              onChange={(e) => setUser({ targetWeightKg: Number(e.target.value) })}
            />
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
          <Field label={t('form.waterTarget')}>
            <input className="input" type="number" step={250} value={p.water.targetMl} onChange={(e) => set({ water: { targetMl: Number(e.target.value) } })} />
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
                    value={s.name}
                    onChange={(e) => updateSupplement(s.id, { name: e.target.value })}
                  />
                </div>
                <input className="input" placeholder={t('form.dose')} value={s.dose} onChange={(e) => updateSupplement(s.id, { dose: e.target.value })} />
                <TimeInput value={s.time} onChange={(v) => updateSupplement(s.id, { time: v })} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <Toggle checked={s.alarm} onChange={(v) => updateSupplement(s.id, { alarm: v })} label={t('form.alarm')} /> {t('form.alarm')}
                </label>
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
            <div key={i} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <input className="input" placeholder={t('form.habitName')} value={h.name} onChange={(e) => updateHabit(i, { name: e.target.value })} />
              <div className="mt-2 grid grid-cols-2 gap-2">
                <select className="input" value={h.schedule} onChange={(e) => updateHabit(i, { schedule: e.target.value as ProfileHabit['schedule'] })}>
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
                    value={h.targetPerWeek ?? 1}
                    onChange={(e) => updateHabit(i, { targetPerWeek: Number(e.target.value) || 1 })}
                  />
                )}
                {h.schedule === 'weekdays' && (
                  <div className="col-span-2">
                    <WeekdayPicker value={dayNamesToWeekdays(h.days ?? [])} onChange={(wd) => updateHabit(i, { days: wd.map((w) => DAY_NAMES[w - 1]) })} />
                  </div>
                )}
              </div>
              <div className="mt-2 flex justify-end">
                <button className="min-h-[44px] px-2 text-xs text-rose-600" onClick={() => set({ habits: p.habits.filter((_, idx) => idx !== i) })}>
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
                value={p.nutritionTargets?.kcal ?? ''}
                placeholder={t('common.auto')}
                onChange={(e) => set({ nutritionTargets: { ...p.nutritionTargets, kcal: e.target.value ? Number(e.target.value) : undefined } })}
              />
            </Field>
            <Field label={t('form.proteinTarget')}>
              <input
                className="input"
                type="number"
                value={p.nutritionTargets?.proteinG ?? ''}
                placeholder={t('common.auto')}
                onChange={(e) => set({ nutritionTargets: { ...p.nutritionTargets, proteinG: e.target.value ? Number(e.target.value) : undefined } })}
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
