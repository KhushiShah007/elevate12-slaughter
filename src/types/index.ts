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
  status: 'confirmed' | 'suggested';
  bookedViaApp: boolean;
  simulated?: boolean; // prototype: confirmed without a real provider
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
}

export interface CompletedTripMemory {
  tripId: string;
  stampCity: string;
  stampCode: string;
  stampDate: Iso;
  memories: { caption: string; pastel: 'peach' | 'lavender' | 'mint' | 'butter' | 'sky' | 'rose' }[];
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
  answers: Partial<Record<keyof TravellerPreferences, string>>;
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

export interface RecoveryOption {
  id: string;
  title: string;
  trueCost: number;
  timeLost: string;
  why: string;
  recheck: { field: string; before: string; after: string; changed: boolean }[];
}

export interface Disruption {
  type: DisruptionType;
  headline: string;
  trigger: string;
  effects: CascadeEffect[];
  options: RecoveryOption[];
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
  lastSynced: Iso;
}

export interface FamilyPickup {
  tripId: string;
  pickerName: string;
  leaveHomeAt: string;
  meetPoint: string;
}

export type SyncTable = 'bookings' | 'documents' | 'journeyProgress' | 'preferences' | 'users';

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
