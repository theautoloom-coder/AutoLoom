/**
 * GST invoice as printable HTML. Used for the PDF on phones (expo-print) and
 * for the print dialog on the web. Everything comes from the frozen invoice
 * rows, so a reprint years later shows exactly what was issued.
 */
import { Platform } from 'react-native';
import { amountInWords, formatINR, taxSummary } from '@domain';

export type InvoiceForPrint = {
  doc_type: string; doc_no: string | null; doc_date: string; due_date: string | null; status: string; payment_mode: string | null;
  customer_name: string | null; customer_gstin: string | null; customer_state_code: string | null; place_of_supply_state: string | null; is_interstate: number;
  subtotal: number; discount_total: number; taxable_total: number; cgst_total: number; sgst_total: number; igst_total: number; other_charges: number; round_off: number; grand_total: number; paid_total: number;
  notes: string | null; against_no?: string | null;
  customer: { business_name: string | null; address_line1: string | null; address_line2: string | null; city: string | null; state_name: string | null; pincode: string | null; mobile: string | null } | null;
  vehicle?: { registration_no: string; model_name: string | null } | null;
  lines: Array<{ description: string; hsn_code: string | null; qty: number; unit_code: string | null; rate: number; discount_pct: number; discount_amt: number; taxable_value: number; tax_rate_pct: number; cgst: number; sgst: number; igst: number; line_total: number; sku: string }>;
  company: { legal_name: string; trade_name: string | null; gstin: string | null; state_code: string; state_name: string; address_line1: string | null; address_line2: string | null; city: string | null; pincode: string | null; phone: string | null; email: string | null; bank_name: string | null; bank_account_no: string | null; bank_ifsc: string | null; upi_id: string | null; upi_payee_name?: string | null; whatsapp_number?: string | null; invoice_footer: string | null; invoice_terms: string | null };
};

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const money = (n: number) => formatINR(n, { paise: true, symbol: false });

export function invoiceHtml(inv: InvoiceForPrint, opts: { gst?: boolean } = {}): string {
  const c = inv.company;
  const isCN = inv.doc_type === 'credit_note';
  const gst = opts.gst ?? inv.cgst_total + inv.sgst_total + inv.igst_total > 0;
  const title = isCN ? (gst ? 'CREDIT NOTE' : 'RETURN') : gst ? (inv.customer_gstin ? 'TAX INVOICE' : 'INVOICE') : 'BILL';
  const inter = !!inv.is_interstate;
  const summary = taxSummary(inv.lines.map((l) => ({ gross: 0, discount: 0, tax_total: l.cgst + l.sgst + l.igst, ...l })));
  const addr = [inv.customer?.address_line1, inv.customer?.address_line2, [inv.customer?.city, inv.customer?.pincode].filter(Boolean).join(' '), inv.customer?.state_name].filter(Boolean);
  const caddr = [c.address_line1, c.address_line2, [c.city, c.pincode].filter(Boolean).join(' '), c.state_name].filter(Boolean);

  const rows = inv.lines.map((l, i) => `
    <tr>
      <td class="c">${i + 1}</td>
      <td>${esc(l.description)}<div class="sub">${esc(l.sku)}</div></td>
      ${gst ? `<td class="c">${esc(l.hsn_code ?? '')}</td>` : ''}
      <td class="r">${l.qty}${l.unit_code ? ` ${esc(l.unit_code)}` : ''}</td>
      <td class="r">${money(l.rate)}</td>
      <td class="r">${l.discount_pct ? `${l.discount_pct}%` : l.discount_amt ? money(l.discount_amt) : ''}</td>
      ${gst ? `<td class="r">${money(l.taxable_value)}</td><td class="c">${l.tax_rate_pct}%</td>` : ''}
      <td class="r">${money(l.line_total)}</td>
    </tr>`).join('');

  const taxRows = summary.map((s) => `
    <tr><td>${s.tax_rate_pct}%</td><td class="r">${money(s.taxable_value)}</td>
    ${inter ? `<td class="r">${money(s.igst)}</td>` : `<td class="r">${money(s.cgst)}</td><td class="r">${money(s.sgst)}</td>`}
    <td class="r">${money(s.cgst + s.sgst + s.igst)}</td></tr>`).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(inv.doc_no ?? 'Invoice')}</title>
<style>
  @page { size: A4; margin: 12mm; }
  body { font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; font-size: 11px; color: #111; margin: 0; }
  .wrap { max-width: 190mm; margin: 0 auto; }
  .head { display: flex; justify-content: space-between; border-bottom: 2px solid #D8141A; padding-bottom: 8px; }
  .brand { font-size: 18px; font-weight: 700; color: #D8141A; }
  .muted { color: #555; }
  .title { font-size: 14px; font-weight: 700; letter-spacing: 1px; text-align: right; }
  .meta { text-align: right; }
  .parties { display: flex; gap: 16px; margin: 10px 0; }
  .box { flex: 1; border: 1px solid #ccc; padding: 6px 8px; border-radius: 4px; }
  .box h4 { margin: 0 0 4px; font-size: 10px; text-transform: uppercase; letter-spacing: .6px; color: #666; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #ccc; padding: 4px 6px; vertical-align: top; }
  th { background: #EAEDF3; font-size: 10px; text-transform: uppercase; letter-spacing: .4px; text-align: left; }
  .r { text-align: right; white-space: nowrap; } .c { text-align: center; }
  .sub { color: #777; font-size: 9px; }
  .totals { display: flex; justify-content: space-between; gap: 16px; margin-top: 10px; align-items: flex-start; }
  .totals table { width: auto; min-width: 220px; }
  .grand td { font-weight: 700; font-size: 12px; background: #EAEDF3; }
  .words { font-style: italic; margin-top: 6px; }
  .foot { display: flex; justify-content: space-between; margin-top: 18px; gap: 16px; }
  .sig { text-align: right; min-width: 180px; padding-top: 30px; border-top: 1px solid #999; }
  .cancel { position: fixed; top: 40%; left: 20%; font-size: 64px; color: rgba(200,50,50,.25); transform: rotate(-20deg); font-weight: 800; }
  .terms { white-space: pre-wrap; color: #555; font-size: 10px; }
</style></head><body><div class="wrap">
${inv.status === 'cancelled' ? '<div class="cancel">RADD</div>' : ''}
<div class="head">
  <div>
    <div class="brand">${esc(c.trade_name || c.legal_name)}</div>
    ${c.trade_name ? `<div class="muted">${esc(c.legal_name)}</div>` : ''}
    <div class="muted">${caddr.map(esc).join(', ')}</div>
    <div class="muted">${gst && c.gstin ? `GSTIN ${esc(c.gstin)} · ` : ''}${gst ? `State ${esc(c.state_name)} (${esc(c.state_code)})` : ''}${c.phone ? ` · ${esc(c.phone)}` : ''}${c.email ? ` · ${esc(c.email)}` : ''}</div>
  </div>
  <div class="meta">
    <div class="title">${title}</div>
    <div><b>${esc(inv.doc_no ?? 'DRAFT')}</b></div>
    <div>Date ${esc(inv.doc_date)}</div>
    ${inv.due_date && inv.payment_mode === 'credit' ? `<div>Due ${esc(inv.due_date)}</div>` : ''}
    ${inv.against_no ? `<div>Against invoice ${esc(inv.against_no)}</div>` : ''}
    <div class="muted">${inv.payment_mode ? esc(inv.payment_mode.toUpperCase()) : ''}</div>
  </div>
</div>
<div class="parties">
  <div class="box">
    <h4>Kiske naam</h4>
    <div><b>${esc(inv.customer?.business_name || inv.customer_name)}</b></div>
    ${inv.customer?.business_name && inv.customer_name !== inv.customer?.business_name ? `<div>${esc(inv.customer_name)}</div>` : ''}
    <div>${addr.map(esc).join(', ')}</div>
    ${inv.customer?.mobile ? `<div>Mobile ${esc(inv.customer.mobile)}</div>` : ''}
    ${gst ? (inv.customer_gstin ? `<div>GSTIN ${esc(inv.customer_gstin)}</div>` : '<div class="muted">Unregistered (B2C)</div>') : ''}
  </div>
  <div class="box">
    <h4>Supply</h4>
    ${gst ? `<div>Place of supply: ${esc(inv.place_of_supply_state ?? inv.customer_state_code ?? c.state_code)}</div><div>${inter ? 'Inter-state · IGST' : 'Intra-state · CGST + SGST'}</div>` : `<div>${esc(inv.payment_mode === 'credit' ? 'Udhaar · pay later' : (inv.payment_mode ?? '').toUpperCase())}</div>`}
    ${inv.vehicle ? `<div>Vehicle: ${esc(inv.vehicle.registration_no)}${inv.vehicle.model_name ? ` (${esc(inv.vehicle.model_name)})` : ''}</div>` : ''}
    ${inv.notes ? `<div class="muted">${esc(inv.notes)}</div>` : ''}
  </div>
</div>
<table>
  <thead><tr><th class="c">#</th><th>Item</th>${gst ? '<th class="c">HSN</th>' : ''}<th class="r">Qty</th><th class="r">Rate</th><th class="r">Chhoot</th>${gst ? '<th class="r">Taxable</th><th class="c">GST</th>' : ''}<th class="r">Amount</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="totals">
  <div>
    ${gst ? `<table>
      <thead><tr><th>Rate</th><th class="r">Taxable</th>${inter ? '<th class="r">IGST</th>' : '<th class="r">CGST</th><th class="r">SGST</th>'}<th class="r">Tax</th></tr></thead>
      <tbody>${taxRows}</tbody>
    </table>` : ''}
    <div class="words"><b>${esc(amountInWords(inv.grand_total))}</b></div>
    ${c.whatsapp_number ? `<div class="muted" style="margin-top:6px">WhatsApp: ${esc(c.whatsapp_number)}</div>` : ''}
    ${c.upi_id ? `<div class="muted">UPI: ${esc(c.upi_id)}${c.upi_payee_name ? ` (${esc(c.upi_payee_name)})` : ''}</div>` : ''}
  </div>
  <table>
    <tr><td>Subtotal</td><td class="r">${money(inv.subtotal)}</td></tr>
    ${inv.discount_total ? `<tr><td>Chhoot</td><td class="r">- ${money(inv.discount_total)}</td></tr>` : ''}
    ${gst ? `<tr><td>Taxable value</td><td class="r">${money(inv.taxable_total)}</td></tr>
    ${inter ? `<tr><td>IGST</td><td class="r">${money(inv.igst_total)}</td></tr>` : `<tr><td>CGST</td><td class="r">${money(inv.cgst_total)}</td></tr><tr><td>SGST</td><td class="r">${money(inv.sgst_total)}</td></tr>`}` : ''}
    ${inv.other_charges ? `<tr><td>Aur kharcha</td><td class="r">${money(inv.other_charges)}</td></tr>` : ''}
    ${inv.round_off ? `<tr><td>Round off</td><td class="r">${money(inv.round_off)}</td></tr>` : ''}
    <tr class="grand"><td>${isCN ? 'Credit' : 'Grand total'}</td><td class="r">₹ ${money(inv.grand_total)}</td></tr>
    ${!isCN && inv.paid_total ? `<tr><td>Jama</td><td class="r">${money(inv.paid_total)}</td></tr><tr><td>Baaki paisa</td><td class="r">${money(inv.grand_total - inv.paid_total)}</td></tr>` : ''}
  </table>
</div>
<div class="foot">
  <div>
    ${c.bank_name || c.upi_id ? `<div><b>Payment</b></div>${c.bank_name ? `<div>${esc(c.bank_name)} · A/c ${esc(c.bank_account_no)} · IFSC ${esc(c.bank_ifsc)}</div>` : ''}${c.upi_id ? `<div>UPI ${esc(c.upi_id)}</div>` : ''}` : ''}
    ${c.invoice_terms ? `<div class="terms" style="margin-top:6px">${esc(c.invoice_terms)}</div>` : ''}
  </div>
  <div class="sig">For ${esc(c.trade_name || c.legal_name)}<br/>Dastakhat</div>
</div>
${c.invoice_footer ? `<div class="muted" style="text-align:center;margin-top:12px">${esc(c.invoice_footer)}</div>` : ''}
</div></body></html>`;
}

/** Print or share the invoice: PDF share sheet on phones, print dialog on web. */
export async function shareInvoiceHtml(html: string, fileName: string): Promise<void> {
  // Platform.OS, not feature sniffing. The old guard rejected the browser when
  // `'expo' in globalThis` was true — which it IS on Expo web — so every
  // "PDF / print" press on the web dashboard silently took the native path,
  // called into an expo-print stub, and did nothing at all. No window, no
  // error, no PDF.
  if (Platform.OS === 'web') {
    const w = window.open('', '_blank');
    if (!w) throw new Error('Allow pop-ups to print the invoice.');
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);
    return;
  }
  const Print = require('expo-print') as typeof import('expo-print');
  const Sharing = require('expo-sharing') as typeof import('expo-sharing');
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: fileName, UTI: 'com.adobe.pdf' });
  else await Print.printAsync({ uri });
}
