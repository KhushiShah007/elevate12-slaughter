import { describe, expect, it } from 'vitest';
import { containsSensitive, findSensitive, verhoeff, type TextItem } from '../redact';

// A valid Aadhaar test number (passes Verhoeff); not a real person's.
const AADHAAR = '2341 2341 2346';
const line = (text: string, y: number, x = 10): TextItem => ({ text, x, y, w: text.length * 10, h: 16 });

describe('sensitive field finder', () => {
  it('checks Aadhaar with Verhoeff and covers only the first 8 digits', () => {
    expect(verhoeff(AADHAAR)).toBe(true);
    expect(verhoeff('2341 2341 2345')).toBe(false);
    const f = findSensitive([line(`Aadhaar No: ${AADHAAR}`, 100)]);
    expect(f.counts.aadhaar).toBe(1);
    const b = f.boxes[0];
    expect(b.x).toBe(10 + 'Aadhaar No: '.length * 10);
    expect(b.w).toBe('2341 2341'.length * 10); // last four digits stay visible
    expect(findSensitive([line('Ref 2341 2341 2345', 50)]).counts.aadhaar).toBeUndefined();
  });

  it('finds PAN, passport, licence, DOB, MRZ and an address block', () => {
    const f = findSensitive([
      line('Permanent Account Number ABCPE1234F', 10),
      line('Passport No. K1234567', 40),
      line('DL No: MH12 20110012345', 70),
      line('DOB: 14/08/1990', 100),
      line('Address: 12 Marine Drive,', 130),
      line('Churchgate, Mumbai 400020', 150),
      line('Valid till 2030', 300),
      line('P<INDSHARMA<<RAHUL<<<<<<<<<<<<<<<<<<<<<<<<<', 400),
    ]);
    expect(f.counts).toMatchObject({ pan: 1, passport: 1, driving_licence: 1, dob: 1, address: 1, mrz: 1 });
    expect(f.boxes.some((b) => b.kind === 'address' && b.y === 150)).toBe(true);
    expect(f.boxes.some((b) => b.y === 300)).toBe(false); // expiry dates stay
  });

  it('joins a number split across text items', () => {
    const f = findSensitive([line('ABCPE', 10, 10), line('1234F', 10, 70)]);
    expect(f.counts.pan).toBe(1); // OCR split "ABCPE 1234F" into two words
    expect(f.boxes).toHaveLength(2);
    expect(containsSensitive('Name: Asha\nPAN ABCPE1234F')).toBe(true);
    expect(containsSensitive('Hotel booking ref 88231')).toBe(false);
  });
});
