import { db } from '../db';
import { writeAndQueue } from '../syncQueue';

export const listDocuments = () => db.documents.toArray();
export const getDocument = (id: string) => db.documents.get(id);

export async function setDocumentOffline(id: string, offline: boolean) {
  const doc = await db.documents.get(id);
  if (!doc || doc.offline === offline) return;
  await writeAndQueue('documents', id, { ...doc, offline }, `${doc.title}: available offline ${offline ? 'on' : 'off'}`);
}
