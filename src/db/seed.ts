import { db } from './db';
import * as original from '../data/sampleTrips';
import { documents as originalDocuments } from '../data/sampleDocuments';
import { sampleShiftDays, shiftDates } from '../data/sampleShift';

// Bump when the bundled sample data changes, so devices reseed.
// v10: sample dates are moved to start about a week from the day the device is seeded.
export const DATA_VERSION = '10';

async function seed() {
  const days = sampleShiftDays();
  const sample = shiftDates({ ...original }, days);
  const documents = shiftDates(originalDocuments, days);
  await db.transaction('rw', db.tables, async () => {
    await Promise.all([
      db.users.put(sample.sampleUser),
      db.trips.bulkPut(sample.trips.map((t) => ({ ...t, sample: true }))),
      db.flights.bulkPut(sample.flights),
      db.flightStatus.bulkPut(sample.flightStatuses),
      db.bookings.bulkPut(sample.bookings.map((b) => ({ ...b, sample: true }))),
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
      // Read by screens that use bundled sample data directly (recovery options), so they move too.
      { key: 'sampleShiftDays', value: String(days) },
    ]);
  });
}

/** Loads the bundled sample data on first launch (or after a data version bump). */
export async function ensureSeeded() {
  const version = await db.meta.get('dataVersion');
  if (version?.value === DATA_VERSION) return;
  // New sample data: start the device clean. The account's own records come back from the server.
  await Promise.all(db.tables.map((t) => t.clear()));
  await seed();
}

/** Judge Mode reset: wipe this device and reseed. The account's own records come back from the server. */
export async function resetDemo() {
  await Promise.all(db.tables.map((t) => t.clear()));
  await seed();
}
