import { useState } from 'react';
import type { ActivityLevel, DietType, Profile, Supplement } from '../types';
import { Card, Field, TimeInput, Toggle, WeekdayPicker } from './ui';
import { newId } from '../logic/ids';

const ACTIVITY: { v: ActivityLevel; l: string }[] = [
  { v: 'sedentary', l: 'Sedentary (desk job, little exercise)' },
  { v: 'light', l: 'Light (1–3 workouts / week)' },
  { v: 'moderate', l: 'Moderate (3–5 workouts / week)' },
  { v: 'active', l: 'Active (6–7 workouts / week)' },
  { v: 'very_active', l: 'Very active (physical job + training)' },
];
const DIETS: { v: DietType; l: string }[] = [
  { v: 'vegetarian', l: 'Vegetarian' },
  { v: 'eggetarian', l: 'Eggetarian' },
  { v: 'non_vegetarian', l: 'Non-vegetarian' },
  { v: 'vegan', l: 'Vegan' },
  { v: 'jain', l: 'Jain' },
  { v: 'other', l: 'Other' },
];

export function ProfileForm({ value, onChange }: { value: Profile; onChange: (p: Profile) => void }) {
  const p = value;
  const set = (patch: Partial<Profile>) => onChange({ ...p, ...patch });
  const [heightFt, setHeightFt] = useState(() => Math.floor(p.height.unit === 'ft_in' ? p.height.value / 12 : p.height.value / 2.54 / 12));
  const [heightIn, setHeightIn] = useState(() => Math.round((p.height.unit === 'ft_in' ? p.height.value : p.height.value / 2.54) % 12));

  const updateSupplement = (id: string, patch: Partial<Supplement>) =>
    set({ supplements: p.supplements.map((s) => (s.id === id ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-4">
      <Card title="About you">
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Field label="Name">
              <input className="input" value={p.name} onChange={(e) => set({ name: e.target.value })} placeholder="Your name" />
            </Field>
          </div>
          <Field label="Age">
            <input className="input" type="number" min={10} max={120} value={p.age} onChange={(e) => set({ age: Number(e.target.value) })} />
          </Field>
          <Field label="Sex (for calorie estimate)">
            <select className="input" value={p.sex ?? 'other'} onChange={(e) => set({ sex: e.target.value as Profile['sex'] })}>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Prefer not to say</option>
            </select>
          </Field>
          <div className="col-span-2">
            <Field label="City (optional)">
              <input className="input" value={p.city ?? ''} onChange={(e) => set({ city: e.target.value })} />
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Body">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Height unit">
            <select
              className="input"
              value={p.height.unit}
              onChange={(e) => {
                const unit = e.target.value as Profile['height']['unit'];
                if (unit === p.height.unit) return;
                const value = unit === 'cm' ? Math.round(p.height.value * 2.54) : Math.round(p.height.value / 2.54);
                set({ height: { unit, value } });
                setHeightFt(Math.floor(value / 12));
                setHeightIn(Math.round(value % 12));
              }}
            >
              <option value="cm">cm</option>
              <option value="ft_in">ft / in</option>
            </select>
          </Field>
          {p.height.unit === 'cm' ? (
            <Field label="Height (cm)">
              <input className="input" type="number" value={p.height.value} onChange={(e) => set({ height: { unit: 'cm', value: Number(e.target.value) } })} />
            </Field>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <Field label="ft">
                <input
                  className="input"
                  type="number"
                  value={heightFt}
                  onChange={(e) => {
                    const ft = Number(e.target.value);
                    setHeightFt(ft);
                    set({ height: { unit: 'ft_in', value: ft * 12 + heightIn } });
                  }}
                />
              </Field>
              <Field label="in">
                <input
                  className="input"
                  type="number"
                  value={heightIn}
                  onChange={(e) => {
                    const inch = Number(e.target.value);
                    setHeightIn(inch);
                    set({ height: { unit: 'ft_in', value: heightFt * 12 + inch } });
                  }}
                />
              </Field>
            </div>
          )}
          <Field label="Current weight (kg)">
            <input className="input" type="number" step="0.1" value={p.currentWeightKg} onChange={(e) => set({ currentWeightKg: Number(e.target.value) })} />
          </Field>
          <Field label="Target weight (kg)">
            <input className="input" type="number" step="0.1" value={p.targetWeightKg} onChange={(e) => set({ targetWeightKg: Number(e.target.value) })} />
          </Field>
          <div className="col-span-2">
            <Field label="Activity level">
              <select className="input" value={p.activityLevel} onChange={(e) => set({ activityLevel: e.target.value as ActivityLevel })}>
                {ACTIVITY.map((a) => (
                  <option key={a.v} value={a.v}>
                    {a.l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <div className="col-span-2">
            <Field label="Diet type">
              <select className="input" value={p.dietType} onChange={(e) => set({ dietType: e.target.value as DietType })}>
                {DIETS.map((d) => (
                  <option key={d.v} value={d.v}>
                    {d.l}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
      </Card>

      <Card title="Daily rhythm">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm">Intermittent fasting</span>
            <Toggle checked={p.fasting.enabled} onChange={(v) => set({ fasting: { ...p.fasting, enabled: v } })} label="Fasting" />
          </div>
          {p.fasting.enabled && (
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fast starts (eating closes)">
                <TimeInput value={p.fasting.start} onChange={(v) => set({ fasting: { ...p.fasting, start: v } })} />
              </Field>
              <Field label="Fast ends (eating opens)">
                <TimeInput value={p.fasting.end} onChange={(v) => set({ fasting: { ...p.fasting, end: v } })} />
              </Field>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Sleep from">
              <TimeInput value={p.sleep.start} onChange={(v) => set({ sleep: { ...p.sleep, start: v } })} />
            </Field>
            <Field label="Wake up">
              <TimeInput value={p.sleep.end} onChange={(v) => set({ sleep: { ...p.sleep, end: v } })} />
            </Field>
          </div>
          <Field label="Water target (ml / day)">
            <input className="input" type="number" step={250} value={p.waterTargetMl} onChange={(e) => set({ waterTargetMl: Number(e.target.value) })} />
          </Field>
        </div>
      </Card>

      <Card title="Workout slot">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start">
              <TimeInput value={p.workout.start} onChange={(v) => set({ workout: { ...p.workout, start: v } })} />
            </Field>
            <Field label="End">
              <TimeInput value={p.workout.end} onChange={(v) => set({ workout: { ...p.workout, end: v } })} />
            </Field>
          </div>
          <Field label="Days">
            <WeekdayPicker value={p.workout.days} onChange={(days) => set({ workout: { ...p.workout, days } })} />
          </Field>
        </div>
      </Card>

      <Card
        title="Supplements"
        action={
          <button
            className="btn-ghost py-1 text-xs"
            onClick={() => set({ supplements: [...p.supplements, { id: newId('sup'), name: '', dose: '', time: '08:00', alarm: true }] })}
          >
            + Add
          </button>
        }
      >
        {p.supplements.length === 0 && <p className="text-sm text-slate-500">No supplements yet.</p>}
        <div className="space-y-3">
          {p.supplements.map((s) => (
            <div key={s.id} className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <input className="input" placeholder="Name (e.g. Omega-3)" value={s.name} onChange={(e) => updateSupplement(s.id, { name: e.target.value })} />
                </div>
                <input className="input" placeholder="Dose" value={s.dose} onChange={(e) => updateSupplement(s.id, { dose: e.target.value })} />
                <TimeInput value={s.time} onChange={(v) => updateSupplement(s.id, { time: v })} />
              </div>
              <div className="mt-2 flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <Toggle checked={s.alarm} onChange={(v) => updateSupplement(s.id, { alarm: v })} label="Alarm" /> Alarm
                </label>
                <button className="text-xs text-rose-600" onClick={() => set({ supplements: p.supplements.filter((x) => x.id !== s.id) })}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Goals & privacy">
        <div className="space-y-3">
          <Field label="Appearance goals" hint="Free text — what do you want to look and feel like?">
            <textarea className="input min-h-[80px]" value={p.appearanceGoals} onChange={(e) => set({ appearanceGoals: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Calorie target (kcal, optional)">
              <input
                className="input"
                type="number"
                value={p.nutritionTargets?.kcal ?? ''}
                placeholder="auto"
                onChange={(e) => set({ nutritionTargets: { ...p.nutritionTargets, kcal: e.target.value ? Number(e.target.value) : undefined } })}
              />
            </Field>
            <Field label="Protein target (g, optional)">
              <input
                className="input"
                type="number"
                value={p.nutritionTargets?.proteinG ?? ''}
                placeholder="auto"
                onChange={(e) => set({ nutritionTargets: { ...p.nutritionTargets, proteinG: e.target.value ? Number(e.target.value) : undefined } })}
              />
            </Field>
          </div>
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-medium">Progress photos</div>
              <p className="text-xs text-slate-500">Photos are encrypted and stored only on this device. They never leave it.</p>
            </div>
            <Toggle checked={p.photoConsent} onChange={(v) => set({ photoConsent: v })} label="Photo consent" />
          </div>
        </div>
      </Card>
    </div>
  );
}

/** Drop undefined nested targets so the schema's additionalProperties check stays happy. */
export function normalizeProfile(p: Profile): Profile {
  const out: Profile = JSON.parse(JSON.stringify(p));
  if (out.nutritionTargets) {
    if (out.nutritionTargets.kcal === undefined) delete out.nutritionTargets.kcal;
    if (out.nutritionTargets.proteinG === undefined) delete out.nutritionTargets.proteinG;
    if (Object.keys(out.nutritionTargets).length === 0) delete out.nutritionTargets;
  }
  if (out.city === '') delete out.city;
  return out;
}
