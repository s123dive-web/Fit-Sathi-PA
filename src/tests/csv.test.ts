import { describe, expect, it } from 'vitest';
import { buildCsv, csvCell } from '../services/csv';

describe('CSV export', () => {
  it('escapes commas, quotes, newlines and spreadsheet formulas', () => {
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell(-2.5)).toBe('-2.5');
    expect(csvCell(null)).toBe('');
  });

  it('writes one dated row per fact, sums water per day and resolves names', () => {
    const csv = buildCsv({
      habits: [{ id: 'h1', name: 'Walk, evening' }],
      supplements: [{ id: 's1', name: 'Omega 3' }],
      habit_logs: [{ habit_id: 'h1', date: '2026-11-02', status: 'done', note: null }],
      supplement_logs: [{ supplement_id: 's1', date: '2026-11-01' }],
      water_logs: [
        { date: '2026-11-01', ml: 250 },
        { date: '2026-11-01', ml: 500 },
      ],
      weight_logs: [{ date: '2026-11-02', kg: 81.4 }],
      meal_logs: [{ date: '2026-11-01', time: '13:00', food_name: 'Dal', servings: 2, kcal: 300.4, protein_g: 18.26, carbs_g: 40, fat_g: 6 }],
      steps: [{ date: '2026-11-02', steps: 7000 }],
    });
    expect(csv.trimEnd().split('\r\n')).toEqual([
      'date,type,item,value,unit,detail',
      '2026-11-01,meal,Dal,300,kcal,time 13:00; servings 2; protein 18.3 g; carbs 40 g; fat 6 g',
      '2026-11-01,supplement,Omega 3,taken,,',
      '2026-11-01,water,,750,ml,',
      '2026-11-02,habit,"Walk, evening",done,,',
      '2026-11-02,steps,,7000,steps,',
      '2026-11-02,weight,,81.4,kg,',
    ]);
  });
});
