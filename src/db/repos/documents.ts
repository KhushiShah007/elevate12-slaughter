import { db } from '../db';
import { writeAndQueue } from '../syncQueue';
import { imagesToPdf } from '../../utils/pdf';
import type { JpegPage } from '../../utils/image';
import type { TravelDocument } from '../../types';

export const listDocuments = () => db.documents.toArray();
export const getDocument = (id: string) => db.documents.get(id);

export async function setDocumentOffline(id: string, offline: boolean) {
  const doc = await db.documents.get(id);
  if (!doc || doc.offline === offline) return;
  await writeAndQueue('documents', id, { ...doc, offline }, `${doc.title}: available offline ${offline ? 'on' : 'off'}`);
}

/**
 * Save scanned pages as a real PDF on this phone. The file itself never leaves the
 * device; only the document's details go through the sync queue.
 */
export async function saveScan(title: string, holder: string, pages: JpegPage[]): Promise<TravelDocument> {
  const id = `scan-${crypto.randomUUID()}`;
  const jpegs = await Promise.all(pages.map(async (p) => ({ jpeg: new Uint8Array(await p.blob.arrayBuffer()), width: p.width, height: p.height })));
  const pdf = new Blob([imagesToPdf(jpegs)], { type: 'application/pdf' });

  const doc: TravelDocument = {
    id,
    tripId: null,
    kind: 'other',
    title: title.trim() || 'Scanned document',
    holder,
    ref: new Date().toISOString().slice(0, 10),
    pages: pages.length,
    offline: true, // it only exists on this phone, so it is always available offline
    hasFile: true,
  };

  await db.files.bulkPut([
    { id: `${id}:pdf`, docId: id, kind: 'pdf', index: 0, blob: pdf },
    ...pages.map((p, i) => ({ id: `${id}:p${i}`, docId: id, kind: 'page' as const, index: i, blob: p.blob })),
  ]);
  await writeAndQueue('documents', id, doc, `Scanned: ${doc.title}`);
  return doc;
}

export async function getDocumentFiles(docId: string) {
  const files = await db.files.where({ docId }).toArray();
  return {
    pdf: files.find((f) => f.kind === 'pdf')?.blob ?? null,
    pages: files.filter((f) => f.kind === 'page').sort((a, b) => a.index - b.index).map((f) => f.blob),
  };
}
