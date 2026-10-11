import { findSensitive, type Box, type SensitiveKind, type TextItem } from '../engines/redact';
import { imagesToPdf } from './pdf';

// True redaction on the device: every page becomes pixels, sensitive areas are painted black
// into those pixels, and the masked PDF is rebuilt from the images. The masked copy has no
// text layer at all, so nothing under a box can be selected, searched or copied out.
// Text comes from the PDF's own text layer; scans and photos are read with OCR (tesseract.js).

export interface MaskPage {
  canvas: HTMLCanvasElement; // the original page, kept in memory only
  width: number;
  height: number;
  boxes: Box[]; // found automatically
  manual: Omit<Box, 'kind'>[]; // drawn by the user
  ocr: boolean;
}

const MAX_PAGES = 10;
const MAX_SIDE = 1800;

async function ocrItems(canvas: HTMLCanvasElement): Promise<TextItem[]> {
  const { createWorker } = await import('tesseract.js');
  const worker = await createWorker('eng');
  try {
    const { data } = await worker.recognize(canvas);
    return (data.words ?? []).map((w) => ({ text: w.text, x: w.bbox.x0, y: w.bbox.y0, w: w.bbox.x1 - w.bbox.x0, h: w.bbox.y1 - w.bbox.y0 }));
  } finally {
    await worker.terminate();
  }
}

async function pdfPages(file: Blob, onProgress?: (msg: string) => void): Promise<MaskPage[]> {
  // pdf.js 4 needs Promise.withResolvers (missing on older phones).
  const P = Promise as unknown as { withResolvers?: () => unknown };
  P.withResolvers ??= () => {
    let resolve!: (v: unknown) => void;
    let reject!: (e: unknown) => void;
    const promise = new Promise((a, b) => ((resolve = a), (reject = b)));
    return { promise, resolve, reject };
  };
  const pdfjs = await import('pdfjs-dist');
  const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false }).promise;
  const pages: MaskPage[] = [];
  for (let n = 1; n <= Math.min(doc.numPages, MAX_PAGES); n++) {
    onProgress?.(`Reading page ${n} of ${Math.min(doc.numPages, MAX_PAGES)}…`);
    const page = await doc.getPage(n);
    const base = page.getViewport({ scale: 1 });
    const viewport = page.getViewport({ scale: Math.min(2.5, MAX_SIDE / Math.max(base.width, base.height)) });
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(viewport.width);
    canvas.height = Math.round(viewport.height);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    await page.render({ canvasContext: ctx, viewport }).promise;
    const content = await page.getTextContent();
    let items: TextItem[] = [];
    for (const it of content.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const t = pdfjs.Util.transform(viewport.transform, it.transform);
      const h = Math.hypot(t[2], t[3]);
      items.push({ text: it.str, x: t[4], y: t[5] - h, w: it.width * viewport.scale, h: h * 1.15 });
    }
    const ocr = items.length === 0; // a scanned PDF: no text layer, so read the pixels
    if (ocr) {
      onProgress?.(`Reading scanned page ${n} (OCR)…`);
      items = await ocrItems(canvas).catch(() => []);
    }
    pages.push({ canvas, width: canvas.width, height: canvas.height, boxes: findSensitive(items).boxes, manual: [], ocr });
  }
  return pages;
}

async function imagePages(file: Blob, onProgress?: (msg: string) => void): Promise<MaskPage[]> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  onProgress?.('Reading the photo (OCR)…');
  const items = await ocrItems(canvas).catch(() => []);
  return [{ canvas, width: canvas.width, height: canvas.height, boxes: findSensitive(items).boxes, manual: [], ocr: true }];
}

/** Find what to mask. Nothing leaves the device. */
export function analyse(file: Blob, mime: string, onProgress?: (msg: string) => void) {
  return mime === 'application/pdf' ? pdfPages(file, onProgress) : imagePages(file, onProgress);
}

/** A copy of the page with every box painted solid black (padded a little). */
export function maskedCanvas(p: MaskPage) {
  const out = document.createElement('canvas');
  out.width = p.width;
  out.height = p.height;
  const ctx = out.getContext('2d')!;
  ctx.drawImage(p.canvas, 0, 0);
  ctx.fillStyle = '#000';
  for (const b of [...p.boxes, ...p.manual]) {
    const pad = Math.max(2, b.h * 0.15);
    ctx.fillRect(b.x - pad, b.y - pad, b.w + pad * 2, b.h + pad * 2);
  }
  return out;
}

const toJpeg = (c: HTMLCanvasElement) =>
  new Promise<Uint8Array>((resolve, reject) =>
    c.toBlob(async (b) => (b ? resolve(new Uint8Array(await b.arrayBuffer())) : reject(new Error('Could not encode the page'))), 'image/jpeg', 0.85),
  );

export function summaryOf(pages: MaskPage[]) {
  const counts: Partial<Record<SensitiveKind | 'manual', number>> = {};
  for (const p of pages) {
    for (const b of p.boxes) counts[b.kind] = (counts[b.kind] ?? 0) + 1;
    if (p.manual.length) counts.manual = (counts.manual ?? 0) + p.manual.length;
  }
  return counts;
}

/** Build the masked file: a PDF of page images (for PDFs) or a JPEG (for photos). */
export async function buildMasked(pages: MaskPage[], mime: string): Promise<{ blob: Blob; mime: string }> {
  const images = await Promise.all(pages.map(async (p) => ({ jpeg: await toJpeg(maskedCanvas(p)), width: p.width, height: p.height })));
  if (mime === 'application/pdf') return { blob: new Blob([imagesToPdf(images)], { type: 'application/pdf' }), mime: 'application/pdf' };
  return { blob: new Blob([images[0].jpeg], { type: 'image/jpeg' }), mime: 'image/jpeg' };
}
