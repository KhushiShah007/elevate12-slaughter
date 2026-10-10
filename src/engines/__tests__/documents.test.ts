import { describe, expect, it } from 'vitest';
import { checkDocument } from '../documents';
import * as sample from '../../data/sampleTrips';
import { documents } from '../../data/sampleDocuments';
import type { TravelDocument } from '../../types';

const today = '2026-10-10';
const doc = (over: Partial<TravelDocument>): TravelDocument => ({
  id: 'x',
  tripId: null,
  kind: 'passport',
  title: 'Passport',
  holder: 'R',
  ref: 'Z',
  pages: 1,
  offline: true,
  ...over,
});
const check = (d: TravelDocument) => checkDocument(d, sample.trips, sample.flights, today);

describe('document checks', () => {
  it('warns when a passport expires within 6 months after an international trip', () => {
    // Japan trip ends 22 Oct 2026, so the passport must last until 22 Apr 2027.
    expect(check(doc({ expires: '2027-02-11' }))).toMatchObject({ level: 'warn', reason: 'passport-6m', tripTitle: 'Kyoto & Tokyo' });
    expect(check(doc({ expires: '2027-05-01' }))).toMatchObject({ level: 'ok' });
  });

  it('ignores the 6-month rule for domestic trips', () => {
    const trips = sample.trips.filter((t) => t.id === 't-goa');
    expect(checkDocument(doc({ expires: '2027-01-01' }), trips, sample.flights, today)).toMatchObject({ level: 'ok' });
  });

  it('flags a visa or insurance that ends before its trip does', () => {
    expect(check(doc({ kind: 'insurance', tripId: 't-japan', expires: '2026-10-20' }))).toMatchObject({ level: 'bad', reason: 'ends-before-trip' });
    expect(check(doc({ kind: 'visa', tripId: 't-japan', expires: '2027-01-14' }))).toMatchObject({ level: 'ok' });
    // Insurance ending the day after the trip is fine, not "expiring soon".
    expect(check(doc({ kind: 'insurance', tripId: 't-japan', expires: '2026-10-23' }))).toMatchObject({ level: 'ok' });
  });

  it('marks expired and soon-expiring documents, and skips ones with no date', () => {
    expect(check(doc({ kind: 'id', expires: '2026-09-01' }))).toMatchObject({ level: 'bad', reason: 'expired' });
    expect(check(doc({ kind: 'id', expires: '2026-10-25' }))).toMatchObject({ level: 'warn', reason: 'expiring-soon' });
    expect(check(doc({ kind: 'boarding-pass', expires: undefined }))).toBeNull();
  });

  it('the sample passport shows the 6-month warning in the demo', () => {
    expect(check(documents.find((d) => d.kind === 'passport')!)).toMatchObject({ reason: 'passport-6m' });
  });
});
