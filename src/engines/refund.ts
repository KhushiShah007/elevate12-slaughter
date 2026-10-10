// Cancellation policies, refund estimates and the cancellation state machine.
// Pure functions, shared by the app and the server. Every number is an estimate.

export type PayMethod = 'card' | 'upi' | 'netbanking' | 'cash' | 'agent' | 'creditShell';

export interface RefundRules {
  verifyLabel: string;
  freeLook: { hours: number; minDaysBeforeDomestic: number; minDaysBeforeInternational: number; onlyDirectBookings: boolean };
  refundDays: Record<PayMethod, number>;
  taxesAlwaysRefundable: boolean;
  feeCappedAtBaseFare: boolean;
  defaultFlightFeeTiers: { hoursBeforeAtLeast: number; feeInr: number }[];
  noShowHoursBefore: number;
}

export interface FlightPolicy {
  kind: 'flight';
  refundable: boolean;
  baseFareInr: number;
  taxesInr: number; // statutory taxes and airport fees (UDF, PSF…)
  convenienceFeeInr: number; // charged by the booking site, usually not refunded
  feeTiers?: { hoursBeforeAtLeast: number; feeInr: number }[];
  departAt: string; // ISO
  bookedAt: string; // ISO
  bookedDirect: boolean; // on the airline's own site or app
  domestic: boolean;
}

export interface StayPolicy {
  kind: 'hotel';
  totalInr: number;
  nights: number;
  freeCancelUntil: string | null; // ISO; null = no free cancellation
  penaltyNights: number; // charged after the deadline
  nonRefundable: boolean;
}

export interface ActivityPolicy {
  kind: 'experience' | 'transport';
  totalInr: number;
  startsAt: string; // ISO
  freeCancelHours: number; // e.g. 24
  nonRefundable: boolean;
}

export type CancellationPolicy = FlightPolicy | StayPolicy | ActivityPolicy;

export interface RefundEstimate {
  refundInr: number;
  feeInr: number;
  components: { label: string; amountInr: number }[];
  method: 'original' | 'creditShell';
  days: number; // expected working days to receive it
  deadlinePassed: boolean;
  freeUntil: string | null; // when cancelling becomes costly (for a countdown)
  notes: string[];
}

const HOUR = 3_600_000;
const hoursUntil = (iso: string, now: Date) => (Date.parse(iso) - now.getTime()) / HOUR;

export function estimateRefund(policy: CancellationPolicy, now: Date, rules: RefundRules, method: PayMethod = 'card'): RefundEstimate {
  const days = rules.refundDays[method] ?? 7;
  const refundMethod = method === 'creditShell' ? 'creditShell' : 'original';

  if (policy.kind === 'flight') {
    const total = policy.baseFareInr + policy.taxesInr + policy.convenienceFeeInr;
    const hours = hoursUntil(policy.departAt, now);
    const notes = [rules.verifyLabel];
    // Free look: within 48 h of booking a direct ticket, if departure is far enough away.
    const minDays = policy.domestic ? rules.freeLook.minDaysBeforeDomestic : rules.freeLook.minDaysBeforeInternational;
    const freeLookEnds = new Date(Date.parse(policy.bookedAt) + rules.freeLook.hours * HOUR).toISOString();
    const inFreeLook = (!rules.freeLook.onlyDirectBookings || policy.bookedDirect) && now.toISOString() < freeLookEnds && hours >= minDays * 24;
    if (inFreeLook) {
      notes.push('Free-look period: cancel without a fee (a convenience fee may still apply).');
      return {
        refundInr: policy.baseFareInr + policy.taxesInr,
        feeInr: policy.convenienceFeeInr,
        components: [
          { label: 'Base fare', amountInr: policy.baseFareInr },
          { label: 'Taxes and airport fees', amountInr: policy.taxesInr },
          { label: 'Convenience fee (not refunded)', amountInr: -policy.convenienceFeeInr },
        ],
        method: refundMethod,
        days,
        deadlinePassed: false,
        freeUntil: freeLookEnds,
        notes,
      };
    }
    const taxes = rules.taxesAlwaysRefundable ? policy.taxesInr : 0;
    if (hours < rules.noShowHoursBefore) {
      notes.push('Too close to departure: treated as a no-show. Taxes and airport fees are still refundable on request.');
      return { refundInr: taxes, feeInr: total - taxes, components: [{ label: 'Taxes and airport fees', amountInr: taxes }], method: refundMethod, days, deadlinePassed: true, freeUntil: null, notes };
    }
    if (!policy.refundable) {
      notes.push('Non-refundable fare: only taxes and airport fees come back.');
      return {
        refundInr: taxes,
        feeInr: total - taxes,
        components: [
          { label: 'Base fare (non-refundable)', amountInr: 0 },
          { label: 'Taxes and airport fees', amountInr: taxes },
        ],
        method: refundMethod,
        days,
        deadlinePassed: false,
        freeUntil: null,
        notes,
      };
    }
    const tiers = [...(policy.feeTiers ?? rules.defaultFlightFeeTiers)].sort((a, b) => b.hoursBeforeAtLeast - a.hoursBeforeAtLeast);
    let fee = (tiers.find((t) => hours >= t.hoursBeforeAtLeast) ?? tiers[tiers.length - 1]).feeInr;
    if (rules.feeCappedAtBaseFare) fee = Math.min(fee, policy.baseFareInr);
    const baseBack = policy.baseFareInr - fee;
    notes.push('Cancellation fee depends on how close to departure you cancel.');
    return {
      refundInr: baseBack + taxes,
      feeInr: fee + policy.convenienceFeeInr,
      components: [
        { label: 'Base fare', amountInr: policy.baseFareInr },
        { label: 'Airline cancellation fee', amountInr: -fee },
        { label: 'Taxes and airport fees', amountInr: taxes },
        { label: 'Convenience fee (not refunded)', amountInr: -policy.convenienceFeeInr },
      ],
      method: refundMethod,
      days,
      deadlinePassed: false,
      freeUntil: null,
      notes,
    };
  }

  if (policy.kind === 'hotel') {
    const nightly = policy.totalInr / Math.max(1, policy.nights);
    if (policy.nonRefundable) {
      return { refundInr: 0, feeInr: policy.totalInr, components: [{ label: 'Non-refundable rate', amountInr: 0 }], method: refundMethod, days, deadlinePassed: true, freeUntil: null, notes: ['This rate cannot be refunded.'] };
    }
    const free = policy.freeCancelUntil && now.toISOString() < policy.freeCancelUntil;
    if (free) {
      return { refundInr: policy.totalInr, feeInr: 0, components: [{ label: 'Full stay', amountInr: policy.totalInr }], method: refundMethod, days, deadlinePassed: false, freeUntil: policy.freeCancelUntil, notes: ['Free cancellation is still open.'] };
    }
    const fee = Math.round(Math.min(policy.totalInr, nightly * policy.penaltyNights));
    return {
      refundInr: policy.totalInr - fee,
      feeInr: fee,
      components: [
        { label: 'Stay', amountInr: policy.totalInr },
        { label: `Penalty (${policy.penaltyNights} night${policy.penaltyNights === 1 ? '' : 's'})`, amountInr: -fee },
      ],
      method: refundMethod,
      days,
      deadlinePassed: true,
      freeUntil: null,
      notes: ['The free cancellation deadline has passed.'],
    };
  }

  const freeUntil = new Date(Date.parse(policy.startsAt) - policy.freeCancelHours * HOUR).toISOString();
  if (policy.nonRefundable) return { refundInr: 0, feeInr: policy.totalInr, components: [{ label: 'Non-refundable', amountInr: 0 }], method: refundMethod, days, deadlinePassed: true, freeUntil: null, notes: ['This booking cannot be refunded.'] };
  if (now.toISOString() < freeUntil) return { refundInr: policy.totalInr, feeInr: 0, components: [{ label: 'Full price', amountInr: policy.totalInr }], method: refundMethod, days, deadlinePassed: false, freeUntil, notes: [`Free cancellation up to ${policy.freeCancelHours} h before.`] };
  return { refundInr: 0, feeInr: policy.totalInr, components: [{ label: 'Past the free cancellation time', amountInr: 0 }], method: refundMethod, days, deadlinePassed: true, freeUntil: null, notes: ['Too late for a refund under this policy. You can still ask the provider.'] };
}

/** "2d 4h", "35m": time left before a deadline (empty when passed). */
export function countdown(untilIso: string | null, now: Date): string {
  if (!untilIso) return '';
  const ms = Date.parse(untilIso) - now.getTime();
  if (ms <= 0) return '';
  const m = Math.floor(ms / 60_000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m % 60}m` : `${m}m`;
}

// ---------- State machine ----------

export const CANCEL_STATES = ['draft', 'quoted', 'user_confirmed', 'submitted', 'acknowledged', 'processing', 'refunded', 'partially_refunded', 'rejected', 'disputed'] as const;
export type CancelState = (typeof CANCEL_STATES)[number];

const NEXT: Record<CancelState, CancelState[]> = {
  draft: ['quoted'],
  quoted: ['quoted', 'user_confirmed'],
  user_confirmed: ['submitted'],
  submitted: ['acknowledged', 'processing', 'refunded', 'partially_refunded', 'rejected'],
  acknowledged: ['processing', 'refunded', 'partially_refunded', 'rejected'],
  processing: ['refunded', 'partially_refunded', 'rejected'],
  refunded: [],
  partially_refunded: ['disputed', 'refunded'],
  rejected: ['disputed'],
  disputed: ['refunded', 'partially_refunded', 'rejected'],
};

export const FINAL_STATES: CancelState[] = ['refunded'];

/** The next state, or an error. Moving to the state it is already in is a no-op (idempotent). */
export function transition(from: CancelState, to: CancelState): { ok: true; changed: boolean } | { ok: false; error: string } {
  if (from === to) return { ok: true, changed: false };
  if (!NEXT[from].includes(to)) return { ok: false, error: `Cannot go from ${from.replace('_', ' ')} to ${to.replace('_', ' ')}.` };
  return { ok: true, changed: true };
}

/** When a follow-up is due: 3 days without acknowledgement, 7 days in processing. */
export function followUpDue(state: CancelState, since: string, now: Date): boolean {
  const days = (now.getTime() - Date.parse(since)) / 86_400_000;
  return (state === 'submitted' && days >= 3) || (state === 'acknowledged' && days >= 7) || (state === 'processing' && days >= 7);
}

/** Where to go next when a refund is overdue, in order. */
export const ESCALATION_LADDER = [
  { step: 'follow-up', title: 'Follow up with the provider', url: null },
  { step: 'grievance', title: "The airline's grievance officer (listed on its website)", url: null },
  { step: 'airsewa', title: 'DGCA AirSewa (flights)', url: 'https://airsewa.gov.in' },
  { step: 'nch', title: 'National Consumer Helpline (call 1915)', url: 'https://consumerhelpline.gov.in' },
  { step: 'bank', title: 'Dispute the charge with your card bank (chargeback)', url: null },
] as const;
