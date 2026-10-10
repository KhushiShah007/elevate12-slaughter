import { describe, expect, it } from 'vitest';
import { imagesToPdf } from '../pdf';

// A fake "JPEG": the writer copies bytes as-is, so any bytes work for structure checks.
const fakeJpeg = (n: number) => new Uint8Array(n).map((_, i) => (i * 37) % 256);

describe('PDF writer', () => {
  const pdf = imagesToPdf([
    { jpeg: fakeJpeg(500), width: 1200, height: 1600 },
    { jpeg: fakeJpeg(300), width: 1600, height: 900 },
  ]);
  const text = new TextDecoder('latin1').decode(pdf);

  it('is a PDF with one page per image', () => {
    expect(text.startsWith('%PDF-1.4')).toBe(true);
    expect(text.trimEnd().endsWith('%%EOF')).toBe(true);
    expect(text).toContain('/Count 2');
    expect(text.match(/\/Type \/Page /g)).toHaveLength(2);
  });

  it('has a cross-reference table that points at every object', () => {
    const startxref = Number(text.match(/startxref\n(\d+)/)![1]);
    expect(text.slice(startxref, startxref + 4)).toBe('xref');
    const offsets = [...text.slice(startxref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
    expect(offsets).toHaveLength(8); // catalog + pages + 3 objects per page
    offsets.forEach((off, i) => expect(text.slice(off, off + 12)).toMatch(new RegExp(`^${i + 1} 0 obj`)));
  });

  it('declares the exact image length so readers can find the end of each stream', () => {
    expect(text).toContain('/Width 1200 /Height 1600');
    expect(text).toContain('/Length 500');
    expect(text).toContain('/Length 300');
  });
});
