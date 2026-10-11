import { Hono } from 'hono';
import { and, desc, eq } from 'drizzle-orm';
import { z } from 'zod';
import { getDb, schema as s } from '../db/client';
import { AppError, parse } from '../http';
import { requireUser } from '../auth';
import { checkLink, decrypt, documentKey, encrypt, MAX_BYTES, maskIdNumber, pdfHasTextLayer, signLink, sniffMime, type IdKind } from '../documents';

// Private travel documents: upload (encrypted), list, open via a 5-minute signed link, delete.

export const documents = new Hono<{ Variables: { userId: string } }>();
documents.use('/documents/*', requireUser);
documents.use('/documents', requireUser);

const meta = z.object({
  kind: z.enum(['passport', 'visa', 'boarding-pass', 'insurance', 'hotel', 'id', 'other']),
  idType: z.enum(['aadhaar', 'pan', 'driving_licence', 'voter', 'other']).optional(),
  title: z.string().trim().min(1, 'Give it a name.').max(80),
  holder: z.string().trim().max(80).optional(),
  number: z.string().max(40).optional(),
  expires: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .or(z.literal('').transform(() => undefined)),
  tripId: z.string().max(80).optional(),
});

const view = (d: typeof s.verificationDocuments.$inferSelect) => ({
  id: d.id,
  kind: d.docType,
  idType: d.idType,
  title: d.title,
  holder: d.holder,
  tripId: d.tripId,
  expires: d.expiresOn,
  maskedNumber: d.maskedNumber,
  mime: d.mime,
  sizeBytes: d.sizeBytes,
  createdAt: d.createdAt,
  maskStatus: d.maskStatus,
  originalDeleted: d.originalDeleted,
});

const KINDS = ['aadhaar', 'pan', 'passport', 'driving_licence', 'dob', 'address', 'mrz', 'manual'] as const;
const summarySchema = z.record(z.enum(KINDS), z.number().int().min(0).max(500));

/** Check and encrypt a masked copy. Returns the row values, or throws a friendly error. */
async function maskedValues(file: unknown, summaryRaw: unknown) {
  if (!(file instanceof File)) throw new AppError(400, 'invalid_input', 'Missing the masked copy.');
  if (file.size > MAX_BYTES) throw new AppError(413, 'too_large', 'The masked copy is over 4 MB.');
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) throw new AppError(415, 'bad_type', 'The masked copy must be a PDF or an image.');
  if (mime === 'application/pdf' && pdfHasTextLayer(bytes)) throw new AppError(422, 'not_masked', 'That PDF still has selectable text, so hidden numbers could be copied out. Mask it in Voyage to burn the text out.');
  let summary: z.infer<typeof summarySchema> = {};
  if (typeof summaryRaw === 'string' && summaryRaw) {
    try {
      summary = parse(summarySchema, JSON.parse(summaryRaw));
    } catch {
      throw new AppError(400, 'invalid_input', 'Bad mask summary.');
    }
  }
  return { mime, sizeBytes: bytes.length, summary, ...encrypt(bytes) };
}
const foundAnything = (summary: Record<string, number>) => Object.values(summary).some((n) => n > 0);

documents.post('/documents', async (c) => {
  if (!documentKey()) throw new AppError(503, 'storage_not_configured', 'Document storage is not set up on this server yet.');
  const form = await c.req.parseBody().catch(() => {
    throw new AppError(400, 'invalid_input', 'Send the document as a form upload.');
  });
  const file = form.file;
  if (!(file instanceof File)) throw new AppError(400, 'invalid_input', 'Choose a file to upload.', { file: 'Choose a file to upload.' });
  if (file.size > MAX_BYTES) throw new AppError(413, 'too_large', 'Files can be up to 4 MB. Try a smaller photo.', { file: 'Files can be up to 4 MB.' });
  const m = parse(meta, Object.fromEntries(Object.entries(form).filter(([k]) => k !== 'file')));

  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffMime(bytes);
  if (!mime) throw new AppError(415, 'bad_type', 'Upload a PDF, JPEG, PNG or WebP file.', { file: 'Upload a PDF or a photo.' });

  let maskedNumber: string | null = null;
  if (m.number?.trim()) {
    const idKind: IdKind = m.kind === 'passport' ? 'passport' : m.kind === 'id' ? (m.idType ?? 'other') : 'other';
    const res = maskIdNumber(idKind, m.number);
    if ('error' in res) throw new AppError(400, 'invalid_input', res.error, { number: res.error });
    maskedNumber = res.masked; // the full number is dropped here and never stored
  }

  const { db } = await getDb();
  const userId = c.get('userId');
  const box = encrypt(bytes);
  const [doc] = await db
    .insert(s.verificationDocuments)
    .values({
      userId,
      docType: m.kind,
      idType: m.kind === 'id' ? (m.idType ?? 'other') : null,
      title: m.title,
      holder: m.holder || null,
      tripId: m.tripId || null,
      expiresOn: m.expires ?? null,
      storagePath: 'db:document_blobs',
      mime,
      sizeBytes: bytes.length,
      status: 'uploaded',
      maskedNumber,
    })
    .returning();
  await db.insert(s.documentBlobs).values({ docId: doc.id, ...box });
  if (form.masked) {
    const mv = await maskedValues(form.masked, form.maskSummary);
    await db.insert(s.documentMaskedBlobs).values({ docId: doc.id, ...mv });
    const [updated] = await db.update(s.verificationDocuments).set({ maskStatus: foundAnything(mv.summary) ? 'masked' : 'nothing_found' }).where(eq(s.verificationDocuments.id, doc.id)).returning();
    return c.json({ document: view(updated) }, 201);
  }
  return c.json({ document: view(doc) }, 201);
});

documents.get('/documents', async (c) => {
  const { db } = await getDb();
  const rows = await db.select().from(s.verificationDocuments).where(eq(s.verificationDocuments.userId, c.get('userId'))).orderBy(desc(s.verificationDocuments.createdAt));
  return c.json({ documents: rows.map(view) });
});

async function ownDoc(userId: string, id: string) {
  const docId = parse(z.string().uuid(), id);
  const { db } = await getDb();
  const [doc] = await db
    .select()
    .from(s.verificationDocuments)
    .where(and(eq(s.verificationDocuments.id, docId), eq(s.verificationDocuments.userId, userId)))
    .limit(1);
  if (!doc) throw new AppError(404, 'not_found', 'We could not find that document.');
  return doc;
}

/** A link that opens the file for 5 minutes (works in <img>, <iframe> and downloads). */
// Masked copy by default; the original only when the owner asks for it.
documents.post('/documents/:id/link', async (c) => {
  const doc = await ownDoc(c.get('userId'), c.req.param('id'));
  const want = parse(z.enum(['masked', 'original', 'auto']).default('auto'), c.req.query('v') ?? undefined);
  const { db } = await getDb();
  const [m] = await db.select({ mime: s.documentMaskedBlobs.mime }).from(s.documentMaskedBlobs).where(eq(s.documentMaskedBlobs.docId, doc.id)).limit(1);
  const v = want === 'auto' ? (m ? 'masked' : 'original') : want;
  if (v === 'masked' && !m) throw new AppError(404, 'not_masked', 'This document has no masked copy yet.');
  if (v === 'original' && doc.originalDeleted) throw new AppError(404, 'original_deleted', 'You deleted the original. Only the masked copy is kept.');
  const link = signLink(v === 'masked' ? `${doc.id}:masked` : doc.id);
  return c.json({ ...link, url: v === 'masked' ? `${link.url.replace(`${doc.id}:masked`, doc.id)}&v=masked` : link.url, mime: v === 'masked' ? m!.mime : doc.mime, variant: v });
});

/** Add or replace the masked copy of an existing document. */
documents.post('/documents/:id/masked', async (c) => {
  const doc = await ownDoc(c.get('userId'), c.req.param('id'));
  const form = await c.req.parseBody().catch(() => ({}) as Record<string, unknown>);
  const mv = await maskedValues(form.masked, form.maskSummary);
  const { db } = await getDb();
  await db.insert(s.documentMaskedBlobs).values({ docId: doc.id, ...mv }).onConflictDoUpdate({ target: s.documentMaskedBlobs.docId, set: { ...mv, createdAt: new Date() } });
  const [updated] = await db.update(s.verificationDocuments).set({ maskStatus: foundAnything(mv.summary) ? 'masked' : 'nothing_found', updatedAt: new Date() }).where(eq(s.verificationDocuments.id, doc.id)).returning();
  return c.json({ document: view(updated), summary: mv.summary });
});

/** Keep only the masked copy: the encrypted original is erased. */
documents.delete('/documents/:id/original', async (c) => {
  const doc = await ownDoc(c.get('userId'), c.req.param('id'));
  const { db } = await getDb();
  const [m] = await db.select({ id: s.documentMaskedBlobs.docId }).from(s.documentMaskedBlobs).where(eq(s.documentMaskedBlobs.docId, doc.id)).limit(1);
  if (!m) throw new AppError(409, 'not_masked', 'Mask the document first, so there is a copy to keep.');
  await db.delete(s.documentBlobs).where(eq(s.documentBlobs.docId, doc.id));
  const [updated] = await db.update(s.verificationDocuments).set({ originalDeleted: true, updatedAt: new Date() }).where(eq(s.verificationDocuments.id, doc.id)).returning();
  return c.json({ document: view(updated) });
});

documents.delete('/documents/:id', async (c) => {
  const doc = await ownDoc(c.get('userId'), c.req.param('id'));
  const { db } = await getDb();
  await db.delete(s.verificationDocuments).where(eq(s.verificationDocuments.id, doc.id)); // the file goes with it
  return c.json({ ok: true });
});

/** The file itself. No session needed: the signature proves the owner asked for it just now. */
documents.get('/files/:id', async (c) => {
  const id = c.req.param('id');
  const { exp = '', sig = '' } = c.req.query();
  const masked = c.req.query('v') === 'masked';
  if (!z.string().uuid().safeParse(id).success || !documentKey() || !checkLink(masked ? `${id}:masked` : id, exp, sig)) {
    throw new AppError(403, 'link_expired', 'This link has expired. Open the document again from your wallet.');
  }
  const { db } = await getDb();
  const [row] = masked
    ? await db
        .select({ mime: s.documentMaskedBlobs.mime, title: s.verificationDocuments.title, iv: s.documentMaskedBlobs.iv, tag: s.documentMaskedBlobs.tag, data: s.documentMaskedBlobs.data })
        .from(s.documentMaskedBlobs)
        .innerJoin(s.verificationDocuments, eq(s.verificationDocuments.id, s.documentMaskedBlobs.docId))
        .where(eq(s.documentMaskedBlobs.docId, id))
        .limit(1)
    : await db
        .select({ mime: s.verificationDocuments.mime, title: s.verificationDocuments.title, iv: s.documentBlobs.iv, tag: s.documentBlobs.tag, data: s.documentBlobs.data })
        .from(s.documentBlobs)
        .innerJoin(s.verificationDocuments, eq(s.verificationDocuments.id, s.documentBlobs.docId))
        .where(eq(s.documentBlobs.docId, id))
        .limit(1);
  if (!row) throw new AppError(404, 'not_found', 'That document was deleted.');
  const body = decrypt(row);
  const ext = row.mime === 'application/pdf' ? 'pdf' : row.mime.split('/')[1];
  return new Response(body, {
    headers: {
      'content-type': row.mime,
      'content-length': String(body.length),
      'content-disposition': `inline; filename="${row.title.replace(/[^\w .-]/g, '_')}${masked ? ' (masked)' : ''}.${ext}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
});
