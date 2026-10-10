import { describe, expect, it } from 'vitest';
import { loyaltySummary, pointsFor } from '../loyalty';
import type { Booking } from '../../types';

const b = (over: Partial<Booking>): Booking => ({
  id: 'b',
  tripId: 't',
  kind: 'flight',
  title: 'x',
  amount: 1000,
  status: 'confirmed',
  bookedViaApp: true,
  ...over,
});

describe('loyalty', () => {
  it('gives 3% rounded down', () => {
    expect(pointsFor(12400)).toBe(372);
    expect(pointsFor(99)).toBe(2);
  });

  it('counts only confirmed in-app bookings', () => {
    const s = loyaltySummary([
      b({ id: '1', amount: 10000 }),
      b({ id: '2', amount: 5000, status: 'suggested' }),
      b({ id: '3', amount: 7000, bookedViaApp: false }),
    ]);
    expect(s.spend).toBe(10000);
    expect(s.total).toBe(300);
    expect(s.entries).toHaveLength(1);
  });
});
