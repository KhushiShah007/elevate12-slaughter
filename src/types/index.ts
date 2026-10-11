// The Voyage data model. Every trip-owned record carries tripId.
// Goal 2 stores these in Dexie; for now they come from src/data.

export type Iso = string; // ISO date-time, e.g. 2026-10-14T06:10:00+05:30
export type RiskLevel = 'ok' | 'warn' | 'bad';
export type TripStatus = 'upcoming' | 'active' | 'completed';

export interface User {
  id: string;
  name: string;
  phoneOrEmail: string;
  homeCity: string;
}

export interface Trip {
  id: string;
  title: string;
  from: string; // city
  to: string;
  startDate: Iso;
  endDate: Iso;
  status: TripStatus;
  travellers: number;
  /** Bundled demo trip (not the traveller's own). */
  sample?: boolean;
  destinationSlug?: string | null;
  budgetInr?: number | null;
  /** Shares of the budget per category (travel, stay, food, local, activities, buffer). */
  budgetSplit?: Partial<Record<'travel' | 'stay' | 'food' | 'local' | 'activities' | 'buffer', number>>;
  createdAt?: Iso;
  rev?: number;
}

export interface Flight {
  id: string;
  tripId: string;
  airline: string;
  flightNo: string;
  fromCode: string;
  fromCity: string;
  toCode: string;
  toCity: string;
  depart: Iso;
  arrive: Iso;
  terminal: string;
  gate?: string;
  seat?: string;
  boarding?: Iso;
  pnr: string;
}

export type BookingKind = 'flight' | 'hotel' | 'transport' | 'experience';

export interface Booking {
  id: string;
  tripId: string;
  kind: BookingKind;
  title: string;
  amount: number; // INR
  status: 'confirmed' | 'suggested' | 'cancelled';
  /** Money back after a cancellation (INR), once known. */
  refundInr?: number;
  /** Paid in Voyage: the server's booking id (for receipts and refunds). */
  serverBookingId?: string;
  pointsUsed?: number;
  /** Cancellation policy (see engines/refund). */
  policy?: Record<string, unknown>;
  startsAt?: string;
  pnr?: string;
  provider?: string;
  /** Open cancellation request, if any. */
  cancellationId?: string;
  bookedViaApp: boolean;
  simulated?: boolean; // prototype: confirmed without a real provider
  recoveryFor?: string; // which disruption this booking fixes (so it is not booked twice)
  sample?: boolean; // part of the bundled demo trip: never earns the traveller points
  /** Saved options: where the price came from and how to book it. */
  details?: { provider: string; live: boolean; priceIsEstimate: boolean; priceRange?: [number, number] | null; bookUrl?: string; summary?: string; lat?: number | null; lon?: number | null };
  rev?: number;
}

export type DocumentKind = 'passport' | 'visa' | 'boarding-pass' | 'insurance' | 'hotel' | 'id' | 'other';

export interface TravelDocument {
  id: string;
  tripId: string | null; // null = not tied to a trip (e.g. passport)
  kind: DocumentKind;
  title: string;
  holder: string;
  ref: string;
  expires?: Iso;
  pages: number;
  offline: boolean;
  hasFile?: boolean; // a real PDF is stored on this phone (scans)
  /** Stored (encrypted) on the account; opened through a short-lived link. */
  remote?: boolean;
  mime?: string;
  /** Sensitive details burnt out of a stored copy (section 11). */
  maskStatus?: 'none' | 'masked' | 'nothing_found';
  originalDeleted?: boolean;
  rev?: number;
}

export interface Accommodation {
  id: string;
  tripId: string;
  name: string;
  area: string;
  checkIn: Iso;
  checkOut: Iso;
  nights: number;
  amount: number;
  note: string;
  latestArrival?: Iso; // after this the hotel may mark a no-show
  fromAirportMin?: number; // travel time from the arrival airport, for the first stay
}

export interface TransportBooking {
  id: string;
  tripId: string;
  mode: 'cab' | 'train' | 'metro' | 'bus';
  title: string;
  from: string;
  to: string;
  at: Iso;
  amount: number;
  ref: string;
}

export interface Experience {
  id: string;
  tripId: string;
  title: string;
  area: string;
  duration: string;
  amount: number;
  tag: string;
  interests?: string[]; // culture | food | nature | shopping, for persona matching
}

export interface Restaurant {
  id: string;
  tripId: string;
  name: string;
  area: string;
  cuisine: string;
  veg: boolean;
  priceLevel: 1 | 2 | 3;
  note: string;
}

export interface ItineraryItem {
  id: string;
  tripId: string;
  dayId: string;
  time: string;
  title: string;
  kind: 'flight' | 'stay' | 'food' | 'see' | 'move';
}

export interface ItineraryDay {
  id: string;
  tripId: string;
  date: Iso;
  title: string;
}

export interface Expense {
  id: string;
  tripId: string;
  label: string;
  amount: number;
  category: 'tickets' | 'stay' | 'transport' | 'food' | 'fees' | 'other';
  date?: string; // yyyy-mm-dd
  rev?: number;
}

export interface CompletedTripMemory {
  tripId: string;
  stampCity: string;
  stampCode: string;
  stampDate: Iso;
  /** photo: key into the bundled photo set (src/data/photos.json). */
  memories: { caption: string; pastel: 'peach' | 'lavender' | 'mint' | 'butter' | 'sky' | 'rose'; photo?: string }[];
}

export interface TravellerPreferences {
  style: string;
  interests: string[];
  pace: string;
  budget: string;
  food: string;
  mix: string;
}

/** Saved quiz answers for a user; feeds persona and itinerary. */
export interface PreferencesRecord {
  userId: string;
  answers: Partial<Record<keyof TravellerPreferences, string>>; // option value, or 'other'
  notes?: Partial<Record<keyof TravellerPreferences, string>>; // what the traveller typed for 'other'
  updatedAt: Iso;
  rev?: number;
}

export interface JourneyStep {
  id: string;
  tripId: string;
  label: string;
  hint: string;
  at: string;
}

export type DisruptionType = 'connecting' | 'delay' | 'preponed' | 'layover' | 'missed';

export interface CascadeEffect {
  id: string;
  label: string;
  detail: string;
  level: RiskLevel;
  icon: 'plane' | 'hotel' | 'car' | 'family' | 'coffee' | 'clock';
}

/** A possible fix for a disruption, with the raw facts the ranking engine needs. */
export interface RecoveryCandidate {
  id: string;
  tripId: string;
  appliesTo: DisruptionType[];
  title: string;
  provider: string;
  kind: 'flight' | 'stay' | 'ground' | 'advice';
  arrive?: Iso; // new final arrival, for options that change the flight
  timeLostMin?: number; // for options that do not change the arrival
  farePerPerson: number; // new money for tickets, per traveller
  extraStay: number; // new hotel spend
  extraTransport: number; // new ground transport spend
  fees: number;
  seats?: number; // seats left, when it matters
  risk?: string; // e.g. a tight onward connection
  note: string; // the main fact behind this option, used in its reason
}

/** What a recheck with the provider found. */
export interface RecheckResult {
  candidateId: string;
  farePerPerson: number;
  extraStay: number;
  seats?: number;
  soldOut: boolean;
  checkedAt: Iso;
}

/** What the cascade engine works out from one changed event. */
export interface CascadeResult {
  headline: string;
  trigger: string;
  effects: CascadeEffect[];
  brokenAt: string | null; // flight id of a connection that breaks
  newArrival: Iso | null; // null when it depends on a new flight
}

export interface LoyaltyEntry {
  bookingId: string;
  tripId: string;
  title: string;
  amount: number;
  points: number;
  simulated: boolean;
}

/** A step the traveller confirmed by hand on the airport timeline. */
export interface JourneyProgress {
  id: string; // tripId:stepId
  tripId: string;
  stepId: string;
  doneAt: Iso;
  rev?: number;
}

/** Cached flight status. Always shown with its lastSynced time. */
export interface FlightStatus {
  flightId: string;
  tripId: string;
  delayMin: number;
  preponedMin: number;
  missed: boolean;
  source: 'sample' | 'simulated' | 'reported'; // never shown as live airline data
  lastSynced: Iso;
}

export interface FamilyPickup {
  tripId: string;
  pickerName: string;
  travelMin: number; // their home to the arrival airport
  meetPoint: string;
}

export type SyncTable =
  | 'trips'
  | 'flights'
  | 'packingLists'
  | 'bookings'
  | 'documents'
  | 'journeyProgress'
  | 'preferences'
  | 'users'
  | 'expenses'
  | 'accommodations'
  | 'transport'
  | 'experiences'
  | 'restaurants'
  | 'itineraryDays'
  | 'itineraryItems';

/** One offline change waiting to reach the server. */
export interface SyncEntry {
  seq?: number;
  key: string; // idempotency key: the server applies each key at most once
  table: SyncTable;
  recordId: string;
  op: 'put' | 'delete';
  payload: unknown;
  baseRev: number; // server revision this change was made on top of
  createdAt: Iso;
  status: 'pending' | 'conflict' | 'done';
  serverPayload?: unknown; // the other version, when status is 'conflict'
  serverRev?: number;
  label: string; // human description for the conflict sheet
}
