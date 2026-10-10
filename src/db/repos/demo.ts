import { db } from '../db';
import { simulateRemoteEdit } from '../mockServer';
import { writeAndQueue } from '../syncQueue';

/**
 * Judge Mode: stage a real sync conflict. "Another device" turns Travel insurance
 * offline OFF on the (simulated) server, then this phone turns it ON. The push is
 * rejected as a conflict and the user is asked which version to keep.
 */
export async function stageSyncConflict() {
  const doc = await db.documents.get('doc5');
  if (!doc) return;
  simulateRemoteEdit('documents', doc.id, { ...doc, offline: false });
  await writeAndQueue('documents', doc.id, { ...doc, offline: true }, `${doc.title}: available offline`);
}
