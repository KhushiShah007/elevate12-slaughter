import { db } from '../db';
import { api } from '../../api/client';
import { writeAndQueue } from '../syncQueue';

/**
 * Judge Mode: stage a real sync conflict. "Another device" turns Travel insurance
 * offline OFF on the server (through a Judge-only endpoint), then this phone turns it ON. The push is
 * rejected as a conflict and the user is asked which version to keep.
 */
export async function stageSyncConflict() {
  const doc = await db.documents.get('doc5');
  if (!doc) return;
  await api('POST', '/sync/simulate-remote-edit', { table: 'documents', recordId: doc.id, payload: { ...doc, offline: false } });
  await writeAndQueue('documents', doc.id, { ...doc, offline: true }, `${doc.title}: available offline`);
}
