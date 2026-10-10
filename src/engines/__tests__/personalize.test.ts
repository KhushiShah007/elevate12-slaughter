import { describe, expect, it } from 'vitest';
import { derivePersona } from '../persona';
import { budgetStyle, orderEateries, orderPlaces, placeReason, suggestDestinations, tripEstimate } from '../personalize';

const cost = { shoestring: 2000, moderate: 4500, comfort: 9000, luxury: 25000 };
const dest = (slug: string, personaTags: string[], shoestring: number, isDomestic = true, featured = false) => ({
  slug,
  name: slug,
  isDomestic,
  personaTags,
  featured,
  dailyCostInr: { ...cost, shoestring },
});

describe('budget style', () => {
  it('follows the budget answer', () => {
    expect(budgetStyle(derivePersona({ budget: 'saver' }))).toBe('shoestring');
    expect(budgetStyle(derivePersona({ budget: 'mid' }))).toBe('comfort');
    expect(budgetStyle(derivePersona({ budget: 'treat' }))).toBe('luxury');
    expect(budgetStyle(derivePersona({}))).toBe('moderate');
  });

  it('estimates a whole trip', () => {
    expect(tripEstimate(cost, 'moderate', 4, 2)).toBe(36000);
  });
});

describe('places', () => {
  it('puts culture first for culture lovers, with a reason', () => {
    const culture = derivePersona({ interests: 'culture' });
    const ordered = orderPlaces([{ category: 'viewpoint' }, { category: 'museum' }, { category: 'attraction' }], culture);
    expect(ordered[0]).toEqual({ item: { category: 'museum' }, reason: 'History and culture' });
    expect(ordered[1].reason).toBeNull();
  });

  it('suits families with zoos and parks', () => {
    const family = derivePersona({ mix: 'family' });
    expect(placeReason('zoo', family)).toBe('Good with kids and elders');
    expect(placeReason('zoo', derivePersona({ interests: 'food' }))).toBeNull();
  });

  it('lists vegetarian places first only for veg travellers', () => {
    const items = [{ vegetarian: null }, { vegetarian: true }];
    expect(orderEateries(items, derivePersona({ food: 'veg' }))[0].vegetarian).toBe(true);
    expect(orderEateries(items, derivePersona({ food: 'nonveg' }))[0].vegetarian).toBeNull();
  });
});

describe('destination suggestions', () => {
  const list = [dest('pricey-beach', ['beach'], 6000, false), dest('family-city', ['family'], 2500), dest('cheap-hills', ['budget', 'nature'], 1200), dest('famous', [], 3000, true, true)];

  it('suggests family places to families, with reasons', () => {
    const [top] = suggestDestinations(list, derivePersona({ mix: 'family' }), 2);
    expect(top.dest.slug).toBe('family-city');
    expect(top.reasons).toContain('Family-friendly');
  });

  it('leans cheap for savers', () => {
    const [top] = suggestDestinations(list, derivePersona({ budget: 'saver' }), 2);
    expect(top.dest.slug).toBe('cheap-hills');
    expect(top.reasons).toEqual(['Good value', 'Easy on the budget']);
  });
});
