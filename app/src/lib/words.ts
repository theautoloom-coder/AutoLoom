/**
 * The shop's words for things the database stores as codes.
 *
 * A bill page that said "PAYMENT: CASH" and "2026-10-03" was reading the
 * database out loud. These turn the stored value into what the counter says.
 */

const PAY_MODE: Record<string, string> = {
  cash: 'Cash',
  upi: 'Online / UPI',
  credit: 'Udhaar',
  card: 'Card',
  bank: 'Bank',
  cheque: 'Cheque',
  mixed: 'Kuch abhi, kuch baad mein',
  adjustment: 'Hisaab se kaat liya',
};

export function payModeLabel(mode: string | null | undefined): string {
  if (!mode) return '—';
  return PAY_MODE[mode] ?? mode;
}

const CUSTOMER_TYPE: Record<string, string> = {
  dealer: 'Dealer', wholesale: 'Thok', workshop: 'Workshop', retail: 'Retail', other: 'Koi aur',
};

export function customerTypeLabel(type: string | null | undefined): string {
  return CUSTOMER_TYPE[type ?? ''] ?? type ?? '';
}

/** Why stock was corrected — the stock_adjustments reason check values. */
export const ADJUST_REASON: Record<string, string> = {
  opening: 'Shuru ka stock', damage: 'Kharab', missing: 'Kam nikla', found: 'Zyada nikla',
  wrong_entry: 'Galat entry', counting_error: 'Ginti galat thi', audit: 'Ginti', free_issue: 'Muft diya', other: 'Aur kuch',
};

/** Car body types as the counter says them. */
export const BODY_TYPE: Record<string, string> = {
  hatchback: 'Hatchback', sedan: 'Sedan', suv: 'SUV', muv: 'MUV / Van', pickup: 'Pickup', 'three-wheeler': 'E-rickshaw / 3-pahiya',
};

/** 'Aaj', 'Kal', '3 Oct', or '3 Oct 2025' when it is not this year. */
export function dayLabel(iso: string | null | undefined, today = new Date()): string {
  if (!iso) return '';
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  const start = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const days = Math.round((start(today) - start(d)) / 86_400_000);
  if (days === 0) return 'Aaj';
  if (days === 1) return 'Kal';
  return d.toLocaleDateString('en-IN', d.getFullYear() === today.getFullYear()
    ? { day: 'numeric', month: 'short' }
    : { day: 'numeric', month: 'short', year: 'numeric' });
}
