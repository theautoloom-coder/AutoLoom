/**
 * GST computation for sales and purchase documents.
 *
 * IMPORTANT: rates and slabs are data (the `tax_rates` table), never constants
 * in this file. The rules encoded here are structural — how a line is split
 * into taxable value and tax, and when a supply is intra-state versus
 * inter-state. Verify the whole tax treatment with the business's CA before
 * production use.
 */

import { round, roundToRupee, sum } from './money';

export type TaxRate = {
  /** Total percentage, e.g. 18 */
  rate_pct: number;
  cgst_pct: number;
  sgst_pct: number;
  igst_pct: number;
  cess_pct?: number;
};

export type LineInput = {
  qty: number;
  /** Pre-tax unit rate. */
  rate: number;
  /** Percentage discount on the line. Applied before amount discount. */
  discount_pct?: number;
  /** Flat discount amount on the line, after any percentage discount. */
  discount_amt?: number;
  tax_rate_pct: number;
};

export type LineTax = {
  gross: number;
  discount: number;
  taxable_value: number;
  cgst: number;
  sgst: number;
  igst: number;
  tax_total: number;
  line_total: number;
};

export type DocumentTotals = {
  subtotal: number;
  discount_total: number;
  taxable_total: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  other_charges: number;
  round_off: number;
  grand_total: number;
};

/**
 * Intra-state supply (CGST + SGST) when the place of supply matches the
 * seller's state. Otherwise it is inter-state (IGST).
 *
 * Both codes are the two-digit GST state codes ("09" = Uttar Pradesh).
 */
export function isInterstate(sellerStateCode: string | null | undefined, placeOfSupplyCode: string | null | undefined): boolean {
  if (!sellerStateCode || !placeOfSupplyCode) return false;
  return sellerStateCode.trim() !== placeOfSupplyCode.trim();
}

/** Compute one line's taxable value and tax split. */
export function computeLine(line: LineInput, interstate: boolean): LineTax {
  const gross = round(line.qty * line.rate);
  const pctDiscount = round(gross * ((line.discount_pct ?? 0) / 100));
  const discount = round(pctDiscount + (line.discount_amt ?? 0));
  const taxable_value = round(Math.max(gross - discount, 0));

  const totalTax = round(taxable_value * (line.tax_rate_pct / 100));

  let cgst = 0;
  let sgst = 0;
  let igst = 0;
  if (interstate) {
    igst = totalTax;
  } else {
    cgst = round(totalTax / 2);
    // Give any odd paise to SGST so cgst + sgst === totalTax exactly.
    sgst = round(totalTax - cgst);
  }

  return {
    gross,
    discount,
    taxable_value,
    cgst,
    sgst,
    igst,
    tax_total: round(cgst + sgst + igst),
    line_total: round(taxable_value + cgst + sgst + igst),
  };
}

/**
 * Roll lines up into document totals.
 *
 * `roundToRupee` controls whether the grand total is rounded to the nearest
 * rupee with the difference stored in `round_off`, which is what printed
 * invoices in India normally do.
 */
export function computeDocument(
  lines: LineTax[],
  opts: { otherCharges?: number; roundToRupee?: boolean } = {}
): DocumentTotals {
  const { otherCharges = 0, roundToRupee: doRound = true } = opts;

  const subtotal = sum(lines.map((l) => l.gross));
  const discount_total = sum(lines.map((l) => l.discount));
  const taxable_total = sum(lines.map((l) => l.taxable_value));
  const cgst_total = sum(lines.map((l) => l.cgst));
  const sgst_total = sum(lines.map((l) => l.sgst));
  const igst_total = sum(lines.map((l) => l.igst));

  const exact = round(taxable_total + cgst_total + sgst_total + igst_total + otherCharges);
  const grand_total = doRound ? roundToRupee(exact) : exact;
  const round_off = round(grand_total - exact);

  return {
    subtotal,
    discount_total,
    taxable_total,
    cgst_total,
    sgst_total,
    igst_total,
    other_charges: round(otherCharges),
    round_off,
    grand_total,
  };
}

/** Rate-wise summary for the tax table printed on the invoice. */
export function taxSummary(
  lines: Array<LineTax & { tax_rate_pct: number; hsn_code?: string | null }>
): Array<{ tax_rate_pct: number; taxable_value: number; cgst: number; sgst: number; igst: number }> {
  const byRate = new Map<number, { tax_rate_pct: number; taxable_value: number; cgst: number; sgst: number; igst: number }>();
  for (const l of lines) {
    const existing = byRate.get(l.tax_rate_pct) ?? {
      tax_rate_pct: l.tax_rate_pct,
      taxable_value: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
    };
    existing.taxable_value = round(existing.taxable_value + l.taxable_value);
    existing.cgst = round(existing.cgst + l.cgst);
    existing.sgst = round(existing.sgst + l.sgst);
    existing.igst = round(existing.igst + l.igst);
    byRate.set(l.tax_rate_pct, existing);
  }
  return [...byRate.values()].sort((a, b) => a.tax_rate_pct - b.tax_rate_pct);
}

/**
 * Spread freight and other charges across purchase lines by taxable value, so
 * each line gets a realistic landed cost.
 */
export function landedCosts(
  lines: Array<{ qty: number; taxable_value: number }>,
  otherCharges: number
): number[] {
  const base = sum(lines.map((l) => l.taxable_value));
  return lines.map((l) => {
    if (l.qty <= 0) return 0;
    const share = base > 0 ? round(otherCharges * (l.taxable_value / base)) : 0;
    return round((l.taxable_value + share) / l.qty, 4);
  });
}

/** Basic structural check of a GSTIN. Does not verify with the portal. */
export function isValidGstin(gstin: string | null | undefined): boolean {
  if (!gstin) return false;
  return /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/.test(gstin.trim().toUpperCase());
}

/** The state code embedded in a GSTIN, used to default the place of supply. */
export function stateCodeFromGstin(gstin: string | null | undefined): string | null {
  if (!isValidGstin(gstin)) return null;
  return gstin!.trim().slice(0, 2);
}
