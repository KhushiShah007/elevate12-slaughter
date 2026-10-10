import type { TravelDocument } from '../types';

// SAMPLE documents. Real scans arrive in Goal 6.
export const documents: TravelDocument[] = [
  { id: 'doc1', tripId: null, kind: 'passport', title: 'Passport', holder: 'Riya Mehta', ref: 'Z4XXXX21', expires: '2027-02-11', pages: 2, offline: true },
  { id: 'doc2', tripId: 't-japan', kind: 'visa', title: 'Japan e-Visa', holder: 'Riya Mehta', ref: 'JPN-EV-88231', expires: '2027-01-14', pages: 1, offline: true },
  { id: 'doc3', tripId: 't-japan', kind: 'boarding-pass', title: 'Boarding pass AI 865', holder: 'Riya Mehta', ref: 'QX7H2M', pages: 1, offline: true },
  { id: 'doc4', tripId: 't-japan', kind: 'boarding-pass', title: 'Boarding pass AI 306', holder: 'Riya Mehta', ref: 'QX7H2M', pages: 1, offline: false },
  { id: 'doc5', tripId: 't-japan', kind: 'insurance', title: 'Travel insurance', holder: 'Riya & Kabir Mehta', ref: 'TI-5530192', expires: '2026-10-23', pages: 4, offline: false },
  { id: 'doc6', tripId: 't-japan', kind: 'hotel', title: 'Hotel Gracery voucher', holder: 'Riya Mehta', ref: 'HG-210945', pages: 1, offline: true },
  { id: 'doc7', tripId: null, kind: 'id', title: 'Aadhaar card', holder: 'Riya Mehta', ref: 'XXXX XXXX 4417', pages: 1, offline: true },
  { id: 'doc8', tripId: 't-goa', kind: 'boarding-pass', title: 'Booking 6E 5104', holder: 'Riya Mehta + 3', ref: 'GA4K9P', pages: 1, offline: false },
];
