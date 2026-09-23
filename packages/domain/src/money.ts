/**
 * Money handling.
 *
 * Every amount in this system is rupees as a JavaScript number, but no
 * intermediate result is ever allowed to carry floating point dust into a
 * stored column. Every function here rounds to 2 decimals at its boundary,
 * which matches the numeric(14,2) columns in Postgres.
 */

/** Round to `dp` decimal places, away from zero on a .5 boundary. */
export function round(value: number, dp = 2): number {
  if (!Number.isFinite(value)) return 0;
  const factor = 10 ** dp;
  const scaled = value * factor;
  // Nudge past the binary representation gap (1.005 * 100 === 100.49999999999999).
  const corrected = Math.round((scaled + Number.EPSILON * Math.sign(scaled) * Math.abs(scaled)) * 1e6) / 1e6;
  return Math.round(corrected) / factor;
}

/** Round to the nearest rupee, the default on printed invoices. */
export function roundToRupee(value: number): number {
  return Math.round(value);
}

/** Sum a list of amounts, rounding once at the end. */
export function sum(values: number[], dp = 2): number {
  return round(values.reduce((a, b) => a + b, 0), dp);
}

/** Indian digit grouping: 12,34,567.89 */
export function formatINR(value: number, opts: { paise?: boolean; symbol?: boolean } = {}): string {
  const { paise = false, symbol = true } = opts;
  const negative = value < 0;
  const abs = Math.abs(paise ? round(value) : roundToRupee(value));
  const whole = Math.floor(abs);
  const fraction = paise ? Math.round((abs - whole) * 100) : 0;

  const digits = String(whole);
  let grouped: string;
  if (digits.length <= 3) {
    grouped = digits;
  } else {
    const last3 = digits.slice(-3);
    const rest = digits.slice(0, -3);
    grouped = rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3;
  }

  const body = paise ? `${grouped}.${String(fraction).padStart(2, '0')}` : grouped;
  return `${negative ? '-' : ''}${symbol ? '₹' : ''}${body}`;
}

/** Short form for dashboards: ₹1.42L, ₹9.8L, ₹1.2Cr */
export function formatINRShort(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1e7) return `${sign}₹${round(abs / 1e7, 2)}Cr`;
  if (abs >= 1e5) return `${sign}₹${round(abs / 1e5, 2)}L`;
  if (abs >= 1e3) return `${sign}₹${round(abs / 1e3, 1)}K`;
  return `${sign}₹${roundToRupee(abs)}`;
}

/** Gross margin on a sale line. */
export function margin(rate: number, cost: number): { amount: number; pct: number } {
  const amount = round(rate - cost);
  const pct = rate > 0 ? round((amount / rate) * 100) : 0;
  return { amount, pct };
}

/**
 * Amount in words, Indian style, as printed on invoices:
 * 142300.50 -> "One Lakh Forty Two Thousand Three Hundred Rupees and Fifty Paise Only"
 */
export function amountInWords(value: number): string {
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  const twoDigits = (n: number): string => (n < 20 ? ones[n] : `${tens[Math.floor(n / 10)]}${n % 10 ? ' ' + ones[n % 10] : ''}`);
  const threeDigits = (n: number): string => {
    const h = Math.floor(n / 100);
    const rest = n % 100;
    return [h ? `${ones[h]} Hundred` : '', rest ? twoDigits(rest) : ''].filter(Boolean).join(' ');
  };

  const abs = Math.abs(round(value));
  let rupees = Math.floor(abs);
  const paise = Math.round((abs - rupees) * 100);
  if (rupees === 0 && paise === 0) return 'Zero Rupees Only';

  const parts: string[] = [];
  const crore = Math.floor(rupees / 1e7); rupees %= 1e7;
  const lakh = Math.floor(rupees / 1e5); rupees %= 1e5;
  const thousand = Math.floor(rupees / 1e3); rupees %= 1e3;
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rupees) parts.push(threeDigits(rupees));

  let out = parts.length ? `${parts.join(' ')} Rupees` : '';
  if (paise) out += `${out ? ' and ' : ''}${twoDigits(paise)} Paise`;
  return `${value < 0 ? 'Minus ' : ''}${out} Only`;
}
