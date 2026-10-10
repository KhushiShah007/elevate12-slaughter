// A tiny PDF writer for receipts and itineraries: text lines in Helvetica, A4, several
// pages if needed. No dependencies; good enough for plain documents.

const esc = (s: string) =>
  s
    .replace(/[₹]/g, 'Rs ')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');

export interface PdfLine {
  text: string;
  size?: number; // points, default 11
  bold?: boolean;
  gap?: number; // extra space before, in points
}

export function textPdf(lines: PdfLine[]): Buffer {
  const pageH = 842;
  const top = 790;
  const bottom = 60;
  const pages: string[] = [];
  let y = top;
  let ops: string[] = [];
  for (const l of lines) {
    const size = l.size ?? 11;
    y -= (l.gap ?? 0) + size * 1.45;
    if (y < bottom) {
      pages.push(ops.join('\n'));
      ops = [];
      y = top - size * 1.45;
    }
    ops.push(`BT /${l.bold ? 'F2' : 'F1'} ${size} Tf 56 ${y.toFixed(1)} Td (${esc(l.text)}) Tj ET`);
  }
  pages.push(ops.join('\n'));

  const objects: string[] = [];
  const add = (o: string) => objects.push(o) && objects.length;
  const catalog = add('');
  const pagesObj = add('');
  const f1 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  const f2 = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  const kids: number[] = [];
  for (const content of pages) {
    const stream = add(`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesObj} 0 R /MediaBox [0 0 595 ${pageH}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${stream} 0 R >>`));
  }
  objects[catalog - 1] = `<< /Type /Catalog /Pages ${pagesObj} 0 R >>`;
  objects[pagesObj - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(' ')}] /Count ${kids.length} >>`;

  let out = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, 'latin1');
}
