import { describe, expect, it } from 'vitest';
import { costOf, rankOptions, withRecheck, type RankContext } from '../ranking';
import { recoveryCandidates } from '../../data/sampleDisruptions';
import * as sample from '../../data/sampleTrips';

const ctx: RankContext = {
  travellers: 2,
  originalArrival: '2026-10-14T23:10:00+09:00',
  firstStay: sample.accommodations[0],
  transport: sample.transport.filter((t) => t.tripId === 't-japan'),
};
const forType = (t: string) => recoveryCandidates.filter((c) => c.appliesTo.includes(t as never));
const byId = (id: string) => recoveryCandidates.find((c) => c.id === id)!;

describe('true cost of an option', () => {
  it('counts lost prepaid bookings and meals, not only the ticket', () => {
    const c = costOf(byId('c-ai358'), ctx);
    // Free rebooking, but: first hotel night 38,900 / 4 = 9,725 lost; Skyliner 1,650 lost
    // and bought again; 9 h 25 m wait = 3 meals x 350 x 2 people = 2,100.
    expect(c.timeLostMin).toBe(565);
    expect(c.total).toBe(9725 + 1650 + 1650 + 2100);
    expect(c.newSpend).toBe(1650); // only the new Skyliner ticket is paid through the app
  });

  it('multiplies fares by the number of travellers', () => {
    const c = costOf(byId('c-jl740'), ctx);
    expect(c.lines[0]).toMatchObject({ amount: 36900, kind: 'new' });
  });
});

describe('ranking', () => {
  it('puts the free rebooking first and the risky two-ticket route last', () => {
    const ranked = rankOptions(forType('delay'), ctx);
    expect(ranked.map((r) => r.candidate.id)).toEqual(['c-ai358', 'c-overnight', 'c-jl740', 'c-tg']);
    expect(ranked[0].tags).toContain('cheapest');
    expect(ranked.find((r) => r.candidate.id === 'c-jl740')?.tags).toContain('fastest');
    expect(ranked[0].why).toMatch(/^Lowest true cost at ₹15,125\./);
    expect(ranked[0].why).toContain('You still lose ₹11,375 of prepaid bookings.');
  });

  it('applies a recheck and can change the cost', () => {
    const jl = byId('c-jl740');
    const rechecked = withRecheck(jl, { candidateId: jl.id, farePerPerson: 19100, extraStay: 0, seats: 2, soldOut: false, checkedAt: '' });
    expect(costOf(rechecked, ctx).total - costOf(jl, ctx).total).toBe(1300);
    expect(rankOptions([rechecked], ctx)[0].tags).toContain('few-seats');
  });

  it('prefers the cheap cab move over a free flight switch with one seat left', () => {
    expect(rankOptions(forType('preponed'), ctx).map((r) => r.candidate.id)).toEqual(['c-cab', 'c-ai805']);
  });
});
