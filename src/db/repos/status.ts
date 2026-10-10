import { db } from '../db';
import type { FlightStatus } from '../../types';

// Flight status comes from the airline in a real app. Here it is either the bundled
// sample, a change the traveller reported, or one Judge Mode simulated. It is device
// data, not the traveller's own edits, so it does not go through the sync queue.

type Source = FlightStatus['source'];

async function patch(tripId: string, flightId: string, change: Partial<FlightStatus>, source: Source) {
  // A flight with no status yet starts from the published schedule.
  const current: FlightStatus = (await db.flightStatus.get(flightId)) ?? {
    flightId,
    tripId,
    delayMin: 0,
    preponedMin: 0,
    missed: false,
    source: 'sample',
    lastSynced: new Date().toISOString(),
  };
  await db.flightStatus.put({ ...current, ...change, source, lastSynced: new Date().toISOString() });
}

/** Only one disruption at a time on a trip: setting one clears the others. */
async function clearOthers(tripId: string, keep: string) {
  const all = await db.flightStatus.where({ tripId }).toArray();
  await Promise.all(
    all
      .filter((s) => s.flightId !== keep && (s.delayMin || s.preponedMin || s.missed))
      .map((s) => db.flightStatus.update(s.flightId, { delayMin: 0, preponedMin: 0, missed: false })),
  );
}

export async function setDelay(tripId: string, flightId: string, minutes: number, source: Source = 'reported') {
  await clearOthers(tripId, flightId);
  await patch(tripId, flightId, { delayMin: Math.max(0, minutes), preponedMin: 0, missed: false }, source);
}

export async function setPrepone(tripId: string, flightId: string, minutes: number, source: Source = 'reported') {
  await clearOthers(tripId, flightId);
  await patch(tripId, flightId, { preponedMin: Math.max(0, minutes), delayMin: 0, missed: false }, source);
}

export async function setMissed(tripId: string, flightId: string, source: Source = 'reported') {
  await clearOthers(tripId, flightId);
  await patch(tripId, flightId, { missed: true, delayMin: 0, preponedMin: 0 }, source);
}

/** Back to the published schedule. */
export async function clearDisruption(tripId: string) {
  const all = await db.flightStatus.where({ tripId }).toArray();
  await Promise.all(all.map((s) => db.flightStatus.update(s.flightId, { delayMin: 0, preponedMin: 0, missed: false, source: 'sample' })));
}
