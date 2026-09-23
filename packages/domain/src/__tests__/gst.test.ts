import { describe, expect, it } from 'vitest';
import { computeDocument, computeLine, isInterstate, landedCosts, isValidGstin, stateCodeFromGstin, taxSummary } from '../gst';

describe('place of supply', () => {
  it('is intra-state when the customer is in Uttar Pradesh like the seller', () => {
    expect(isInterstate('09', '09')).toBe(false);
  });

  it('is inter-state when the customer is in Delhi', () => {
    expect(isInterstate('09', '07')).toBe(true);
  });

  it('treats a missing state as intra-state rather than guessing IGST', () => {
    expect(isInterstate('09', null)).toBe(false);
  });
});

describe('line tax', () => {
  it('splits 18% into equal CGST and SGST inside the state', () => {
    const line = computeLine({ qty: 2, rate: 1000, tax_rate_pct: 18 }, false);
    expect(line.taxable_value).toBe(2000);
    expect(line.cgst).toBe(180);
    expect(line.sgst).toBe(180);
    expect(line.igst).toBe(0);
    expect(line.line_total).toBe(2360);
  });

  it('charges IGST on an inter-state sale', () => {
    const line = computeLine({ qty: 2, rate: 1000, tax_rate_pct: 18 }, true);
    expect(line.igst).toBe(360);
    expect(line.cgst + line.sgst).toBe(0);
  });

  it('applies percentage discount before flat discount', () => {
    const line = computeLine({ qty: 1, rate: 1000, discount_pct: 10, discount_amt: 50, tax_rate_pct: 18 }, false);
    expect(line.discount).toBe(150);
    expect(line.taxable_value).toBe(850);
  });

  it('never lets a discount push the taxable value below zero', () => {
    const line = computeLine({ qty: 1, rate: 100, discount_amt: 500, tax_rate_pct: 18 }, false);
    expect(line.taxable_value).toBe(0);
  });

  it('keeps CGST plus SGST exactly equal to the total tax on odd amounts', () => {
    const line = computeLine({ qty: 1, rate: 333.33, tax_rate_pct: 5 }, false);
    expect(line.cgst + line.sgst).toBeCloseTo(line.tax_total, 2);
  });

  it('handles a nil-rated item without special casing', () => {
    const line = computeLine({ qty: 3, rate: 200, tax_rate_pct: 0 }, false);
    expect(line.tax_total).toBe(0);
    expect(line.line_total).toBe(600);
  });
});

describe('document totals', () => {
  it('rounds the grand total to the rupee and stores the difference', () => {
    const lines = [computeLine({ qty: 1, rate: 1234.56, tax_rate_pct: 18 }, false)];
    const totals = computeDocument(lines);
    expect(Number.isInteger(totals.grand_total)).toBe(true);
    expect(totals.grand_total - totals.round_off).toBeCloseTo(
      totals.taxable_total + totals.cgst_total + totals.sgst_total,
      2
    );
  });

  it('adds other charges before rounding', () => {
    const lines = [computeLine({ qty: 1, rate: 1000, tax_rate_pct: 18 }, false)];
    const totals = computeDocument(lines, { otherCharges: 100 });
    expect(totals.grand_total).toBe(1280);
  });

  it('produces a rate-wise summary for the printed tax table', () => {
    const rows = [
      { ...computeLine({ qty: 1, rate: 1000, tax_rate_pct: 18 }, false), tax_rate_pct: 18 },
      { ...computeLine({ qty: 1, rate: 500, tax_rate_pct: 28 }, false), tax_rate_pct: 28 },
      { ...computeLine({ qty: 2, rate: 250, tax_rate_pct: 18 }, false), tax_rate_pct: 18 },
    ];
    const summary = taxSummary(rows);
    expect(summary).toHaveLength(2);
    expect(summary[0].tax_rate_pct).toBe(18);
    expect(summary[0].taxable_value).toBe(1500);
  });
});

describe('landed cost', () => {
  it('spreads freight across lines in proportion to value', () => {
    const lines = [
      { qty: 10, taxable_value: 1000 },
      { qty: 10, taxable_value: 3000 },
    ];
    const costs = landedCosts(lines, 400);
    expect(costs[0]).toBeCloseTo(110, 2); // 1000 + 100 freight, over 10 pcs
    expect(costs[1]).toBeCloseTo(330, 2); // 3000 + 300 freight, over 10 pcs
  });

  it('returns zero for a zero-quantity line rather than dividing by zero', () => {
    expect(landedCosts([{ qty: 0, taxable_value: 0 }], 100)[0]).toBe(0);
  });
});

describe('GSTIN', () => {
  it('accepts a well-formed Uttar Pradesh GSTIN', () => {
    expect(isValidGstin('09ABCDE1234F1Z5')).toBe(true);
    expect(stateCodeFromGstin('09ABCDE1234F1Z5')).toBe('09');
  });

  it('rejects a GSTIN of the wrong length', () => {
    expect(isValidGstin('09ABCDE1234F1Z')).toBe(false);
    expect(stateCodeFromGstin('rubbish')).toBeNull();
  });
});
