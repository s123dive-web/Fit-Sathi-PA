import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FoodItem, Profile } from '../../types';
import { validateProfile } from '../../utils/profile';
import { t } from '../../i18n';

const logMeal = vi.fn(async (..._a: unknown[]) => undefined);

vi.mock('../../services/actions', () => ({
  logMeal: (...a: unknown[]) => logMeal(...a),
  removeMeal: vi.fn(async () => undefined),
}));

const poha: FoodItem = {
  id: 'f_poha',
  name: 'Poha',
  category: 'Breakfast',
  servingLabel: '1 plate',
  servingGrams: 150,
  kcal: 250,
  proteinG: 5,
  carbsG: 45,
  fatG: 6,
  vegetarian: true,
  custom: false,
};

vi.mock('../../db/repos', () => ({
  foodRepo: { all: vi.fn(async () => [poha]), upsert: vi.fn(async () => undefined) },
  mealRepo: { on: vi.fn(async () => []), between: vi.fn(async () => []) },
}));

const raw = JSON.parse(readFileSync(resolve(process.cwd(), 'sample/suresh_profile.json'), 'utf8')) as Profile;
const profile = validateProfile(raw).profile!;

describe('<Food />', () => {
  beforeEach(() => logMeal.mockClear());

  const openPickerAndSelect = async () => {
    fireEvent.click(screen.getAllByRole('button', { name: t('food.logFood') })[0]);
    fireEvent.click((await screen.findAllByRole('button', { name: /Poha/ }))[0]);
    return screen.getByLabelText(t('food.time')) as HTMLInputElement;
  };

  it('shows the targets disclaimer under the daily totals', async () => {
    const { Food } = await import('../../screens/Food');
    render(<Food profile={profile} />);
    await screen.findByText(t('food.meals'));
    expect(screen.getByText(t('food.disclaimer'))).toBeInTheDocument();
  });

  it('resets the picker (time, servings, selection) every time it opens', async () => {
    const { Food } = await import('../../screens/Food');
    render(<Food profile={profile} />);
    await screen.findByText(t('food.meals'));

    const time = await openPickerAndSelect();
    expect(time.value).toMatch(/^\d\d:\d\d$/);
    fireEvent.change(time, { target: { value: '09:00' } });
    fireEvent.change(screen.getByRole('spinbutton', { name: t('food.servings') }), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: t('food.logMeal') }));
    await waitFor(() => expect(logMeal).toHaveBeenCalledTimes(1));
    expect(logMeal.mock.calls[0][1]).toMatchObject({ time: '09:00', servings: 2, kcal: 500 });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const time2 = await openPickerAndSelect();
    expect(time2.value).not.toBe('09:00');
    expect(time2.value).toMatch(/^\d\d:\d\d$/);
    expect((screen.getByRole('spinbutton', { name: t('food.servings') }) as HTMLInputElement).value).toBe('1');
  });

  it('keeps servings as text, flags out-of-range values and clamps on blur', async () => {
    const { Food } = await import('../../screens/Food');
    render(<Food profile={profile} />);
    await screen.findByText(t('food.meals'));
    await openPickerAndSelect();
    const servings = screen.getByRole('spinbutton', { name: t('food.servings') }) as HTMLInputElement;
    fireEvent.change(servings, { target: { value: '' } });
    expect(servings.value).toBe('');
    expect(screen.getByText(t('food.servingsRange', { min: 0.25, max: 20 }))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: t('food.logMeal') })).toBeDisabled();
    fireEvent.change(servings, { target: { value: '99' } });
    fireEvent.blur(servings);
    expect(servings.value).toBe('20');
    expect(screen.getByRole('button', { name: t('food.logMeal') })).not.toBeDisabled();
  });
});
