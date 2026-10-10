import { writeAndQueue } from '../syncQueue';
import { createTrip } from './trips';
import { api } from '../../api/client';
import { loadDestinations } from '../../hooks/useDestinations';
import type { Accommodation, Booking, Flight } from '../../types';

// Turn a pasted booking (already read and checked by the server) into a trip with its
// flight or stay. Only details found in the pasted text are used.

export interface ParsedBooking {
  kind: 'flight' | 'hotel' | 'unknown';
  airline: string | null;
  flightNo: string | null;
  from: string | null;
  to: string | null;
  departDate: string | null;
  departTime: string | null;
  arriveDate: string | null;
  arriveTime: string | null;
  pnr: string | null;
  hotelName: string | null;
  checkIn: string | null;
  checkOut: string | null;
  totalInr: number | null;
  travellers: number | null;
}

interface Airport {
  iata: string;
  city: string;
  tz: string | null;
}

async function airport(code: string): Promise<Airport | null> {
  const { airports } = await api<{ airports: Airport[] }>('GET', `/airports?q=${code}`);
  return airports.find((a) => a.iata === code) ?? null;
}

/** "+05:30" for a time zone on a date (falls back to India time). */
export function offsetFor(tz: string | null, date: string): string {
  try {
    const name = new Intl.DateTimeFormat('en-US', { timeZone: tz ?? 'Asia/Kolkata', timeZoneName: 'longOffset' })
      .formatToParts(new Date(`${date}T12:00:00Z`))
      .find((p) => p.type === 'timeZoneName')?.value;
    const m = name?.match(/GMT([+-]\d{2}):?(\d{2})?/);
    return m ? `${m[1]}:${m[2] ?? '00'}` : '+00:00';
  } catch {
    return '+05:30';
  }
}

const nightsBetween = (a: string, b: string) => Math.max(1, Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000));

/** What is still missing before a trip can be made from this booking. */
export function missingFor(b: ParsedBooking): string[] {
  if (b.kind === 'flight') return [!b.from && 'from airport', !b.to && 'to airport', !b.departDate && 'travel date'].filter(Boolean) as string[];
  if (b.kind === 'hotel') return [!b.checkIn && 'check-in date', !b.checkOut && 'check-out date'].filter(Boolean) as string[];
  return ['booking details'];
}

export async function tripFromBooking(b: ParsedBooking, pastedText: string) {
  const travellers = b.travellers ?? 1;

  if (b.kind === 'flight') {
    const [from, to] = await Promise.all([airport(b.from!), airport(b.to!)]);
    const fromCity = from?.city ?? b.from!;
    const toCity = to?.city ?? b.to!;
    const trip = await createTrip({
      title: `${toCity} trip`,
      from: fromCity,
      to: toCity,
      startDate: b.departDate!,
      endDate: b.arriveDate && b.arriveDate >= b.departDate! ? b.arriveDate : b.departDate!,
      travellers,
    });
    // A flight leg only when both times are known: the timeline must not guess.
    if (b.departTime && b.arriveTime) {
      const arriveDate = b.arriveDate ?? b.departDate!;
      const flight: Flight = {
        id: `fl-${crypto.randomUUID()}`,
        tripId: trip.id,
        airline: b.airline ?? b.flightNo?.split(' ')[0] ?? '',
        flightNo: b.flightNo ?? '',
        fromCode: b.from!,
        fromCity,
        toCode: b.to!,
        toCity,
        depart: `${b.departDate}T${b.departTime}:00${offsetFor(from?.tz ?? null, b.departDate!)}`,
        arrive: `${arriveDate}T${b.arriveTime}:00${offsetFor(to?.tz ?? null, arriveDate)}`,
        terminal: '',
        pnr: b.pnr ?? '',
      };
      await writeAndQueue('flights', flight.id, flight, `Flight ${flight.flightNo} added from booking`);
    }
    if (b.totalInr) await saveBooked(trip.id, 'flight', `${b.flightNo ?? 'Flight'} ${b.from} → ${b.to}`, b.totalInr);
    return trip;
  }

  // Hotel: find the city in the text (from the destination catalogue) if we can.
  const list = await loadDestinations().catch(() => []);
  const lower = pastedText.toLowerCase();
  const dest = list.find((d) => lower.includes(d.name.toLowerCase()));
  const trip = await createTrip({
    title: dest ? `${dest.name} trip` : (b.hotelName ?? 'New trip'),
    from: '',
    to: dest?.name ?? b.hotelName ?? 'Stay',
    destinationSlug: dest?.slug ?? null,
    startDate: b.checkIn!,
    endDate: b.checkOut!,
    travellers,
  });
  const stay: Accommodation = {
    id: `st-${crypto.randomUUID()}`,
    tripId: trip.id,
    name: b.hotelName ?? 'Your stay',
    area: dest?.name ?? '',
    checkIn: b.checkIn!,
    checkOut: b.checkOut!,
    nights: nightsBetween(b.checkIn!, b.checkOut!),
    amount: b.totalInr ?? 0,
    note: b.pnr ? `Booking ref ${b.pnr}` : '',
  };
  await writeAndQueue('accommodations', stay.id, stay, `Stay ${stay.name} added from booking`);
  if (b.totalInr) await saveBooked(trip.id, 'hotel', stay.name, b.totalInr);
  return trip;
}

/** Paid elsewhere: recorded for the budget, never as in-app spend (no points). */
async function saveBooked(tripId: string, kind: Booking['kind'], title: string, amount: number) {
  const booking: Booking = { id: `bk-${crypto.randomUUID()}`, tripId, kind, title, amount, status: 'confirmed', bookedViaApp: false };
  await writeAndQueue('bookings', booking.id, booking, `Booked elsewhere: ${title}`);
}
