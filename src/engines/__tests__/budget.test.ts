import { describe, expect, it } from 'vitest';
import { budgetPlan, DEFAULT_SPLIT, fitFor, normaliseSplit, trackSpending, tripDays } from '../budget';

describe('budget plan', () => {
  it('uses the default split and gives daily allowances', () => {
    const p = budgetPlan(100_000, DEFAULT_SPLIT, 5, 2);
    expect(p.amounts).toMatchObject({ travel: 35_000, stay: 30_000, food: 20_000, local: 10_000, buffer: 5_000 });
    expect(p.daily.food).toBe(2000); // 20,000 / 5 days / 2 people
    expect(p.daily.meal).toBe(1000);
    expect(p.daily.local).toBe(1000);
    expect(p.daily.activities).toBe(500); // from the buffer
  });

  it('rescales an adjusted split to 100%', () => {
    const s = normaliseSplit({ travel: 0.5, stay: 0.5 });
    expect(Object.values(s).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
    expect(s.travel).toBeGreaterThan(s.food);
  });

  it('badges fit', () => {
    expect(fitFor(90, 100)).toBe('within');
    expect(fitFor(108, 100)).toBe('tight');
    expect(fitFor(130, 100)).toBe('over');
    expect(tripDays('2027-01-10', '2027-01-13')).toBe(4);
  });
});

describe('spending tracker', () => {
  it('compares spent with planned, counts refunds, and alerts on overspend', () => {
    const t = trackSpending(40_000, DEFAULT_SPLIT, '2027-01-10', '2027-01-13', [
      { category: 'food', amount: 9_000, date: '2027-01-10' },
      { category: 'stay', amount: 12_000, date: '2027-01-10' },
      { category: 'stay', amount: -2_000, date: '2027-01-11' }, // refund
    ], '2027-01-11');
    const food = t.rows.find((r) => r.category === 'food')!;
    expect(food).toMatchObject({ planned: 8000, spent: 9000, over: true });
    expect(t.totalSpent).toBe(19_000);
    expect(t.daysLeft).toBe(3);
    expect(t.perDayLeft).toBe(7000);
    expect(t.alert).toBe('category');
  });
});
