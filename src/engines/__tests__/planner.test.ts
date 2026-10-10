import { describe, expect, it } from 'vitest';
import { adaptDay, diffPlans, isOpen, planTrip, type Place, type PlanInput } from '../planner';

const place = (id: string, kind: 'see' | 'eat', category: string, score: number, extra: Partial<Place> = {}): Place => ({
  id,
  kind,
  name: id,
  category,
  lat: 26.9 + score / 1000,
  lon: 75.8,
  openingHours: null,
  entry: kind === 'see' ? 'free' : null,
  costRange: kind === 'eat' ? [200, 400] : null,
  vegetarian: kind === 'eat' ? true : null,
  score,
  link: 'https://maps.example',
  ...extra,
});

const places: Place[] = [
  place('fort', 'see', 'fort', 9),
  place('palace', 'see', 'castle', 8),
  place('museum', 'see', 'museum', 7),
  place('gallery', 'see', 'gallery', 6),
  place('viewpoint', 'see', 'viewpoint', 5),
  place('zoo', 'see', 'zoo', 4),
  place('memorial', 'see', 'monument', 3),
  place('cafe1', 'eat', 'cafe', 5),
  place('thali', 'eat', 'restaurant', 4),
  place('dhaba', 'eat', 'restaurant', 3),
  place('bistro', 'eat', 'restaurant', 2, { costRange: [1500, 2500] }),
  place('cafe2', 'eat', 'cafe', 1),
];

const input = (over: Partial<PlanInput> = {}): PlanInput => ({
  startDate: '2027-01-10',
  endDate: '2027-01-13',
  places,
  allowance: { meal: 800, activities: 1500 },
  maxIntensityPerDay: 9,
  restBreak: false,
  vegOnly: false,
  paidEntryEstimate: 300,
  ...over,
});

describe('initial plan', () => {
  const plan = planTrip(input());
  it('covers every day, with lighter arrival and departure days', () => {
    expect(plan.days.map((d) => d.kind)).toEqual(['arrival', 'full', 'full', 'departure']);
    expect(plan.days[0].items.every((i) => i.start >= '15:00')).toBe(true);
    expect(plan.days[3].items.every((i) => i.end <= '13:00')).toBe(true);
  });

  it('plans meals at meal times and never repeats a place', () => {
    const full = plan.days[1];
    expect(full.items.some((i) => i.type === 'restaurant' && i.start >= '12:30' && i.start <= '14:00')).toBe(true);
    const ids = plan.days.flatMap((d) => d.items.map((i) => i.placeId));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('keeps each day within the intensity cap and the daily budget', () => {
    for (const d of plan.days.filter((x) => x.kind === 'full')) {
      expect(d.items.filter((i) => i.type === 'experience').reduce((s, i) => s + i.intensity, 0)).toBeLessThanOrEqual(9);
      expect(d.items.reduce((s, i) => s + i.costPerPerson, 0)).toBeLessThanOrEqual(1500 + 1600);
    }
  });

  it('adds a rest break for families and plans indoors on rainy days', () => {
    expect(planTrip(input({ restBreak: true })).days[1].items.some((i) => i.type === 'rest')).toBe(true);
    const wet = planTrip(input({ rainDates: ['2027-01-11'] })).days[1];
    expect(wet.items.filter((i) => i.type === 'experience').every((i) => i.indoor)).toBe(true);
  });

  it('respects opening hours', () => {
    expect(isOpen('Tu-Su 10:00-17:00; Mo off', '2027-01-11', '11:00', '12:00')).toBe(false); // a Monday
    expect(isOpen('Tu-Su 10:00-17:00; Mo off', '2027-01-12', '11:00', '12:00')).toBe(true);
    expect(isOpen('Mo-Su 09:00-13:00', '2027-01-12', '14:00', '15:00')).toBe(false);
    const closedMonday = planTrip(input({ places: [place('museum', 'see', 'museum', 9, { openingHours: 'Tu-Su 10:00-17:00; Mo off' }), ...places.slice(3)] }));
    expect(closedMonday.days[1].items.some((i) => i.placeId === 'museum')).toBe(false);
  });
});

describe('today mode', () => {
  const base = planTrip(input());
  const date = base.days[1].date;
  const pool = places;

  it('sick: only easy things stay, rest and pharmacy added, the rest moved', () => {
    const r = adaptDay(base, 'sick', { date, pool });
    const day = r.plan.days[1];
    expect(day.items.filter((i) => i.status === 'planned' && i.type === 'experience')).toHaveLength(0);
    expect(day.items.some((i) => i.note === 'pharmacy')).toBe(true);
    expect(r.changes.some((c) => c.startsWith('Moved') || c.startsWith('Postponed'))).toBe(true);
    expect(day.items.filter((i) => i.status === 'planned').every((i) => i.intensity <= 1)).toBe(true);
  });

  it('lighter: cuts effort to about 60% and adds something gentle', () => {
    const before = base.days[1].items.filter((i) => i.status === 'planned').reduce((s, i) => s + i.intensity, 0);
    const r = adaptDay(base, 'lighter', { date, pool });
    const after = r.plan.days[1].items.filter((i) => i.status === 'planned' && i.type !== 'rest').reduce((s, i) => s + i.intensity, 0);
    expect(after).toBeLessThan(before);
    expect(r.plan.days[1].items.some((i) => i.type === 'rest')).toBe(true);
  });

  it('rain: outdoor sights swapped for indoor ones', () => {
    const r = adaptDay(base, 'rain', { date, pool: [...pool, place('indoor-1', 'see', 'museum', 1), place('indoor-2', 'see', 'gallery', 1)] });
    expect(r.plan.days[1].items.filter((i) => i.status === 'planned' && i.type === 'experience').every((i) => i.indoor)).toBe(true);
  });

  it('respects locked items and warns about paid bookings', () => {
    const locked = JSON.parse(JSON.stringify(base));
    const exp = locked.days[1].items.find((i: { type: string }) => i.type === 'experience');
    exp.locked = true;
    const other = locked.days[1].items.filter((i: { type: string }) => i.type === 'experience')[1];
    if (other) Object.assign(other, { bookingId: 'bk-1', bookingRefundable: false });
    const r = adaptDay(locked, 'sick', { date, pool });
    expect(r.plan.days[1].items.find((i) => i.id === exp.id)!.status).toBe('planned');
    if (other) expect(r.warnings[0]).toMatchObject({ bookingId: 'bk-1' });
  });

  it('overspend: pricey meals swapped for cheaper ones', () => {
    const pricey = JSON.parse(JSON.stringify(base));
    const meal = pricey.days[1].items.find((i: { type: string }) => i.type === 'restaurant');
    meal.costPerPerson = 2000;
    const r = adaptDay(pricey, 'overspend', { date, pool: [...pool, place('cheap-eat', 'eat', 'cafe', 1, { costRange: [100, 200] })], allowance: { meal: 400, activities: 1000 } });
    expect(r.changes.some((c) => c.includes('cheaper'))).toBe(true);
  });

  it('running late shifts the day; skip removes one item; diff explains', () => {
    const late = adaptDay(base, 'late', { date, minutes: 45 });
    expect(late.plan.days[1].items[0].start > base.days[1].items[0].start).toBe(true);
    const first = base.days[1].items.find((i) => i.type === 'experience')!;
    const skipped = adaptDay(base, 'skip', { date, itemId: first.id });
    expect(skipped.plan.days[1].items.find((i) => i.id === first.id)!.status).toBe('skipped');
    expect(diffPlans(base, skipped.plan)[0]).toContain(`Removed ${first.title}`);
  });
});

describe('vegetarian travellers', () => {
  it('still get meals when listings have no diet info, and never non-veg places', () => {
    const unknownDiet = places.map((p) => (p.kind === 'eat' ? { ...p, vegetarian: null } : p));
    const withNonVeg = [...unknownDiet, place('steakhouse', 'eat', 'restaurant', 99, { vegetarian: false })];
    const plan = planTrip(input({ places: withNonVeg, vegOnly: true }));
    const meals = plan.days.flatMap((d) => d.items).filter((i) => i.type === 'restaurant');
    expect(meals.length).toBeGreaterThan(2);
    expect(meals.some((m) => m.placeId === 'steakhouse')).toBe(false);
  });
});
