import { describe, expect, it } from 'vitest';
import { adjustedSteps, eventFromStatuses, runCascade, type CascadeInput } from '../cascade';
import { connectionView, layoverPlan } from '../layover';
import { shift, shiftClock } from '../time';
import * as sample from '../../data/sampleTrips';

const input: CascadeInput = {
  flights: sample.flights.filter((f) => f.tripId === 't-japan'),
  accommodations: sample.accommodations.filter((a) => a.tripId === 't-japan'),
  transport: sample.transport.filter((t) => t.tripId === 't-japan'),
  steps: sample.journeySteps,
  pickup: sample.familyPickups[0],
};
const byId = (r: ReturnType<typeof runCascade>, id: string) => r.effects.find((e) => e.id === id);

describe('time helpers', () => {
  it('shifts across midnight and keeps the local offset', () => {
    expect(shift('2026-10-14T23:10:00+09:00', 70)).toBe('2026-10-15T00:20:00+09:00');
    expect(shiftClock('03:30', -50)).toBe('02:40');
    expect(shiftClock('00:10', -20)).toBe('23:50');
  });
});

describe('cascade', () => {
  it('with nothing changed, everything is fine and the family leaves at the computed time', () => {
    const r = runCascade(input, null);
    expect(r.brokenAt).toBeNull();
    expect(r.effects.every((e) => e.level === 'ok')).toBe(true);
    // lands 23:10, +60 to exit arrivals, -75 travel = 22:55
    expect(r.familyLeave).toBe('22:55');
  });

  it('a 2 h 40 m delay on the first leg breaks the Delhi connection and everything after it', () => {
    const r = runCascade(input, { kind: 'delay', flightId: 'f1', minutes: 160 });
    expect(r.brokenAt).toBe('f2');
    expect(byId(r, 'conn-f2')?.level).toBe('bad');
    expect(byId(r, 'conn-f2')?.detail).toContain('40 m left');
    expect(byId(r, 'stay-a1')?.level).toBe('warn');
    expect(byId(r, 'post-tr2')?.level).toBe('warn');
    expect(byId(r, 'family')?.detail).toContain('22:55');
    expect(byId(r, 'post-tr4')).toBeUndefined(); // metro card is not a timed ticket
    expect(r.newArrival).toBeNull();
    expect(r.familyLeave).toBeNull();
  });

  it('a 70 minute delay makes the connection tight but keeps the arrival', () => {
    const r = runCascade(input, { kind: 'delay', flightId: 'f1', minutes: 70 });
    expect(r.brokenAt).toBeNull();
    expect(byId(r, 'conn-f2')?.level).toBe('warn');
    expect(byId(r, 'family')?.level).toBe('ok');
  });

  it('a delay on the last leg shifts everything after landing', () => {
    const r = runCascade(input, { kind: 'delay', flightId: 'f2', minutes: 45 });
    expect(r.newArrival).toBe('2026-10-14T23:55:00+09:00');
    expect(byId(r, 'post-tr2')?.level).toBe('bad'); // out of arrivals 00:55, Skyliner leaves 00:40
    expect(byId(r, 'stay-a1')?.level).toBe('warn'); // reach 02:25, limit 02:30
    expect(byId(r, 'family')?.detail).toContain('23:40'); // 22:55 + 45
  });

  it('a prepone pulls leave-home and the cab earlier, and grows the layover', () => {
    const r = runCascade(input, { kind: 'prepone', flightId: 'f1', minutes: 50 });
    expect(byId(r, 'leave-home')?.detail).toContain('02:40');
    expect(byId(r, 'pre-tr1')?.level).toBe('bad');
    expect(byId(r, 'conn-f2')?.detail).toContain('Grows to 4 h 10 m');
  });

  it('a missed connection is certain, so downstream items are red', () => {
    const r = runCascade(input, { kind: 'missed', flightId: 'f2' });
    expect(r.headline).toContain('missed AI 306');
    expect(byId(r, 'stay-a1')?.level).toBe('bad');
    expect(byId(r, 'family')?.level).toBe('bad');
  });

  it('reads the current disruption from flight statuses', () => {
    const base = sample.flightStatuses;
    expect(eventFromStatuses(base)).toBeNull();
    expect(eventFromStatuses([{ ...base[0], delayMin: 30 }, base[1]])).toEqual({ kind: 'delay', flightId: 'f1', minutes: 30 });
    expect(eventFromStatuses([base[0], { ...base[1], missed: true }])).toEqual({ kind: 'missed', flightId: 'f2' });
  });
});

describe('layover plan', () => {
  const [a, b] = input.flights;
  it('splits the Delhi layover into steps and free time', () => {
    const p = layoverPlan(a, b);
    expect(p.layoverMin).toBe(200);
    expect(p.freeMin).toBe(200 - 90 - 20);
    expect(p.level).toBe('ok');
  });
  it('flags a connection that is too short after a delay', () => {
    const v = connectionView(a, b, 120, 'connecting');
    expect(v.effects.find((e) => e.id === 'free')?.level).toBe('bad');
    expect(v.brokenAt).toBe('f2');
  });
});

describe('wording', () => {
  it('starts every sentence with a capital letter', () => {
    for (const ev of [
      { kind: 'missed', flightId: 'f2' },
      { kind: 'delay', flightId: 'f1', minutes: 160 },
    ] as const) {
      for (const e of runCascade(input, ev).effects) expect(e.detail[0]).toBe(e.detail[0].toUpperCase());
    }
  });
});

describe('adjusted timeline', () => {
  it('moves every step earlier on a prepone, and keeps it on a delay', () => {
    const pre = adjustedSteps(input.steps, input.flights, { kind: 'prepone', flightId: 'f1', minutes: 50 });
    expect(pre[0].at).toBe('02:40');
    expect(pre[pre.length - 1].at).toBe('04:50');
    expect(adjustedSteps(input.steps, input.flights, { kind: 'delay', flightId: 'f1', minutes: 50 })).toBe(input.steps);
  });
});
