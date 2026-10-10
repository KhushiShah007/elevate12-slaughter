import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// Document security:
//  - files are encrypted with AES-256-GCM before they reach the database
//  - they are opened through short-lived signed links (HMAC), never a public URL
//  - ID numbers are validated, then only a masked form is kept (never the full number)
// Nothing here logs file contents or ID numbers.

// ---------- Keys ----------

let cachedKey: Buffer | null = null;

/**
 * DOCS_ENCRYPTION_KEY: 32 random bytes, base64. Required in production. In development a
 * key is created once in .data/ so local uploads keep working across restarts.
 */
export function documentKey(): Buffer | null {
  if (cachedKey) return cachedKey;
  const env = process.env.DOCS_ENCRYPTION_KEY;
  if (env) {
    const k = Buffer.from(env, 'base64');
    if (k.length !== 32) throw new Error('DOCS_ENCRYPTION_KEY must be 32 bytes, base64-encoded.');
    return (cachedKey = k);
  }
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') return null;
  const file = path.resolve(process.cwd(), '.data/dev-docs-key');
  try {
    cachedKey = Buffer.from(fs.readFileSync(file, 'utf8'), 'base64');
  } catch {
    cachedKey = randomBytes(32);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, cachedKey.toString('base64'), { mode: 0o600 });
  }
  return cachedKey;
}

// Separate keys for encrypting and for signing links, both derived from the one secret.
const subKey = (purpose: string) => createHmac('sha256', documentKey()!).update(purpose).digest();

export function encrypt(plain: Buffer) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', subKey('encrypt'), iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  return { iv, tag: cipher.getAuthTag(), data };
}

export function decrypt(box: { iv: Buffer; tag: Buffer; data: Buffer }) {
  const decipher = createDecipheriv('aes-256-gcm', subKey('encrypt'), box.iv);
  decipher.setAuthTag(box.tag);
  return Buffer.concat([decipher.update(box.data), decipher.final()]);
}

// ---------- Signed links ----------

export const LINK_SECONDS = 300;

export function signLink(docId: string, now = Date.now()) {
  const exp = Math.floor(now / 1000) + LINK_SECONDS;
  const sig = createHmac('sha256', subKey('link')).update(`${docId}.${exp}`).digest('base64url');
  return { url: `/api/files/${docId}?exp=${exp}&sig=${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

export function checkLink(docId: string, exp: string, sig: string, now = Date.now()) {
  const e = Number(exp);
  if (!Number.isFinite(e) || e * 1000 < now) return false;
  const want = createHmac('sha256', subKey('link')).update(`${docId}.${e}`).digest();
  const got = Buffer.from(sig, 'base64url');
  return got.length === want.length && timingSafeEqual(got, want);
}

// ---------- File type ----------

export const MAX_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request limit

/** Real file type from the first bytes, not from the name or the browser's claim. */
export function sniffMime(buf: Buffer): 'application/pdf' | 'image/jpeg' | 'image/png' | 'image/webp' | null {
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

// ---------- ID numbers ----------

// Verhoeff checksum, used by Aadhaar numbers.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export function verhoeffValid(num: string) {
  let c = 0;
  const digits = num.split('').reverse().map(Number);
  for (let i = 0; i < digits.length; i++) c = D[c][P[i % 8][digits[i]]];
  return c === 0;
}

export type IdKind = 'aadhaar' | 'pan' | 'passport' | 'driving_licence' | 'voter' | 'other';

/**
 * Check an ID number and return only its masked form, e.g. Aadhaar "XXXX XXXX 4417".
 * Returns an error message instead when the number is clearly wrong.
 */
export function maskIdNumber(kind: IdKind, raw: string): { masked: string } | { error: string } {
  const v = raw.replace(/[\s-]/g, '').toUpperCase();
  if (!v) return { error: 'Enter the number, or leave it empty.' };
  switch (kind) {
    case 'aadhaar':
      if (!/^[2-9]\d{11}$/.test(v) || !verhoeffValid(v)) return { error: 'That is not a valid 12-digit Aadhaar number.' };
      return { masked: `XXXX XXXX ${v.slice(8)}` };
    case 'pan':
      if (!/^[A-Z]{5}\d{4}[A-Z]$/.test(v)) return { error: 'A PAN looks like ABCDE1234F.' };
      return { masked: `XXXXXX${v.slice(6)}` };
    case 'passport':
      if (!/^[A-Z0-9]{6,9}$/.test(v)) return { error: 'A passport number has 6 to 9 letters and digits.' };
      return { masked: `${'X'.repeat(v.length - 4)}${v.slice(-4)}` };
    default:
      if (!/^[A-Z0-9/]{4,20}$/.test(v)) return { error: 'Use letters and digits only.' };
      return { masked: `${'X'.repeat(Math.max(0, v.length - 4))}${v.slice(-4)}` };
  }
}
