/**
 * WhatsApp messages without any API: a wa.me deep link opens WhatsApp (phone
 * or WhatsApp Web) with the message prefilled for the customer's number; the
 * staff member taps Send. Works offline up to the tap, needs no Meta account,
 * and the message goes from whichever WhatsApp is logged in on that device
 * (the shop's WhatsApp Business number on the counter phone).
 *
 * Templates live in app_settings so the owner can edit the Hinglish/Hindi
 * wording from Admin.
 */
import { Linking, Platform } from 'react-native';

import { formatINR } from '@domain';

export type WaSettings = {
  shopName: string;
  whatsappNumber: string | null;
  upiId: string | null;
  upiPayeeName: string | null;
  templates: { slip: string; reminder: string; paid: string };
};

export const DEFAULT_TEMPLATES = {
  slip: 'Namaste {name} ji 🙏\n{shop} se aaj ka maal:\n{items}\nBill {bill_no} · Total ₹{total}\nAapka total pending: ₹{pending}\n{upi_line}\nDhanyavaad!',
  reminder: 'Namaste {name} ji 🙏\n{shop} ki taraf se payment reminder.\nAapka pending balance: ₹{pending}\n{upi_line}\nPayment karne ke baad screenshot bhej dijiye. Dhanyavaad! 🙏',
  paid: 'Namaste {name} ji 🙏\n₹{amount} payment mil gayi ({mode}). Dhanyavaad!\nAb pending: ₹{pending}',
};

/** Indian mobile → international digits for wa.me (10 digits get 91 prefixed). */
export function waNumber(mobile: string | null | undefined): string | null {
  if (!mobile) return null;
  const d = mobile.replace(/\D/g, '');
  if (d.length === 10) return `91${d}`;
  if (d.length === 12 && d.startsWith('91')) return d;
  if (d.length === 11 && d.startsWith('0')) return `91${d.slice(1)}`;
  return d.length >= 10 ? d : null;
}

/** UPI intent link that opens any UPI app with the amount prefilled. */
export function upiLink(upiId: string, payee: string | null, amount?: number | null, note?: string): string {
  const params = new URLSearchParams({ pa: upiId, pn: payee || 'AutoLoom', cu: 'INR' });
  if (amount && amount > 0) params.set('am', amount.toFixed(2));
  if (note) params.set('tn', note.slice(0, 40));
  return `upi://pay?${params.toString()}`;
}

function money(n: number): string {
  return formatINR(n, { symbol: false });
}

export function upiLine(s: WaSettings, amount?: number | null): string {
  if (!s.upiId) return '';
  const link = upiLink(s.upiId, s.upiPayeeName, amount);
  return `UPI: ${s.upiId}${s.upiPayeeName ? ` (${s.upiPayeeName})` : ''}\nPay link: ${link}`;
}

export function fill(template: string, vars: Record<string, string | number | null | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (_m, k: string) => {
    const v = vars[k];
    return v == null ? '' : String(v);
  }).replace(/\n{3,}/g, '\n\n').trim();
}

export function slipMessage(s: WaSettings, args: { name: string; billNo: string; date: string; total: number; pending: number; items: Array<{ description: string; qty: number; rate: number }> }): string {
  const items = args.items.map((i) => `• ${i.description} × ${i.qty} @ ₹${money(i.rate)}`).join('\n');
  return fill(s.templates.slip, { name: args.name, shop: s.shopName, items, bill_no: args.billNo, date: args.date, total: money(args.total), pending: money(args.pending), upi_line: upiLine(s, args.pending) });
}

/**
 * The full khata — every bill and payment for a period, then the balance.
 *
 * The reminder sends a total; a dealer who asks *poora hisaab bhejo* wants the
 * working. Without this the owner screenshots the customer screen or reads it
 * down the phone, which is how disagreements start.
 *
 * Built as plain aligned text rather than a table: WhatsApp has no monospace in
 * the message body a shopkeeper's phone will render reliably, so the amount
 * goes last on each line where the eye can still run down it.
 */
export function statementMessage(
  s: WaSettings,
  args: {
    name: string;
    from: string;
    to: string;
    opening: number;
    rows: { date: string; label: string; debit: number; credit: number }[];
    closing: number;
  },
): string {
  const d = (iso: string) => {
    const t = new Date(iso);
    return Number.isNaN(t.getTime()) ? iso : t.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
  };

  const lines = args.rows.map((r) =>
    `${d(r.date)}  ${r.label}  ${r.debit ? '+' : '−'}${money(r.debit || r.credit)}`,
  );

  return [
    `*${s.shopName}*`,
    `Khata: ${args.name}`,
    `${d(args.from)} se ${d(args.to)} tak`,
    '',
    `Purana baaki: ${money(args.opening)}`,
    ...(lines.length ? ['', ...lines] : ['', 'Is beech koi len-den nahi.']),
    '',
    `*Ab baaki: ${money(args.closing)}*`,
    upiLine(s, args.closing),
  ].filter((l) => l !== null && l !== undefined).join('\n');
}

export function reminderMessage(s: WaSettings, args: { name: string; pending: number; date?: string }): string {
  return fill(s.templates.reminder, { name: args.name, shop: s.shopName, pending: money(args.pending), date: args.date ?? new Date().toLocaleDateString('en-IN'), upi_line: upiLine(s, args.pending) });
}

export function paidMessage(s: WaSettings, args: { name: string; amount: number; mode: string; pending: number }): string {
  return fill(s.templates.paid, { name: args.name, shop: s.shopName, amount: money(args.amount), mode: args.mode.toUpperCase(), pending: money(args.pending) });
}

/** Open WhatsApp with the message ready for this number. Returns false if no valid number. */
export async function openWhatsApp(mobile: string | null | undefined, text: string): Promise<boolean> {
  const n = waNumber(mobile);
  if (!n) return false;
  const url = `https://wa.me/${n}?text=${encodeURIComponent(text)}`;
  if (Platform.OS === 'web') {
    window.open(url, '_blank');
    return true;
  }
  const app = `whatsapp://send?phone=${n}&text=${encodeURIComponent(text)}`;
  if (await Linking.canOpenURL(app).catch(() => false)) await Linking.openURL(app);
  else await Linking.openURL(url);
  return true;
}
