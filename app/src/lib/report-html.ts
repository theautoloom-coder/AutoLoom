/**
 * A report as a printable page.
 *
 * Reports could only leave the app as CSV, and only on the web — on a phone
 * there was no way to get the month's figures to an accountant, a bank or a
 * partner. CSV is also the wrong artefact for most of those readers: they want
 * something that looks like a statement, not a file that opens crooked in
 * Excel.
 *
 * This produces plain printable HTML and hands it to the same sharer the bill
 * uses, so the web gets a print dialog (→ Save as PDF) and the phone gets a
 * real PDF it can attach to WhatsApp.
 *
 * Deliberately no colour and no logo: this is a page that gets printed on a
 * cheap inkjet, photographed, and forwarded. Black on white survives all three.
 */

export type ReportCol = { key: string; label: string; num?: boolean; money?: boolean };

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

const inr = (n: number) =>
  '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(Math.round(Number(n) || 0));

const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export function reportHtml(args: {
  shopName: string;
  shopLine?: string | null;
  title: string;
  from?: string;
  to?: string;
  cols: ReportCol[];
  rows: Record<string, unknown>[];
  totals?: Record<string, number>;
  note?: string | null;
}): string {
  const { shopName, shopLine, title, from, to, cols, rows, totals, note } = args;

  // A null figure means "does not apply to this row" — a summary's count row
  // has no rupee value — so it prints blank rather than as a misleading ₹0.
  const cell = (r: Record<string, unknown>, c: ReportCol) => {
    const v = r[c.key];
    if (v === null || v === undefined || v === '') return '';
    return c.money ? inr(Number(v)) : c.num ? String(Number(v) || 0) : esc(v);
  };

  const body = rows
    .map((r) => `<tr>${cols.map((c) => `<td class="${c.money || c.num ? 'n' : ''}">${cell(r, c)}</td>`).join('')}</tr>`)
    .join('');

  // A total row only where a total means something — summing a column of
  // invoice numbers is worse than leaving it blank.
  const hasTotals = totals && cols.some((c) => (c.money || c.num) && totals[c.key] !== undefined);
  const totalRow = hasTotals
    ? `<tr class="t">${cols
        .map((c, i) =>
          c.money
            ? `<td class="n">${inr(totals![c.key] ?? 0)}</td>`
            : c.num
              ? `<td class="n">${Math.round(totals![c.key] ?? 0)}</td>`
              : `<td>${i === 0 ? 'Kul' : ''}</td>`,
        )
        .join('')}</tr>`
    : '';

  const period = from && to ? (from === to ? day(from) : `${day(from)} — ${day(to)}`) : '';

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { margin: 14mm; }
  * { box-sizing: border-box; }
  body { font: 12px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; }
  header { border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
  h1 { font-size: 20px; margin: 0; letter-spacing: -0.3px; }
  .sub { color: #555; font-size: 12px; margin-top: 2px; }
  h2 { font-size: 15px; margin: 0 0 2px; }
  .period { color: #555; font-size: 12px; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th { text-align: left; font-size: 10px; letter-spacing: .08em; text-transform: uppercase;
       color: #555; border-bottom: 1px solid #bbb; padding: 6px 6px; }
  td { padding: 6px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.n, th.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.t td { border-top: 2px solid #111; border-bottom: none; font-weight: 700; padding-top: 8px; }
  tfoot { color: #777; font-size: 10px; }
  .note { margin-top: 10px; color: #555; font-size: 11px; }
  .empty { padding: 24px 0; color: #777; }
  @media print { body { -webkit-print-color-adjust: exact; } }
</style></head><body>
<header>
  <h1>${esc(shopName)}</h1>
  ${shopLine ? `<div class="sub">${esc(shopLine)}</div>` : ''}
</header>

<h2>${esc(title)}</h2>
${period ? `<div class="period">${esc(period)}</div>` : ''}

${rows.length === 0
    ? '<div class="empty">Is period mein koi entry nahi.</div>'
    : `<table>
  <thead><tr>${cols.map((c) => `<th class="${c.money || c.num ? 'n' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
  <tbody>${body}${totalRow}</tbody>
</table>`}

${note ? `<div class="note">${esc(note)}</div>` : ''}
<div class="note">${rows.length} ${rows.length === 1 ? 'entry' : 'entries'} · ${day(new Date().toISOString())} ko nikala gaya</div>
</body></html>`;
}
