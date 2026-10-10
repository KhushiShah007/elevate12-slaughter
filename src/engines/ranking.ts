import type { Accommodation, Iso, RecheckResult, RecoveryCandidate, TransportBooking } from '../types';
import { RULES } from './cascade';
import { hhmm, isAfter, minutesBetween, shift, span, inZoneOf } from './time';
import { inr } from '../utils/format';

// Ranking is plain code. AI may later rephrase the `why` line, never the numbers or order.
export const RANK_RULES = {
  valueOfHourInr: 600, // what an hour of the trip is worth when comparing options
  mealPerPersonPer4h: 350, // food while waiting
  fewSeats: 2, // at or below this, an option may sell out before you book
  fewSeatsPenaltyInr: 3000,
  riskPenaltyInr: 3000, // e.g. a tight onward connection
  lostDayMin: 18 * 60,
};

export type CostKind = 'new' | 'lost' | 'estimate';
export interface CostLine {
  label: string;
  amount: number;
  kind: CostKind; // new money, prepaid value lost, or an estimate
}

export type OptionTag = 'cheapest' | 'fastest' | 'few-seats' | 'risky' | 'loses-day';

export interface RankedOption {
  candidate: RecoveryCandidate;
  rank: number;
  lines: CostLine[];
  total: number; // the true cost
  newSpend: number; // money actually paid through the app
  timeLostMin: number;
  score: number;
  tags: OptionTag[];
  why: string; // template reason, built from the facts above
}

export interface RankContext {
  travellers: number;
  originalArrival: Iso;
  firstStay?: Accommodation;
  transport: TransportBooking[];
}

/** Every rupee an option really costs: new spend, prepaid value lost, and meals while waiting. */
export function costOf(c: RecoveryCandidate, ctx: RankContext): { lines: CostLine[]; total: number; newSpend: number; timeLostMin: number } {
  const lines: CostLine[] = [];
  const add = (label: string, amount: number, kind: CostKind) => amount > 0 && lines.push({ label, amount, kind });

  add(c.farePerPerson ? `New tickets (${ctx.travellers} × ${inr(c.farePerPerson)})` : 'New tickets', c.farePerPerson * ctx.travellers, 'new');
  add('Extra stay', c.extraStay, 'new');
  add('Extra transport', c.extraTransport, 'new');
  add('Fees', c.fees, 'new');

  const timeLostMin = c.arrive ? Math.max(0, minutesBetween(ctx.originalArrival, c.arrive)) : (c.timeLostMin ?? 0);

  if (c.arrive) {
    // Prepaid first hotel night is lost if you can't reach it by its late-arrival limit.
    const stay = ctx.firstStay;
    if (stay?.latestArrival) {
      const reach = shift(c.arrive, RULES.arrivalExitMin + (stay.fromAirportMin ?? 0));
      if (isAfter(reach, stay.latestArrival)) add(`${stay.name}, night 1 (prepaid, lost)`, Math.round(stay.amount / stay.nights), 'lost');
    }
    // Timed ground transport you can no longer catch: the ticket is lost and you buy another.
    const ready = shift(c.arrive, RULES.arrivalExitMin);
    ctx.transport
      .filter((t) => t.mode !== 'metro' && isAfter(t.at, ctx.originalArrival) && minutesBetween(ctx.originalArrival, t.at) <= RULES.sameNightHours * 60)
      .filter((t) => isAfter(ready, inZoneOf(t.at, ready)))
      .forEach((t) => {
        add(`${t.title} ticket (prepaid, lost)`, t.amount, 'lost');
        add(`New ${t.title} ticket`, t.amount, 'new');
      });
  }

  if (timeLostMin > 0) add(`Meals while waiting (estimate)`, Math.ceil(timeLostMin / 240) * RANK_RULES.mealPerPersonPer4h * ctx.travellers, 'estimate');

  const total = lines.reduce((s, l) => s + l.amount, 0);
  const newSpend = lines.filter((l) => l.kind === 'new').reduce((s, l) => s + l.amount, 0);
  return { lines, total, newSpend, timeLostMin };
}

/** Apply what a recheck found to a candidate. */
export function withRecheck(c: RecoveryCandidate, r: RecheckResult | undefined): RecoveryCandidate {
  if (!r) return c;
  return { ...c, farePerPerson: r.farePerPerson, extraStay: r.extraStay, seats: r.seats };
}

function reason(o: Omit<RankedOption, 'why' | 'rank'>, rank: number): string {
  const c = o.candidate;
  const lost = o.lines.filter((l) => l.kind === 'lost').reduce((s, l) => s + l.amount, 0);
  const has = (t: OptionTag) => o.tags.includes(t);
  let lead: string;
  if (rank === 1) {
    lead = has('cheapest') ? `Lowest true cost at ${inr(o.total)}` : has('fastest') ? 'Gets you there soonest' : 'Best balance of cost and time';
  } else if (has('risky')) {
    lead = `Risky: ${c.risk}`;
  } else if (has('fastest') && c.arrive) {
    lead = `Lands soonest (${hhmm(c.arrive)}), but costs ${inr(o.total)} in all`;
  } else if (has('loses-day')) {
    lead = `Costs ${inr(o.total)} and loses ${span(o.timeLostMin)} of your trip`;
  } else {
    lead = o.total ? `Costs ${inr(o.total)} in all` : 'Free';
  }
  const seats = has('few-seats') && c.seats !== undefined ? ` Only ${c.seats} ${c.seats === 1 ? 'seat' : 'seats'} left.` : '';
  const prepaid = rank === 1 && lost > 0 ? ` You still lose ${inr(lost)} of prepaid bookings.` : '';
  return `${lead}. ${c.note}.${seats}${prepaid}`;
}

/** Rank options by true cost plus the value of time lost, with penalties for risk. */
export function rankOptions(candidates: RecoveryCandidate[], ctx: RankContext): RankedOption[] {
  const costed = candidates.map((candidate) => {
    const cost = costOf(candidate, ctx);
    const fewSeats = candidate.seats !== undefined && candidate.seats <= RANK_RULES.fewSeats;
    const score =
      cost.total +
      (cost.timeLostMin / 60) * RANK_RULES.valueOfHourInr +
      (fewSeats ? RANK_RULES.fewSeatsPenaltyInr : 0) +
      (candidate.risk ? RANK_RULES.riskPenaltyInr : 0);
    return { candidate, ...cost, score, fewSeats };
  });

  const minTotal = Math.min(...costed.map((c) => c.total));
  const withTime = costed.filter((c) => c.timeLostMin > 0);
  const minTime = withTime.length ? Math.min(...withTime.map((c) => c.timeLostMin)) : null;

  return costed
    .map((c) => {
      const tags: OptionTag[] = [];
      if (c.total === minTotal) tags.push('cheapest');
      if (minTime !== null && c.timeLostMin === minTime) tags.push('fastest');
      if (c.fewSeats) tags.push('few-seats');
      if (c.candidate.risk) tags.push('risky');
      if (c.timeLostMin >= RANK_RULES.lostDayMin) tags.push('loses-day');
      return { candidate: c.candidate, lines: c.lines, total: c.total, newSpend: c.newSpend, timeLostMin: c.timeLostMin, score: Math.round(c.score), tags };
    })
    .sort((a, b) => a.score - b.score || a.total - b.total)
    .map((o, i) => ({ ...o, rank: i + 1, why: reason(o, i + 1) }));
}

export interface RecheckRow {
  field: string;
  before: string;
  after: string;
  changed: boolean;
}

/** Old vs new after a recheck, including whether the option's rank moved. */
export function recheckRows(before: RankedOption, after: RankedOption | null, r: RecheckResult): RecheckRow[] {
  const c = before.candidate;
  const rows: RecheckRow[] = [];
  const row = (field: string, b: string, a: string) => rows.push({ field, before: b, after: a, changed: a !== b });
  if (c.farePerPerson || r.farePerPerson !== c.farePerPerson) row('Fare per person', inr(c.farePerPerson), inr(r.farePerPerson));
  if (c.extraStay || r.extraStay !== c.extraStay) row('Extra stay', inr(c.extraStay), inr(r.extraStay));
  if (c.seats !== undefined) row('Seats left', String(c.seats), r.soldOut ? 'Sold out' : String(r.seats ?? '—'));
  if (after) {
    row('True cost', inr(before.total), inr(after.total));
    row('Rank', `#${before.rank}`, `#${after.rank}`);
  }
  return rows;
}
