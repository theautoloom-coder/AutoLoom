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
 * A report is a few headline figures and one or more tables. A table row can
 * be a heading (a day, a partner) or a subtotal, so a month of bills reads as
 * days, not as one long list. Black on white, a single accent rule: it gets
 * printed on a cheap inkjet, photographed and forwarded, and survives all three.
 */

export type ReportCol = { key: string; label: string; num?: boolean; money?: boolean };

/** A row; `_heading` makes it a full-width heading, `_subtotal` a bold subtotal. */
export type ReportRow = Record<string, unknown> & { _heading?: string; _subtotal?: boolean };

export type ReportSection = {
  title?: string;
  cols: ReportCol[];
  rows: ReportRow[];
  totals?: Record<string, number>;
  note?: string | null;
  empty?: string;
};

export type ReportFigure = { label: string; value: string; tone?: 'plus' | 'minus' | 'strong'; sub?: string };

const esc = (v: unknown) =>
  String(v ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export const inr = (n: number) =>
  (Number(n) < 0 ? '−' : '') + '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.abs(Math.round(Number(n) || 0)));

export const day = (iso: string) => {
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

function sectionHtml(s: ReportSection): string {
  const cell = (r: ReportRow, c: ReportCol) => {
    const v = r[c.key];
    // A null figure means "does not apply to this row" — it prints blank
    // rather than as a misleading ₹0.
    if (v === null || v === undefined || v === '') return '';
    return c.money ? inr(Number(v)) : c.num ? String(Math.round((Number(v) || 0) * 1000) / 1000) : esc(v);
  };
  const body = s.rows.map((r) => {
    if (r._heading) return `<tr class="h"><td colspan="${s.cols.length}">${esc(r._heading)}</td></tr>`;
    const cls = r._subtotal ? ' class="st"' : '';
    return `<tr${cls}>${s.cols.map((c) => `<td class="${c.money || c.num ? 'n' : ''}">${cell(r, c)}</td>`).join('')}</tr>`;
  }).join('');

  // A total row only where a total means something — summing a column of
  // invoice numbers is worse than leaving it blank.
  const hasTotals = s.totals && s.cols.some((c) => (c.money || c.num) && s.totals![c.key] !== undefined);
  const totalRow = hasTotals
    ? `<tr class="t">${s.cols.map((c, i) =>
        (c.money || c.num) && s.totals![c.key] !== undefined
          ? `<td class="n">${c.money ? inr(s.totals![c.key]) : Math.round(s.totals![c.key])}</td>`
          : `<td>${i === 0 ? 'Kul' : ''}</td>`).join('')}</tr>`
    : '';

  const dataRows = s.rows.filter((r) => !r._heading && !r._subtotal).length;
  return `<section>
  ${s.title ? `<h3>${esc(s.title)}</h3>` : ''}
  ${dataRows === 0
    ? `<div class="empty">${esc(s.empty ?? 'Is period mein koi entry nahi.')}</div>`
    : `<table>
    <thead><tr>${s.cols.map((c) => `<th class="${c.money || c.num ? 'n' : ''}">${esc(c.label)}</th>`).join('')}</tr></thead>
    <tbody>${body}${totalRow}</tbody>
  </table>`}
  ${s.note ? `<div class="note">${esc(s.note)}</div>` : ''}
</section>`;
}

export function reportHtml(args: {
  shopName: string;
  shopLine?: string | null;
  title: string;
  subtitle?: string | null;
  from?: string;
  to?: string;
  figures?: ReportFigure[];
  sections?: ReportSection[];
  /** One-table shorthand, kept for the simple reports. */
  cols?: ReportCol[];
  rows?: ReportRow[];
  totals?: Record<string, number>;
  note?: string | null;
}): string {
  const { shopName, shopLine, title, subtitle, from, to, figures, note } = args;
  const sections = args.sections ?? (args.cols ? [{ cols: args.cols, rows: args.rows ?? [], totals: args.totals }] : []);
  const period = from && to ? (from === to ? day(from) : `${day(from)} — ${day(to)}`) : '';

  const figs = (figures ?? []).length
    ? `<div class="figs">${figures!.map((f) => `
      <div class="fig ${f.tone ?? ''}"><div class="fl">${esc(f.label)}</div><div class="fv">${esc(f.value)}</div>${f.sub ? `<div class="fs">${esc(f.sub)}</div>` : ''}</div>`).join('')}</div>`
    : '';

  return `<!doctype html><html><head><meta charset="utf-8">
<title>${esc(title)}</title>
<style>
  @page { margin: 13mm; }
  * { box-sizing: border-box; }
  body { font: 11.5px/1.45 -apple-system, "Segoe UI", Roboto, sans-serif; color: #111; margin: 0; }
  header { display: flex; justify-content: space-between; align-items: flex-end; border-bottom: 3px solid #D91E2E; padding-bottom: 8px; margin-bottom: 14px; }
  h1 { font-size: 19px; margin: 0; letter-spacing: -0.3px; }
  .sub { color: #555; font-size: 11px; margin-top: 2px; }
  .gen { color: #777; font-size: 10px; text-align: right; }
  h2 { font-size: 16px; margin: 0; }
  .period { color: #444; font-size: 12px; margin-top: 2px; }
  .subtitle { color: #555; font-size: 11px; margin-top: 2px; }
  h3 { font-size: 12px; margin: 18px 0 0; text-transform: uppercase; letter-spacing: .06em; color: #333; }
  .figs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 12px; }
  .fig { flex: 1 1 130px; border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; }
  .fig.strong { border: 1.5px solid #111; }
  .fl { font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase; color: #666; }
  .fv { font-size: 16px; font-weight: 700; margin-top: 2px; font-variant-numeric: tabular-nums; }
  .fig.plus .fv { color: #0a7a3d; } .fig.minus .fv { color: #b3141f; }
  .fs { font-size: 10px; color: #777; margin-top: 1px; }
  table { width: 100%; border-collapse: collapse; margin-top: 8px; }
  th { text-align: left; font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase;
       color: #555; border-bottom: 1.5px solid #999; padding: 5px 6px; }
  td { padding: 5px 6px; border-bottom: 1px solid #eee; vertical-align: top; }
  td.n, th.n { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
  tr.h td { background: #f3f3f3; font-weight: 700; border-bottom: 1px solid #ccc; padding-top: 7px; }
  tr.st td { font-weight: 700; border-bottom: 1px solid #bbb; }
  tr.t td { border-top: 2px solid #111; border-bottom: none; font-weight: 800; padding-top: 7px; }
  thead { display: table-header-group; }
  tr { page-break-inside: avoid; }
  .note { margin-top: 8px; color: #555; font-size: 10.5px; }
  .empty { padding: 14px 0; color: #777; }
  footer { margin-top: 18px; padding-top: 6px; border-top: 1px solid #ddd; color: #888; font-size: 9.5px; }
  @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
</style></head><body>
<header>
  <div><h1>${esc(shopName)}</h1>${shopLine ? `<div class="sub">${esc(shopLine)}</div>` : ''}</div>
  <div class="gen">${day(new Date().toISOString())}</div>
</header>
<h2>${esc(title)}</h2>
${period ? `<div class="period">${esc(period)}</div>` : ''}
${subtitle ? `<div class="subtitle">${esc(subtitle)}</div>` : ''}
${figs}
${sections.map(sectionHtml).join('')}
${note ? `<div class="note">${esc(note)}</div>` : ''}
<footer>AutoLoom se nikala gaya · ${day(new Date().toISOString())}</footer>
</body></html>`;
}
