import type { Flight, RiskLevel, TravelDocument, Trip } from '../types';

// Plain rules for whether a document is good for the trips ahead.

/** Many countries refuse entry if the passport expires within 6 months of leaving. */
export const PASSPORT_MARGIN_MONTHS = 6;
export const EXPIRING_SOON_DAYS = 30;

// Indian airports in the sample data; a trip that flies elsewhere is international.
export const INDIAN_AIRPORTS = new Set(['BOM', 'DEL', 'BLR', 'MAA', 'CCU', 'HYD', 'GOI', 'GOX', 'JAI', 'COK', 'AMD', 'PNQ', 'LKO', 'ATQ', 'IXC', 'TRV', 'GAU', 'SXR', 'VNS']);

export type DocCheck =
  | { level: 'ok'; reason: 'valid'; date: string }
  | { level: 'bad'; reason: 'expired'; date: string }
  | { level: 'warn'; reason: 'passport-6m'; date: string; tripTitle: string }
  | { level: 'bad'; reason: 'ends-before-trip'; date: string; tripTitle: string }
  | { level: 'warn'; reason: 'expiring-soon'; date: string }
  | null; // no expiry date to check

const day = (iso: string) => iso.slice(0, 10);

function addMonths(date: string, months: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + months);
  return d.toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isInternational(trip: Trip, flights: Flight[]): boolean {
  return flights.some((f) => f.tripId === trip.id && (!INDIAN_AIRPORTS.has(f.toCode) || !INDIAN_AIRPORTS.has(f.fromCode)));
}

/**
 * Check one document against today and the upcoming trips.
 * - Expired: red.
 * - Passport: must stay valid 6 months after every upcoming international trip ends.
 * - Visa and insurance for a trip: must cover the whole trip.
 * - Anything else expiring within 30 days: amber.
 */
export function checkDocument(doc: TravelDocument, trips: Trip[], flights: Flight[], today: string): DocCheck {
  if (!doc.expires) return null;
  const expires = day(doc.expires);
  if (expires < today) return { level: 'bad', reason: 'expired', date: expires };

  const upcoming = trips.filter((t) => t.status !== 'completed' && day(t.endDate) >= today);

  if (doc.kind === 'passport') {
    for (const trip of upcoming.filter((t) => isInternational(t, flights))) {
      if (expires < addMonths(day(trip.endDate), PASSPORT_MARGIN_MONTHS)) {
        return { level: 'warn', reason: 'passport-6m', date: expires, tripTitle: trip.title };
      }
    }
  }

  if ((doc.kind === 'visa' || doc.kind === 'insurance') && doc.tripId) {
    const trip = upcoming.find((t) => t.id === doc.tripId);
    if (trip && expires < day(trip.endDate)) return { level: 'bad', reason: 'ends-before-trip', date: expires, tripTitle: trip.title };
    // Trip insurance or a visa is meant to end soon after its trip: covering it is enough.
    if (trip) return { level: 'ok', reason: 'valid', date: expires };
  }

  if (expires <= addDays(today, EXPIRING_SOON_DAYS)) return { level: 'warn', reason: 'expiring-soon', date: expires };
  return { level: 'ok', reason: 'valid', date: expires };
}

export const needsAttention = (c: DocCheck): c is Exclude<DocCheck, null> & { level: Exclude<RiskLevel, 'ok'> } => !!c && c.level !== 'ok';
