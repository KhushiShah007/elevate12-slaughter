import { describe, expect, it } from 'vitest';
import rules from '../../../server/config/refund-rules.json';
import { countdown, estimateRefund, followUpDue, transition, type FlightPolicy, type RefundRules } from '../refund';

const R = rules as unknown as RefundRules;
const now = new Date('2026-12-01T10:00:00Z');
const flight = (over: Partial<FlightPolicy> = {}): FlightPolicy => ({
  kind: 'flight',
  refundable: true,
  baseFareInr: 4000,
  taxesInr: 1200,
  convenienceFeeInr: 300,
  departAt: '2026-12-20T06:00:00Z',
  bookedAt: '2026-11-01T10:00:00Z',
  bookedDirect: false,
  domestic: true,
  ...over,
});

describe('flight refund estimates', () => {
  it('charges the tier fee, refunds taxes, keeps the convenience fee', () => {
    const e = estimateRefund(flight(), now, R);
    expect(e.feeInr).toBe(3000 + 300);
    expect(e.refundInr).toBe(4000 - 3000 + 1200);
    expect(e.days).toBe(7);
  });

  it('caps the fee at the base fare', () => {
    const e = estimateRefund(flight({ baseFareInr: 2000 }), now, R);
    expect(e.refundInr).toBe(1200); // base fully eaten, taxes back
  });

  it('refunds only taxes on a non-refundable fare', () => {
    expect(estimateRefund(flight({ refundable: false }), now, R).refundInr).toBe(1200);
  });

  it('gives a free look within 48 h of a direct booking far enough ahead', () => {
    const e = estimateRefund(flight({ bookedDirect: true, bookedAt: '2026-11-30T20:00:00Z' }), now, R);
    expect(e.refundInr).toBe(5200);
    expect(e.freeUntil).toBe('2026-12-02T20:00:00.000Z');
  });

  it('treats the last 2 hours as a no-show (taxes only)', () => {
    const e = estimateRefund(flight({ departAt: '2026-12-01T11:00:00Z' }), now, R);
    expect(e.refundInr).toBe(1200);
    expect(e.deadlinePassed).toBe(true);
  });

  it('agent bookings take longer; credit shell is instant', () => {
    expect(estimateRefund(flight(), now, R, 'agent').days).toBe(30);
    expect(estimateRefund(flight(), now, R, 'creditShell').method).toBe('creditShell');
  });
});

describe('stays and activities', () => {
  const stay = { kind: 'hotel' as const, totalInr: 9000, nights: 3, penaltyNights: 1, nonRefundable: false };
  it('is free before the deadline, one night after', () => {
    expect(estimateRefund({ ...stay, freeCancelUntil: '2026-12-03T12:00:00Z' }, now, R)).toMatchObject({ refundInr: 9000, feeInr: 0, deadlinePassed: false });
    expect(estimateRefund({ ...stay, freeCancelUntil: '2026-11-30T12:00:00Z' }, now, R)).toMatchObject({ refundInr: 6000, feeInr: 3000, deadlinePassed: true });
    expect(estimateRefund({ ...stay, freeCancelUntil: null, nonRefundable: true }, now, R).refundInr).toBe(0);
  });

  it('activities: free until 24 h before', () => {
    const act = { kind: 'experience' as const, totalInr: 1500, freeCancelHours: 24, nonRefundable: false };
    expect(estimateRefund({ ...act, startsAt: '2026-12-03T10:00:00Z' }, now, R).refundInr).toBe(1500);
    expect(estimateRefund({ ...act, startsAt: '2026-12-01T20:00:00Z' }, now, R).refundInr).toBe(0);
  });

  it('counts down', () => {
    expect(countdown('2026-12-03T14:30:00Z', now)).toBe('2d 4h');
    expect(countdown('2026-11-30T00:00:00Z', now)).toBe('');
  });
});

describe('cancellation state machine', () => {
  it('allows the happy path and is idempotent', () => {
    expect(transition('draft', 'quoted')).toEqual({ ok: true, changed: true });
    expect(transition('quoted', 'user_confirmed').ok).toBe(true);
    expect(transition('submitted', 'refunded').ok).toBe(true);
    expect(transition('submitted', 'submitted')).toEqual({ ok: true, changed: false });
  });

  it('refuses skipping confirmation and leaving a final state', () => {
    expect(transition('quoted', 'submitted').ok).toBe(false);
    expect(transition('refunded', 'disputed').ok).toBe(false);
    expect(transition('rejected', 'disputed').ok).toBe(true);
  });

  it('knows when a follow-up is due', () => {
    expect(followUpDue('submitted', '2026-11-27T10:00:00Z', now)).toBe(true);
    expect(followUpDue('submitted', '2026-11-30T10:00:00Z', now)).toBe(false);
    expect(followUpDue('processing', '2026-11-20T10:00:00Z', now)).toBe(true);
  });
});
