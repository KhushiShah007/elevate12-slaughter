import { db } from '../db';
import { writeAndQueue } from '../syncQueue';

/** The traveller tapped Done on a timeline step. Saved on the device, synced for family. */
export async function markStepDone(tripId: string, stepId: string) {
  const id = `${tripId}:${stepId}`;
  const existing = await db.journeyProgress.get(id);
  if (existing) return;
  const step = await db.journeySteps.get(stepId);
  await writeAndQueue('journeyProgress', id, { id, tripId, stepId, doneAt: new Date().toISOString() }, `Step done: ${step?.label ?? stepId}`);
}
