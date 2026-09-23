/**
 * Price resolution and price control.
 *
 * The salesperson must never have to guess a rate. For a given customer and
 * SKU there is exactly one approved price, and the app can always explain
 * where it came from.
 */

import { round, margin } from './money';

export type PriceSource = 'customer' | 'price_list' | 'dealer' | 'wholesale' | 'retail' | 'manual';

export type VariantPricing = {
  mrp?: number | null;
  retail_price: number;
  dealer_price?: number | null;
  wholesale_price?: number | null;
  min_selling_price?: number | null;
  avg_cost?: number | null;
  last_purchase_cost?: number | null;
};

export type PriceContext = {
  /** Negotiated price for this customer and this SKU, if any. */
  customerPrice?: number | null;
  /** Override for this SKU inside the customer's price list, if any. */
  priceListItemPrice?: number | null;
  /** Which variant column the customer's price list points at. */
  priceListColumn?: 'retail_price' | 'dealer_price' | 'wholesale_price' | null;
};

export type ResolvedPrice = {
  price: number;
  source: PriceSource;
  /** Human-readable reason, shown under the rate field. */
  label: string;
};

/**
 * Resolve the price to offer. First hit wins:
 *   1. a price negotiated with this customer for this SKU
 *   2. an override inside the customer's price list
 *   3. the variant column the price list points at
 *   4. retail
 */
export function resolvePrice(variant: VariantPricing, ctx: PriceContext = {}): ResolvedPrice {
  if (ctx.customerPrice != null && ctx.customerPrice > 0) {
    return { price: round(ctx.customerPrice), source: 'customer', label: 'Special price for this customer' };
  }

  if (ctx.priceListItemPrice != null && ctx.priceListItemPrice > 0) {
    return { price: round(ctx.priceListItemPrice), source: 'price_list', label: 'Price list rate' };
  }

  const column = ctx.priceListColumn ?? 'retail_price';
  if (column === 'dealer_price' && variant.dealer_price != null && variant.dealer_price > 0) {
    return { price: round(variant.dealer_price), source: 'dealer', label: 'Dealer price' };
  }
  if (column === 'wholesale_price' && variant.wholesale_price != null && variant.wholesale_price > 0) {
    return { price: round(variant.wholesale_price), source: 'wholesale', label: 'Wholesale price' };
  }

  return { price: round(variant.retail_price), source: 'retail', label: 'Retail price' };
}

export type PriceCheck = {
  ok: boolean;
  /** 'floor' = below the permitted selling price, 'margin' = thin margin, 'cost' = below cost. */
  severity: 'ok' | 'margin' | 'floor' | 'cost';
  message: string | null;
  /** True when an approver with sale.override_price must authorise the rate. */
  needsApproval: boolean;
};

/**
 * Check a rate a salesperson typed against the floor and the cost.
 *
 * `marginFloorPct` comes from app settings and only produces a soft warning —
 * the hard stop is `min_selling_price`, and below average cost.
 */
export function checkPrice(
  rate: number,
  variant: VariantPricing,
  opts: { marginFloorPct?: number } = {}
): PriceCheck {
  const cost = variant.avg_cost ?? variant.last_purchase_cost ?? 0;
  const floor = variant.min_selling_price ?? 0;

  if (cost > 0 && rate < cost) {
    return {
      ok: false,
      severity: 'cost',
      message: `Below cost. This SKU costs ₹${round(cost)}.`,
      needsApproval: true,
    };
  }

  if (floor > 0 && rate < floor) {
    return {
      ok: false,
      severity: 'floor',
      message: `Below permitted selling price of ₹${round(floor)}.`,
      needsApproval: true,
    };
  }

  const floorPct = opts.marginFloorPct ?? 0;
  if (cost > 0 && floorPct > 0) {
    const m = margin(rate, cost);
    if (m.pct < floorPct) {
      return {
        ok: true,
        severity: 'margin',
        message: `Thin margin: ${m.pct}% (₹${m.amount} per unit).`,
        needsApproval: false,
      };
    }
  }

  return { ok: true, severity: 'ok', message: null, needsApproval: false };
}

export type CreditStatus = {
  outstanding: number;
  creditLimit: number;
  available: number;
  /** Outstanding after this invoice is added. */
  projected: number;
  exceeded: boolean;
  /** True when the customer has no limit set, so credit is unrestricted. */
  unlimited: boolean;
  message: string | null;
};

/** Credit check shown before a credit sale is posted. */
export function checkCredit(args: {
  outstanding: number;
  creditLimit: number;
  invoiceAmount: number;
}): CreditStatus {
  const outstanding = round(args.outstanding);
  const creditLimit = round(args.creditLimit);
  const projected = round(outstanding + args.invoiceAmount);
  const unlimited = creditLimit <= 0;
  const available = unlimited ? Number.POSITIVE_INFINITY : round(creditLimit - outstanding);
  const exceeded = !unlimited && projected > creditLimit;

  return {
    outstanding,
    creditLimit,
    available: unlimited ? 0 : available,
    projected,
    exceeded,
    unlimited,
    message: exceeded
      ? `Credit limit exceeded. Limit ₹${creditLimit}, outstanding ₹${outstanding}, this bill ₹${round(args.invoiceAmount)}.`
      : null,
  };
}

/** Ageing bucket for a receivable, used by the outstanding report. */
export function ageingBucket(dueDate: string | Date, asOf: Date = new Date()): '0-30' | '31-60' | '61-90' | '90+' | 'current' {
  const due = typeof dueDate === 'string' ? new Date(dueDate) : dueDate;
  const days = Math.floor((asOf.getTime() - due.getTime()) / 86_400_000);
  if (days <= 0) return 'current';
  if (days <= 30) return '0-30';
  if (days <= 60) return '31-60';
  if (days <= 90) return '61-90';
  return '90+';
}

/**
 * Allocate a payment across open documents, oldest first.
 * Returns the allocation rows to write; the caller persists them.
 */
export function allocateFifo(
  amount: number,
  openDocs: Array<{ id: string; doc_type: string; outstanding: number; doc_date: string }>
): Array<{ doc_id: string; doc_type: string; amount: number }> {
  let remaining = round(amount);
  const allocations: Array<{ doc_id: string; doc_type: string; amount: number }> = [];

  const sorted = [...openDocs].sort((a, b) => a.doc_date.localeCompare(b.doc_date));
  for (const doc of sorted) {
    if (remaining <= 0) break;
    const due = round(doc.outstanding);
    if (due <= 0) continue;
    const applied = round(Math.min(remaining, due));
    allocations.push({ doc_id: doc.id, doc_type: doc.doc_type, amount: applied });
    remaining = round(remaining - applied);
  }
  return allocations;
}
