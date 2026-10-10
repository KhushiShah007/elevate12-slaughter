import { describe, expect, it } from 'vitest';
import { buildItinerary } from '../itineraryBuilder';
import { derivePersona } from '../persona';
import * as sample from '../../data/sampleTrips';

const japan = <T extends { tripId: string | null }>(rows: T[]) => rows.filter((r) => r.tripId === 't-japan');
const build = (answers: Parameters<typeof derivePersona>[0]) =>
  buildItinerary({
    trip: sample.trips[0],
    days: japan(sample.itineraryDays),
    items: japan(sample.itineraryItems),
    stays: japan(sample.accommodations),
    experiences: japan(sample.experiences),
    restaurants: japan(sample.restaurants),
    persona: derivePersona(answers),
    nearby: sample.nearbyPlaces,
  });

describe('itinerary builder', () => {
  it('covers every day of the trip and keeps booked items', () => {
    const days = build({});
    expect(days.map((d) => d.date)).toEqual(['2026-10-14', '2026-10-15', '2026-10-16', '2026-10-17', '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22']);
    expect(days[0].items.map((i) => i.title)).toContain('AI 865 to Delhi');
    expect(days[0].items.every((i) => !i.suggested)).toBe(true); // nothing added on a travel day
  });

  it('only suggests places in the city of that night', () => {
    const days = build({ interests: 'culture' });
    const kyoto = days.filter((d) => d.region === 'Kyoto').flatMap((d) => d.items.filter((i) => i.suggested && i.kind === 'see'));
    const tokyo = days.filter((d) => d.region === 'Tokyo').flatMap((d) => d.items.filter((i) => i.suggested && i.kind === 'see'));
    expect(kyoto.map((i) => i.title)).toEqual(expect.arrayContaining(['Tea ceremony in Uji', 'Fushimi Inari at dawn']));
    expect(tokyo.map((i) => i.title)).not.toContain('Tea ceremony in Uji');
  });

  it('never repeats a sight that is already booked', () => {
    const all = build({}).flatMap((d) => d.items.map((i) => i.title));
    expect(all.filter((t) => t === 'teamLab Planets')).toHaveLength(1);
  });

  it('a slow traveller gets fewer plans and an afternoon rest; veg lunches only', () => {
    const days = build({ pace: 'slow', food: 'veg' });
    const free = days.filter((d) => !d.travelDay);
    expect(free.every((d) => d.items.filter((i) => i.kind === 'see').length <= 2)).toBe(true);
    expect(free.some((d) => d.items.some((i) => i.note === 'rest'))).toBe(true);
    const lunches = free.flatMap((d) => d.items.filter((i) => i.title.startsWith('Lunch at')));
    expect(lunches.length).toBeGreaterThan(0);
    expect(lunches.some((i) => i.title.includes('Nishiki'))).toBe(false); // not vegetarian
  });
});
