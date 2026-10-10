import Dexie, { type Table } from 'dexie';
import type {
  Accommodation,
  Booking,
  CompletedTripMemory,
  Expense,
  Experience,
  FamilyPickup,
  Flight,
  FlightStatus,
  ItineraryDay,
  ItineraryItem,
  JourneyProgress,
  JourneyStep,
  PreferencesRecord,
  Restaurant,
  SyncEntry,
  TransportBooking,
  TravelDocument,
  Trip,
  User,
} from '../types';

export interface Meta {
  key: 'seededAt' | 'dataVersion' | 'currentUserId' | 'lastSyncedAt';
  value: string;
}

/** Everything Voyage knows lives here, on the device. Every trip record carries tripId. */
export class VoyageDB extends Dexie {
  users!: Table<User, string>;
  preferences!: Table<PreferencesRecord, string>;
  trips!: Table<Trip, string>;
  flights!: Table<Flight, string>;
  flightStatus!: Table<FlightStatus, string>;
  bookings!: Table<Booking, string>;
  documents!: Table<TravelDocument, string>;
  accommodations!: Table<Accommodation, string>;
  transport!: Table<TransportBooking, string>;
  experiences!: Table<Experience, string>;
  restaurants!: Table<Restaurant, string>;
  itineraryDays!: Table<ItineraryDay, string>;
  itineraryItems!: Table<ItineraryItem, string>;
  expenses!: Table<Expense, string>;
  memories!: Table<CompletedTripMemory, string>;
  journeySteps!: Table<JourneyStep, string>;
  journeyProgress!: Table<JourneyProgress, string>;
  pickups!: Table<FamilyPickup, string>;
  syncQueue!: Table<SyncEntry, number>;
  meta!: Table<Meta, string>;

  constructor() {
    super('voyage');
    this.version(1).stores({
      users: 'id',
      preferences: 'userId',
      trips: 'id, status',
      flights: 'id, tripId',
      flightStatus: 'flightId, tripId',
      bookings: 'id, tripId',
      documents: 'id, tripId',
      accommodations: 'id, tripId',
      transport: 'id, tripId',
      experiences: 'id, tripId',
      restaurants: 'id, tripId',
      itineraryDays: 'id, tripId',
      itineraryItems: 'id, tripId, dayId',
      expenses: 'id, tripId',
      memories: 'tripId',
      journeySteps: 'id, tripId',
      journeyProgress: 'id, tripId',
      pickups: 'tripId',
      syncQueue: '++seq, &key, status',
      meta: 'key',
    });
  }
}

export const db = new VoyageDB();
