// Banks whose card offers travellers ask about. Card offers change weekly and no bank
// publishes them through an open API, so Voyage links to each bank's own offers page
// (or a search for it) instead of showing discounts it cannot check.

export interface Bank {
  id: string;
  name: string;
  /** The bank's official offers page, when we know a stable one. */
  offersUrl?: string;
}

export const BANKS: Bank[] = [
  { id: 'hdfc', name: 'HDFC Bank' },
  { id: 'icici', name: 'ICICI Bank', offersUrl: 'https://www.icicibank.com/offers' },
  { id: 'sbi', name: 'SBI Card', offersUrl: 'https://www.sbicard.com/en/personal/offers.page' },
  { id: 'axis', name: 'Axis Bank', offersUrl: 'https://www.axisbank.com/grab-deals' },
  { id: 'kotak', name: 'Kotak Mahindra Bank', offersUrl: 'https://www.kotak.com/en/offers.html' },
  { id: 'amex', name: 'American Express', offersUrl: 'https://www.americanexpress.com/in/benefits/offers/' },
  { id: 'idfc', name: 'IDFC FIRST Bank' },
  { id: 'yes', name: 'YES Bank' },
  { id: 'au', name: 'AU Small Finance Bank' },
  { id: 'other', name: 'Other bank' },
];

export const NETWORKS = ['Visa', 'Mastercard', 'RuPay', 'Amex', 'Diners'] as const;

export interface SavedCard {
  id: string;
  bankId: string;
  network: (typeof NETWORKS)[number];
  kind: 'credit' | 'debit';
  /** A nickname only ("Regalia", "Travel card"). Never the card number. */
  label: string;
}

export const bankName = (id: string) => BANKS.find((b) => b.id === id)?.name ?? 'Bank';

/** Where to check this card's offers for a kind of booking. */
export function offersLink(card: SavedCard, what: 'flight' | 'hotel' | 'travel') {
  const bank = BANKS.find((b) => b.id === card.bankId);
  if (bank?.offersUrl) return bank.offersUrl;
  const name = bank && bank.id !== 'other' ? bank.name : card.network;
  return `https://www.google.com/search?q=${encodeURIComponent(`${name} ${card.kind} card ${what} offers`)}`;
}
