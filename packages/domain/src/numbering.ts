/**
 * Document numbering that survives being offline.
 *
 * Under GST an invoice series must be unique and consecutive within itself, but
 * a business may run several series at once. We give each billing device its
 * own series, so two devices billing in a power cut can never mint the same
 * number and nothing has to be reconciled later.
 *
 *   NOI/A/26-27/0042    shop counter tablet
 *   NOI/B/26-27/0007    warehouse tablet
 */

export type Sequence = {
  prefix: string;
  next_number: number;
  pad_width: number;
};

/** Format a document number from a sequence row. */
export function formatDocNo(seq: Sequence, value = seq.next_number): string {
  return `${seq.prefix}${String(value).padStart(seq.pad_width, '0')}`;
}

/**
 * The Indian financial year label for a date: April to March.
 * 12 Sep 2026 -> '26-27'; 12 Feb 2027 -> '26-27'.
 */
export function financialYear(date: Date | string, startMonth = 4): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const startYear = month >= startMonth ? year : year - 1;
  const endYear = startYear + 1;
  return `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
}

/** First day of the financial year containing `date`. */
export function financialYearStart(date: Date | string, startMonth = 4): Date {
  const d = typeof date === 'string' ? new Date(date) : date;
  const year = d.getMonth() + 1 >= startMonth ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(year, startMonth - 1, 1);
}

/** Due date from an invoice date and the customer's credit period. */
export function dueDate(docDate: Date | string, creditDays: number): Date {
  const d = typeof docDate === 'string' ? new Date(docDate) : new Date(docDate);
  d.setDate(d.getDate() + (creditDays || 0));
  return d;
}

/** ISO date (YYYY-MM-DD) in local time, which is what date columns store. */
export function toDateString(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * UUID v7: time-ordered, so ids generated on a phone stay compact as index
 * keys and sort by creation time. Matches uuid_generate_v7() in Postgres.
 */
export function uuidv7(): string {
  const now = Date.now();
  const bytes = new Uint8Array(16);

  // 48-bit big-endian timestamp
  bytes[0] = (now / 2 ** 40) & 0xff;
  bytes[1] = (now / 2 ** 32) & 0xff;
  bytes[2] = (now / 2 ** 24) & 0xff;
  bytes[3] = (now / 2 ** 16) & 0xff;
  bytes[4] = (now / 2 ** 8) & 0xff;
  bytes[5] = now & 0xff;

  const random = new Uint8Array(10);
  if (typeof globalThis.crypto?.getRandomValues === 'function') {
    globalThis.crypto.getRandomValues(random);
  } else {
    for (let i = 0; i < 10; i++) random[i] = Math.floor(Math.random() * 256);
  }
  bytes.set(random, 6);

  bytes[6] = (bytes[6] & 0x0f) | 0x70; // version 7
  bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant

  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Normalise a vehicle registration for storage and search: UP16AB1234. */
export function normaliseRegistration(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Display a registration the way it is written on the plate: UP 16 AB 1234. */
export function formatRegistration(value: string): string {
  const v = normaliseRegistration(value);
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{1,4})$/.exec(v);
  if (!m) return v;
  return [m[1], m[2], m[3], m[4]].filter(Boolean).join(' ');
}
