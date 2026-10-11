import { db } from '../db';
import { removeAndQueue, writeAndQueue } from '../syncQueue';
import { api, ApiError } from '../../api/client';
import { imagesToPdf } from '../../utils/pdf';
import type { JpegPage } from '../../utils/image';
import type { TravelDocument } from '../../types';

export const listDocuments = () => db.documents.toArray();
export const getDocument = (id: string) => db.documents.get(id);

export async function setDocumentOffline(id: string, offline: boolean) {
  const doc = await db.documents.get(id);
  if (!doc || doc.offline === offline) return;
  // Account documents: the switch downloads or drops this phone's copy.
  if (doc.remote) return setRemoteOffline(doc, offline);
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

// ---------- Documents stored on the account (encrypted on the server) ----------

export interface RemoteDocument {
  id: string;
  kind: TravelDocument['kind'];
  idType: string | null;
  title: string;
  holder: string | null;
  tripId: string | null;
  expires: string | null;
  maskedNumber: string | null;
  mime: string;
  sizeBytes: number;
  createdAt: string;
  maskStatus?: 'none' | 'masked' | 'nothing_found';
  originalDeleted?: boolean;
}

export interface UploadFields {
  kind: TravelDocument['kind'];
  idType?: string;
  title: string;
  holder?: string;
  number?: string;
  expires?: string;
  tripId?: string;
}

const toLocal = (d: RemoteDocument, offline = false): TravelDocument => ({
  id: d.id,
  tripId: d.tripId,
  kind: d.kind,
  title: d.title,
  holder: d.holder ?? '',
  ref: d.maskedNumber ?? `Added ${d.createdAt.slice(0, 10)}`,
  expires: d.expires ?? undefined,
  pages: 1,
  offline,
  remote: true,
  mime: d.mime,
  maskStatus: d.maskStatus ?? 'none',
  originalDeleted: d.originalDeleted ?? false,
});

/** Upload a file to the account. Throws ApiError (with field messages) on failure. */
export async function uploadDocument(fields: UploadFields, file: Blob, filename: string, masked?: { blob: Blob; mime: string; summary: Record<string, number> }): Promise<TravelDocument> {
  if (!navigator.onLine) throw new ApiError(0, 'offline', 'You are offline. Connect to upload documents.');
  const form = new FormData();
  form.set('file', file, filename);
  if (masked) {
    form.set('masked', masked.blob, masked.mime === 'application/pdf' ? 'masked.pdf' : 'masked.jpg');
    form.set('maskSummary', JSON.stringify(masked.summary));
  }
  for (const [k, v] of Object.entries(fields)) if (v) form.set(k, v);
  let res: Response;
  try {
    res = await fetch('/api/documents', { method: 'POST', body: form, credentials: 'same-origin' });
  } catch {
    throw new ApiError(0, 'offline', 'Could not reach Voyage. Check your connection and try again.');
  }
  const data = (await res.json().catch(() => null)) as { document?: RemoteDocument; error?: { code: string; message: string; fields?: Record<string, string> } } | null;
  if (!res.ok || !data?.document) throw new ApiError(res.status, data?.error?.code ?? 'server_error', data?.error?.message ?? 'Upload failed. Please try again.', data?.error?.fields ?? {});
  const doc = toLocal(data.document);
  await db.documents.put(doc);
  return doc;
}

/** Bring the account's documents onto this phone (details only; files stay on the server). */
export async function syncRemoteDocuments() {
  const { documents } = await api<{ documents: RemoteDocument[] }>('GET', '/documents');
  const ids = new Set(documents.map((d) => d.id));
  await db.transaction('rw', db.documents, db.files, async () => {
    for (const d of documents) {
      const existing = await db.documents.get(d.id);
      await db.documents.put(toLocal(d, existing?.offline ?? false));
    }
    // Deleted on another device: remove here too, with any offline copy.
    const gone = (await db.documents.filter((d) => !!d.remote).toArray()).filter((d) => !ids.has(d.id));
    for (const d of gone) {
      await db.documents.delete(d.id);
      await db.files.where({ docId: d.id }).delete();
    }
  });
}

/** A URL to show the file: the offline copy if there is one, otherwise a 5-minute signed link. */
export async function openRemoteDocument(doc: TravelDocument, variant: 'auto' | 'masked' | 'original' = 'auto'): Promise<{ url: string; local: boolean; mime?: string }> {
  const copy = variant === 'auto' ? await db.files.get(`${doc.id}:original`) : undefined;
  if (copy) return { url: URL.createObjectURL(copy.blob), local: true, mime: copy.blob.type || doc.mime };
  const { url, mime } = await api<{ url: string; mime: string }>('POST', `/documents/${doc.id}/link?v=${variant}`);
  return { url, local: false, mime };
}

/** Upload (or replace) the masked copy of a stored document. */
export async function uploadMasked(doc: TravelDocument, masked: { blob: Blob; mime: string; summary: Record<string, number> }) {
  const form = new FormData();
  form.set('masked', masked.blob, masked.mime === 'application/pdf' ? 'masked.pdf' : 'masked.jpg');
  form.set('maskSummary', JSON.stringify(masked.summary));
  const res = await fetch(`/api/documents/${doc.id}/masked`, { method: 'POST', body: form, credentials: 'same-origin' }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { document?: RemoteDocument; error?: { code: string; message: string } } | null;
  if (!res?.ok || !data?.document) throw new ApiError(res?.status ?? 0, data?.error?.code ?? 'server_error', data?.error?.message ?? 'Could not save the masked copy.');
  // The offline copy (if any) was the unmasked file: replace it with nothing; reopen downloads the masked one.
  await db.files.delete(`${doc.id}:original`);
  await db.documents.put({ ...toLocal(data.document), offline: false });
}

/** Erase the original on the server, keeping only the masked copy. */
export async function deleteOriginal(doc: TravelDocument) {
  const { document } = await api<{ document: RemoteDocument }>('DELETE', `/documents/${doc.id}/original`);
  await db.documents.put({ ...toLocal(document), offline: doc.offline });
}

/** Keep (or drop) a copy of an account document on this phone, so it opens with no internet. */
export async function setRemoteOffline(doc: TravelDocument, offline: boolean) {
  if (!offline) {
    await db.files.delete(`${doc.id}:original`);
    await db.documents.update(doc.id, { offline: false });
    return;
  }
  const { url } = await api<{ url: string }>('POST', `/documents/${doc.id}/link`);
  const res = await fetch(url);
  if (!res.ok) throw new ApiError(res.status, 'download_failed', 'Could not download the document.');
  await db.files.put({ id: `${doc.id}:original`, docId: doc.id, kind: 'original', index: 0, blob: await res.blob() });
  await db.documents.update(doc.id, { offline: true });
}

export async function deleteRemoteDocument(doc: TravelDocument) {
  await api('DELETE', `/documents/${doc.id}`);
  await db.documents.delete(doc.id);
  await db.files.where({ docId: doc.id }).delete();
}

/** Back up a scan made on this phone to the account; the phone keeps its copy for offline use. */
export async function backUpScan(doc: TravelDocument, holder: string) {
  const { pdf } = await getDocumentFiles(doc.id);
  if (!pdf) throw new ApiError(0, 'missing', 'The scanned file is not on this phone any more.');
  const saved = await uploadDocument({ kind: doc.kind, title: doc.title, holder, tripId: doc.tripId ?? undefined }, pdf, `${doc.title}.pdf`);
  await db.files.put({ id: `${saved.id}:original`, docId: saved.id, kind: 'original', index: 0, blob: pdf });
  await db.documents.update(saved.id, { offline: true, pages: doc.pages });
  await db.files.where({ docId: doc.id }).delete();
  await removeAndQueue('documents', doc.id, `Backed up: ${doc.title}`);
  return saved;
}
