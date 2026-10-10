import { db } from './db';
import * as sample from '../data/sampleTrips';
import { documents } from '../data/sampleDocuments';
import { resetMockServer } from './mockServer';

// Bump when the bundled sample data changes, so devices reseed.
export const DATA_VERSION = '1';

async function seed() {
  await db.transaction('rw', db.tables, async () => {
    await Promise.all([
      db.users.put(sample.sampleUser),
      db.trips.bulkPut(sample.trips),
      db.flights.bulkPut(sample.flights),
      db.flightStatus.bulkPut(sample.flightStatuses),
      db.bookings.bulkPut(sample.bookings),
      db.documents.bulkPut(documents),
      db.accommodations.bulkPut(sample.accommodations),
      db.transport.bulkPut(sample.transport),
      db.experiences.bulkPut(sample.experiences),
      db.restaurants.bulkPut(sample.restaurants),
      db.itineraryDays.bulkPut(sample.itineraryDays),
      db.itineraryItems.bulkPut(sample.itineraryItems),
      db.expenses.bulkPut(sample.expenses),
      db.memories.bulkPut(sample.completedMemories),
      db.journeySteps.bulkPut(sample.journeySteps),
      db.pickups.bulkPut(sample.familyPickups),
    ]);
    await db.meta.bulkPut([
      { key: 'seededAt', value: new Date().toISOString() },
      { key: 'dataVersion', value: DATA_VERSION },
      { key: 'currentUserId', value: sample.sampleUser.id },
    ]);
  });
}

/** Loads the bundled sample data on first launch (or after a data version bump). */
export async function ensureSeeded() {
  const version = await db.meta.get('dataVersion');
  if (version?.value === DATA_VERSION) return;
  await Promise.all(db.tables.map((t) => t.clear()));
  await seed();
}

/** Judge Mode reset: wipe this device and the mock server, then reseed. */
export async function resetDemo() {
  await Promise.all(db.tables.map((t) => t.clear()));
  resetMockServer();
  await seed();
}
