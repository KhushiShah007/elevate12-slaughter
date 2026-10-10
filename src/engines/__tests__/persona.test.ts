import { describe, expect, it } from 'vitest';
import { defaultPersona, derivePersona, matchOther } from '../persona';

describe('typed "Other" answers', () => {
  it.each([
    ['food', 'Jain, no onion garlic', 'jain'],
    ['food', 'mostly vegan', 'veg'],
    ['food', 'non veg is fine', 'nonveg'],
    ['mix', 'me and my parents', 'family'],
    ['mix', 'akele hi', 'solo'],
    ['budget', 'student budget', 'saver'],
    ['interests', 'trekking and beaches', 'nature'],
    ['pace', 'aaram se', 'slow'],
  ] as const)('%s: "%s" -> %s', (q, text, option) => {
    expect(matchOther(q, text)).toBe(option);
  });

  it('keeps "other" when nothing fits', () => {
    expect(matchOther('style', 'it depends on the weather')).toBeNull();
    expect(derivePersona({ style: 'other' }, { style: 'it depends' }).resolved.style).toBe('other');
  });
});

describe('persona', () => {
  it('family trips are calmer and suggest bigger text', () => {
    const p = derivePersona({ mix: 'family', pace: 'packed', food: 'veg' });
    expect(p.id).toBe('family');
    expect(p.activitiesPerDay).toBe(2);
    expect(p.suggestSenior).toBe(true);
    expect(p.vegFirst).toBe(true);
  });

  it('a typed answer can decide the persona', () => {
    const p = derivePersona({ mix: 'other', food: 'other' }, { mix: 'with my kids', food: 'Jain food only' });
    expect(p.id).toBe('family');
    expect(p.jain).toBe(true);
  });

  it('budget changes how much an hour is worth when ranking options', () => {
    expect(derivePersona({ budget: 'saver' }).valueOfHourInr).toBe(300);
    expect(derivePersona({ budget: 'treat' }).valueOfHourInr).toBe(1000);
    expect(defaultPersona().valueOfHourInr).toBe(600);
  });

  it('slow pace means two things a day', () => {
    expect(derivePersona({ pace: 'slow', interests: 'culture' })).toMatchObject({ id: 'slow', activitiesPerDay: 2, interests: ['culture'] });
  });
});

describe('reshaping suggestions', () => {
  it('puts matching experiences first and vegetarian food first', async () => {
    const { orderExperiences, orderRestaurants } = await import('../persona');
    const culture = derivePersona({ interests: 'culture', food: 'veg' });
    const ex = orderExperiences([{ id: 'nara', interests: ['nature'] }, { id: 'tea', interests: ['culture'] }], culture);
    expect(ex.map((e) => [e.item.id, e.match])).toEqual([['tea', true], ['nara', false]]);
    expect(orderRestaurants([{ id: 'a', veg: false }, { id: 'b', veg: true }], culture).map((r) => r.id)).toEqual(['b', 'a']);
  });

  it('a saver and a "treat" persona rank the same options differently', async () => {
    const { rankOptions } = await import('../ranking');
    const { recoveryCandidates } = await import('../../data/sampleDisruptions');
    const sample = await import('../../data/sampleTrips');
    const ctx = { travellers: 2, originalArrival: '2026-10-14T23:10:00+09:00', firstStay: sample.accommodations[0], transport: sample.transport };
    const delay = recoveryCandidates.filter((c) => c.appliesTo.includes('delay'));
    const order = (v: number) => rankOptions(delay, { ...ctx, valueOfHourInr: v }).map((r) => r.candidate.id);
    expect(order(300)[1]).toBe('c-overnight'); // saver: the cheap overnight beats the pricey fast ticket
    expect(order(6000)[1]).toBe('c-jl740'); // time is precious: the fastest new ticket climbs
  });
});

describe('destination fit', () => {
  it('matches destinations to the persona', async () => {
    const { derivePersona, destinationFit } = await import('../persona');
    const family = derivePersona({ mix: 'family' });
    expect(destinationFit(['family', 'beach'], family)).toBe(1);
    expect(destinationFit(['adventure'], family)).toBe(0);
  });
});
