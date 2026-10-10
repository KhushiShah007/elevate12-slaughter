// Bundled SAMPLE data. Every screen that shows this is labelled "sample data".
// Flight numbers, prices and times are illustrative, not live.
import type {
  Accommodation,
  Booking,
  CompletedTripMemory,
  FamilyPickup,
  FlightStatus,
  Expense,
  Experience,
  Flight,
  ItineraryDay,
  ItineraryItem,
  JourneyStep,
  Restaurant,
  TransportBooking,
  Trip,
  User,
} from '../types';

export const sampleUser: User = {
  id: 'u1',
  name: 'Riya',
  phoneOrEmail: '+91 98200 00000',
  homeCity: 'Mumbai',
};

export const trips: Trip[] = [
  {
    id: 't-japan',
    title: 'Kyoto & Tokyo',
    from: 'Mumbai',
    to: 'Tokyo',
    startDate: '2026-10-14T03:30:00+05:30',
    endDate: '2026-10-22T22:00:00+05:30',
    status: 'upcoming',
    travellers: 2,
  },
  {
    id: 't-goa',
    title: 'Long weekend in Goa',
    from: 'Mumbai',
    to: 'Goa',
    startDate: '2026-11-20T09:00:00+05:30',
    endDate: '2026-11-23T20:00:00+05:30',
    status: 'upcoming',
    travellers: 4,
  },
  {
    id: 't-jaipur',
    title: 'Jaipur with Nani',
    from: 'Mumbai',
    to: 'Jaipur',
    startDate: '2026-03-06T07:00:00+05:30',
    endDate: '2026-03-10T21:00:00+05:30',
    status: 'completed',
    travellers: 3,
  },
  {
    id: 't-sg',
    title: 'Singapore for New Year',
    from: 'Mumbai',
    to: 'Singapore',
    startDate: '2025-12-29T01:00:00+05:30',
    endDate: '2026-01-03T23:00:00+05:30',
    status: 'completed',
    travellers: 2,
  },
  {
    id: 't-kochi',
    title: 'Monsoon in Kochi',
    from: 'Mumbai',
    to: 'Kochi',
    startDate: '2025-07-11T06:00:00+05:30',
    endDate: '2025-07-15T22:00:00+05:30',
    status: 'completed',
    travellers: 1,
  },
];

export const flights: Flight[] = [
  {
    id: 'f1',
    tripId: 't-japan',
    airline: 'Air India',
    flightNo: 'AI 865',
    fromCode: 'BOM',
    fromCity: 'Mumbai',
    toCode: 'DEL',
    toCity: 'Delhi',
    depart: '2026-10-14T06:10:00+05:30',
    arrive: '2026-10-14T08:20:00+05:30',
    terminal: 'T2',
    gate: '42B',
    seat: '14A',
    boarding: '2026-10-14T05:40:00+05:30',
    pnr: 'QX7H2M',
  },
  {
    id: 'f2',
    tripId: 't-japan',
    airline: 'Air India',
    flightNo: 'AI 306',
    fromCode: 'DEL',
    fromCity: 'Delhi',
    toCode: 'NRT',
    toCity: 'Tokyo',
    depart: '2026-10-14T11:40:00+05:30',
    arrive: '2026-10-14T23:10:00+09:00',
    terminal: 'T3',
    gate: '11',
    seat: '22K',
    boarding: '2026-10-14T11:00:00+05:30',
    pnr: 'QX7H2M',
  },
  {
    id: 'f3',
    tripId: 't-goa',
    airline: 'IndiGo',
    flightNo: '6E 5104',
    fromCode: 'BOM',
    fromCity: 'Mumbai',
    toCode: 'GOX',
    toCity: 'Goa',
    depart: '2026-11-20T09:00:00+05:30',
    arrive: '2026-11-20T10:15:00+05:30',
    terminal: 'T1',
    pnr: 'GA4K9P',
  },
];

// Live status is simulated in the prototype.
export const flightStatuses: FlightStatus[] = [
  { flightId: 'f1', tripId: 't-japan', delayMin: 0, preponedMin: 0, missed: false, source: 'sample', lastSynced: '2026-10-10T18:05:00+05:30' },
  { flightId: 'f2', tripId: 't-japan', delayMin: 0, preponedMin: 0, missed: false, source: 'sample', lastSynced: '2026-10-10T18:05:00+05:30' },
  { flightId: 'f3', tripId: 't-goa', delayMin: 0, preponedMin: 0, missed: false, source: 'sample', lastSynced: '2026-10-10T18:05:00+05:30' },
];

export const bookings: Booking[] = [
  { id: 'b1', tripId: 't-japan', kind: 'flight', title: 'AI 865 + AI 306 (2 adults)', amount: 68400, status: 'confirmed', bookedViaApp: true },
  { id: 'b2', tripId: 't-japan', kind: 'hotel', title: 'Ryokan Yoshida-sanso, Kyoto', amount: 42600, status: 'confirmed', bookedViaApp: true },
  { id: 'b3', tripId: 't-japan', kind: 'hotel', title: 'Hotel Gracery, Shinjuku', amount: 38900, status: 'confirmed', bookedViaApp: true },
  { id: 'b4', tripId: 't-japan', kind: 'transport', title: 'Home to BOM T2 cab', amount: 1450, status: 'confirmed', bookedViaApp: true },
  { id: 'b5', tripId: 't-japan', kind: 'experience', title: 'Tea ceremony in Uji', amount: 6200, status: 'suggested', bookedViaApp: true },
  { id: 'b6', tripId: 't-goa', kind: 'flight', title: '6E 5104 (4 adults)', amount: 11200, status: 'confirmed', bookedViaApp: true },
  { id: 'b7', tripId: 't-jaipur', kind: 'flight', title: 'BOM to JAI return (3 adults)', amount: 18500, status: 'confirmed', bookedViaApp: true },
  { id: 'b8', tripId: 't-sg', kind: 'flight', title: 'BOM to SIN return (2 adults)', amount: 52000, status: 'confirmed', bookedViaApp: true },
  { id: 'b9', tripId: 't-sg', kind: 'hotel', title: 'Marina hotel, 5 nights', amount: 44000, status: 'confirmed', bookedViaApp: false },
  { id: 'b10', tripId: 't-kochi', kind: 'hotel', title: 'Fort Kochi homestay', amount: 9800, status: 'confirmed', bookedViaApp: true },
];

export const accommodations: Accommodation[] = [
  { id: 'a1', tripId: 't-japan', name: 'Hotel Gracery', area: 'Shinjuku, Tokyo', checkIn: '2026-10-14T15:00:00+09:00', checkOut: '2026-10-18T11:00:00+09:00', nights: 4, amount: 38900, note: 'Late arrival guaranteed until 02:30', latestArrival: '2026-10-15T02:30:00+09:00', fromAirportMin: 90 },
  { id: 'a2', tripId: 't-japan', name: 'Ryokan Yoshida-sanso', area: 'Higashiyama, Kyoto', checkIn: '2026-10-18T15:00:00+09:00', checkOut: '2026-10-22T10:00:00+09:00', nights: 4, amount: 42600, note: 'Kaiseki dinner included, veg on request', latestArrival: '2026-10-18T22:00:00+09:00' },
];

export const transport: TransportBooking[] = [
  { id: 'tr1', tripId: 't-japan', mode: 'cab', title: 'Airport cab', from: 'Home, Bandra', to: 'BOM T2', at: '2026-10-14T03:30:00+05:30', amount: 1450, ref: 'CAB-22918' },
  { id: 'tr2', tripId: 't-japan', mode: 'train', title: 'Skyliner', from: 'Narita T2', to: 'Ueno', at: '2026-10-15T00:40:00+09:00', amount: 1650, ref: 'SKY-4410' },
  { id: 'tr3', tripId: 't-japan', mode: 'train', title: 'Shinkansen Nozomi', from: 'Tokyo', to: 'Kyoto', at: '2026-10-18T09:30:00+09:00', amount: 8900, ref: 'JR-77120' },
  { id: 'tr4', tripId: 't-japan', mode: 'metro', title: 'Suica card top-up', from: 'Any station', to: 'Tokyo metro', at: '2026-10-15T09:00:00+09:00', amount: 2600, ref: 'IC card' },
];

export const experiences: Experience[] = [
  { id: 'e1', tripId: 't-japan', title: 'Tea ceremony in Uji', area: 'Uji, Kyoto', duration: '2 h', amount: 6200, tag: 'Slow & cultural', interests: ['culture', 'food'] },
  { id: 'e2', tripId: 't-japan', title: 'Fushimi Inari at dawn', area: 'Fushimi, Kyoto', duration: '3 h', amount: 0, tag: 'Free · early start', interests: ['culture', 'nature'] },
  { id: 'e3', tripId: 't-japan', title: 'teamLab Planets', area: 'Toyosu, Tokyo', duration: '2 h', amount: 2900, tag: 'Book ahead', interests: ['culture', 'shopping'] },
  { id: 'e4', tripId: 't-japan', title: 'Nara deer park day trip', area: 'Nara', duration: 'Half day', amount: 1100, tag: 'Easy walking', interests: ['nature'] },
];

export const restaurants: Restaurant[] = [
  { id: 'r1', tripId: 't-japan', name: 'Shigetsu', area: 'Arashiyama, Kyoto', cuisine: 'Shojin ryori', veg: true, priceLevel: 2, note: 'Temple vegetarian set inside Tenryu-ji' },
  { id: 'r2', tripId: 't-japan', name: "T's Tantan", area: 'Tokyo Station', cuisine: 'Vegan ramen', veg: true, priceLevel: 1, note: 'Inside the ticket gates, Keiyo Street' },
  { id: 'r3', tripId: 't-japan', name: 'Ain Soph Journey', area: 'Shinjuku, Tokyo', cuisine: 'Vegan cafe', veg: true, priceLevel: 2, note: 'Famous soufflé pancakes' },
  { id: 'r4', tripId: 't-japan', name: 'Nishiki Market', area: 'Downtown Kyoto', cuisine: 'Street food', veg: false, priceLevel: 1, note: 'Ask for “niku nashi” (no meat)' },
];

export const itineraryDays: ItineraryDay[] = [
  { id: 'd1', tripId: 't-japan', date: '2026-10-14', title: 'Travel day' },
  { id: 'd2', tripId: 't-japan', date: '2026-10-15', title: 'Slow Shinjuku' },
  { id: 'd3', tripId: 't-japan', date: '2026-10-16', title: 'Art & bay' },
  { id: 'd4', tripId: 't-japan', date: '2026-10-18', title: 'Bullet train to Kyoto' },
];

export const itineraryItems: ItineraryItem[] = [
  { id: 'i1', tripId: 't-japan', dayId: 'd1', time: '06:10', title: 'AI 865 to Delhi', kind: 'flight' },
  { id: 'i2', tripId: 't-japan', dayId: 'd1', time: '11:40', title: 'AI 306 to Tokyo Narita', kind: 'flight' },
  { id: 'i3', tripId: 't-japan', dayId: 'd1', time: '23:59', title: 'Check in, Hotel Gracery', kind: 'stay' },
  { id: 'i4', tripId: 't-japan', dayId: 'd2', time: '10:00', title: 'Shinjuku Gyoen garden walk', kind: 'see' },
  { id: 'i5', tripId: 't-japan', dayId: 'd2', time: '13:00', title: 'Lunch at Ain Soph Journey', kind: 'food' },
  { id: 'i6', tripId: 't-japan', dayId: 'd2', time: '17:30', title: 'Omoide Yokocho lanes', kind: 'see' },
  { id: 'i7', tripId: 't-japan', dayId: 'd3', time: '10:30', title: 'teamLab Planets', kind: 'see' },
  { id: 'i8', tripId: 't-japan', dayId: 'd3', time: '13:30', title: "T's Tantan ramen", kind: 'food' },
  { id: 'i9', tripId: 't-japan', dayId: 'd4', time: '09:30', title: 'Nozomi to Kyoto', kind: 'move' },
  { id: 'i10', tripId: 't-japan', dayId: 'd4', time: '15:00', title: 'Ryokan check-in', kind: 'stay' },
];

// Ticket price is only part of it: the true journey cost includes everything below.
export const expenses: Expense[] = [
  { id: 'x1', tripId: 't-japan', label: 'Flights (2 adults)', amount: 68400, category: 'tickets' },
  { id: 'x2', tripId: 't-japan', label: 'Hotels, 8 nights', amount: 81500, category: 'stay' },
  { id: 'x3', tripId: 't-japan', label: 'Cabs, trains, Suica', amount: 14600, category: 'transport' },
  { id: 'x4', tripId: 't-japan', label: 'Food (estimate)', amount: 24000, category: 'food' },
  { id: 'x5', tripId: 't-japan', label: 'Visa, forex markup, insurance', amount: 7300, category: 'fees' },
  { id: 'x6', tripId: 't-jaipur', label: 'Flights', amount: 18500, category: 'tickets' },
  { id: 'x7', tripId: 't-jaipur', label: 'Haveli stay', amount: 16400, category: 'stay' },
  { id: 'x8', tripId: 't-jaipur', label: 'Food & bazaars', amount: 9200, category: 'food' },
];

export const completedMemories: CompletedTripMemory[] = [
  {
    tripId: 't-jaipur',
    stampCity: 'Jaipur',
    stampCode: 'JAI',
    stampDate: '2026-03-06',
    memories: [
      { caption: 'Nani at Amer Fort', pastel: 'peach', photo: 'amer-fort' },
      { caption: 'Pyaaz kachori, 8 am', pastel: 'butter', photo: 'kachori' },
      { caption: 'Hawa Mahal at dusk', pastel: 'rose', photo: 'hawa-mahal' },
    ],
  },
  {
    tripId: 't-sg',
    stampCity: 'Singapore',
    stampCode: 'SIN',
    stampDate: '2025-12-29',
    memories: [
      { caption: 'Fireworks at Marina Bay', pastel: 'lavender', photo: 'marina-bay' },
      { caption: 'Gardens by the Bay', pastel: 'mint', photo: 'gardens-by-the-bay' },
    ],
  },
  {
    tripId: 't-kochi',
    stampCity: 'Kochi',
    stampCode: 'COK',
    stampDate: '2025-07-11',
    memories: [
      { caption: 'Chinese fishing nets', pastel: 'sky', photo: 'fishing-nets' },
      { caption: 'Rain on the backwaters', pastel: 'mint', photo: 'backwaters' },
    ],
  },
];

export const journeySteps: JourneyStep[] = [
  { id: 's1', tripId: 't-japan', label: 'Leave home', hint: 'Cab CAB-22918 picks you up', at: '03:30' },
  { id: 's2', tripId: 't-japan', label: 'Reach airport', hint: 'BOM Terminal 2, Gate 8 entry', at: '04:20' },
  { id: 's3', tripId: 't-japan', label: 'Check-in', hint: 'Air India counters, row D', at: '04:30' },
  { id: 's4', tripId: 't-japan', label: 'Bag drop', hint: '2 bags · 23 kg each', at: '04:45' },
  { id: 's5', tripId: 't-japan', label: 'Security', hint: 'Keep laptop and liquids out', at: '05:00' },
  { id: 's6', tripId: 't-japan', label: 'Gate', hint: 'Gate 42B · 12 min walk', at: '05:30' },
  { id: 's7', tripId: 't-japan', label: 'Boarding', hint: 'Zone 3 · seat 14A', at: '05:40' },
];

// Family pickup at the destination. The leave-home time is computed from the arrival.
export const familyPickups: FamilyPickup[] = [{
  tripId: 't-japan',
  pickerName: 'Meera',
  travelMin: 75,
  meetPoint: 'Narita Terminal 2 · Arrivals Gate B',
}];

// Places close enough to a city for a day out, used by the itinerary builder.
export const nearbyPlaces: Record<string, string[]> = {
  Kyoto: ['Nara', 'Uji', 'Fushimi', 'Arashiyama'],
  Tokyo: ['Toyosu', 'Shinjuku', 'Ueno'],
};
