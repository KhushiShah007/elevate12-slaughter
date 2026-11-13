import { describe, expect, it } from 'vitest';
import { SAMPLE_LEAD_DAYS, sampleShiftDays, shiftDates, shiftIso } from '../../data/sampleShift';
import * as sample from '../../data/sampleTrips';
import { recoveryCandidates } from '../../data/sampleDisruptions';
import { runCascade } from '../cascade';
import { rankOptions } from '../ranking';

describe('sample date shift', () => {
  it('puts the sample trip a week ahead of today', () => {
    const days = sampleShiftDays(new Date(2026, 10, 13));
    expect(days).toBe(30 + SAMPLE_LEAD_DAYS);
    expect(shiftIso('2026-10-14T03:30:00+05:30', days)).toBe('2026-11-20T03:30:00+05:30');
  });

  it('never moves dates backwards', () => {
    expect(sampleShiftDays(new Date(2026, 0, 1))).toBe(0);
  });

  it('keeps time, zone and non-date strings', () => {
    expect(shiftIso('2026-12-31T23:10:00+09:00', 1)).toBe('2027-01-01T23:10:00+09:00');
    expect(shiftIso('2026-10-14', 2)).toBe('2026-10-16');
    expect(shiftDates({ ref: 'QX7H2M', at: '03:30', n: 5 }, 10)).toEqual({ ref: 'QX7H2M', at: '03:30', n: 5 });
  });

  it('gives the same cascade and ranking after shifting', () => {
    const days = 37;
    const input = (s: typeof sample) => ({ flights: s.flights, accommodations: s.accommodations, transport: s.transport, steps: s.journeySteps, pickup: s.familyPickups[0] });
    const event = { kind: 'delay' as const, flightId: 'f1', minutes: 160 };
    const before = runCascade(input(sample), event);
    const after = runCascade(input(shiftDates({ ...sample }, days)), event);
    expect(after.effects.map((e) => [e.id, e.level])).toEqual(before.effects.map((e) => [e.id, e.level]));
    expect(after.brokenAt).toBe(before.brokenAt);

    const ctx = (s: typeof sample) => ({ travellers: 2, originalArrival: s.flights[1].arrive, firstStay: s.accommodations[0], transport: s.transport });
    const cands = recoveryCandidates.filter((c) => c.appliesTo.includes('delay'));
    const r1 = rankOptions(cands, ctx(sample)).map((o) => [o.candidate.id, o.total]);
    const r2 = rankOptions(shiftDates(cands, days), ctx(shiftDates({ ...sample }, days))).map((o) => [o.candidate.id, o.total]);
    expect(r2).toEqual(r1);
  });
});
