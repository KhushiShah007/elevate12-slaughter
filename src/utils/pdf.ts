// Minimal PDF writer: one JPEG per A4 page, fitted inside a margin.
// JPEG data goes in as-is (DCTDecode), so nothing is re-encoded and no library is needed.

export interface PdfPage {
  jpeg: Uint8Array;
  width: number; // pixels
  height: number;
}

const A4 = { w: 595.28, h: 841.89 }; // points
const MARGIN = 28;

const enc = new TextEncoder();
const n2 = (n: number) => n.toFixed(2);

export function imagesToPdf(pages: PdfPage[]): Uint8Array {
  const chunks: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === 'string' ? enc.encode(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };
  const object = (id: number, body: (Uint8Array | string)[]) => {
    offsets[id] = length;
    push(`${id} 0 obj\n`);
    body.forEach(push);
    push('\nendobj\n');
  };

  // Object ids: 1 catalog, 2 page tree, then 3 per page (page, content, image).
  const pageId = (i: number) => 3 + i * 3;
  push('%PDF-1.4\n%\xC2\xB5\xC2\xB6\n');
  object(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  object(2, [`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_, i) => `${pageId(i)} 0 R`).join(' ')}] >>`]);

  pages.forEach((p, i) => {
    const id = pageId(i);
    const scale = Math.min((A4.w - 2 * MARGIN) / p.width, (A4.h - 2 * MARGIN) / p.height);
    const w = p.width * scale;
    const h = p.height * scale;
    const draw = `q ${n2(w)} 0 0 ${n2(h)} ${n2((A4.w - w) / 2)} ${n2((A4.h - h) / 2)} cm /Im0 Do Q`;
    object(id, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4.w} ${A4.h}] /Resources << /XObject << /Im0 ${id + 2} 0 R >> >> /Contents ${id + 1} 0 R >>`]);
    object(id + 1, [`<< /Length ${draw.length} >>\nstream\n${draw}\nendstream`]);
    object(id + 2, [
      `<< /Type /XObject /Subtype /Image /Width ${p.width} /Height ${p.height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpeg.length} >>\nstream\n`,
      p.jpeg,
      '\nendstream',
    ]);
  });

  const count = 3 + pages.length * 3;
  const xref = length;
  push(`xref\n0 ${count}\n0000000000 65535 f \n`);
  for (let id = 1; id < count; id++) push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  push(`trailer\n<< /Size ${count} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);

  const out = new Uint8Array(length);
  let at = 0;
  for (const c of chunks) {
    out.set(c, at);
    at += c.length;
  }
  return out;
}
