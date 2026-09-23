import { describe, expect, it } from 'vitest';
import {
  movementClass,
  newAverageCost,
  reversalMovements,
  signedQty,
  stockOnHand,
  stockStatus,
  suggestedReorderQty,
} from '../stock';
import { financialYear, formatDocNo, formatRegistration, normaliseRegistration, uuidv7 } from '../numbering';
import { amountInWords, formatINR, formatINRShort, margin } from '../money';

describe('movement signs', () => {
  it('makes a sale reduce stock even when the user types a positive quantity', () => {
    expect(signedQty('sale', 5)).toBe(-5);
  });

  it('makes a purchase increase stock', () => {
    expect(signedQty('purchase', 100)).toBe(100);
  });

  it('leaves an adjustment signed the way the user entered it', () => {
    expect(signedQty('adjustment', -7)).toBe(-7);
    expect(signedQty('adjustment', 7)).toBe(7);
  });

  it('derives stock from the movement history', () => {
    // purchase +100, sale -10, sale -5, damage -2, return +1
    expect(stockOnHand([{ qty: 100 }, { qty: -10 }, { qty: -5 }, { qty: -2 }, { qty: 1 }])).toBe(84);
  });
});

describe('average cost', () => {
  it('takes the new cost when there was no stock', () => {
    expect(newAverageCost({ currentQty: 0, currentAvg: 0, receivedQty: 10, receivedCost: 1200 })).toBe(1200);
  });

  it('weights the old and new stock', () => {
    // 10 @ 1000 plus 10 @ 1200 averages to 1100
    expect(newAverageCost({ currentQty: 10, currentAvg: 1000, receivedQty: 10, receivedCost: 1200 })).toBe(1100);
  });

  it('barely moves when a small quantity arrives at a higher price', () => {
    const avg = newAverageCost({ currentQty: 190, currentAvg: 1000, receivedQty: 10, receivedCost: 1200 });
    expect(avg).toBeCloseTo(1010, 0);
  });
});

describe('cancellation', () => {
  it('writes reversing rows that point back at the originals', () => {
    const originals = [
      { id: 'm1', variant_id: 'v1', location_id: 'l1', qty: -5, movement_type: 'sale' as const, ref_line_id: 'line1', unit_cost: 1450 },
    ];
    const reversals = reversalMovements(originals, 'sales_invoice', 'inv1');
    expect(reversals[0].qty).toBe(5);
    expect(reversals[0].movement_type).toBe('cancel_reversal');
    expect(reversals[0].reversal_of_id).toBe('m1');
  });
});

describe('stock status', () => {
  it('shows out of stock at zero', () => {
    expect(stockStatus(0, 15, 15)).toBe('out');
  });
  it('shows low when at or under the reorder level', () => {
    expect(stockStatus(8, 15, 15)).toBe('low');
  });
  it('shows ok above it', () => {
    expect(stockStatus(40, 15, 15)).toBe('ok');
  });
});

describe('reorder suggestion', () => {
  it('covers 30 days of recent sales', () => {
    // 60 sold in 30 days is 2/day; 30 days cover is 60; 8 in stock means buy 52
    expect(suggestedReorderQty({ soldQty: 60, overDays: 30, currentQty: 8 })).toBe(52);
  });

  it('never suggests a negative quantity', () => {
    expect(suggestedReorderQty({ soldQty: 10, overDays: 30, currentQty: 500 })).toBe(0);
  });

  it('falls back to the configured quantity with no sales history', () => {
    expect(suggestedReorderQty({ soldQty: 0, overDays: 0, currentQty: 0, reorderQty: 12 })).toBe(12);
  });
});

describe('movement class', () => {
  it('calls a SKU with under a month of cover fast moving', () => {
    expect(movementClass({ soldQty: 140, overDays: 30, currentQty: 60, deadDays: 90, daysSinceLastSale: 1 })).toBe('fast');
  });

  it('calls stock with no sale in the dead window dead', () => {
    expect(movementClass({ soldQty: 0, overDays: 30, currentQty: 14, deadDays: 90, daysSinceLastSale: 200 })).toBe('dead');
  });

  it('does not call a never-sold SKU with no stock dead stock', () => {
    expect(movementClass({ soldQty: 0, overDays: 30, currentQty: 0, deadDays: 90, daysSinceLastSale: null })).toBe('slow');
  });
});

describe('numbering', () => {
  it('formats an invoice number from its series', () => {
    expect(formatDocNo({ prefix: 'NOI/A/26-27/', next_number: 42, pad_width: 4 })).toBe('NOI/A/26-27/0042');
  });

  it('puts September 2026 in the 26-27 financial year', () => {
    expect(financialYear('2026-09-12')).toBe('26-27');
  });

  it('puts February 2027 in the same financial year', () => {
    expect(financialYear('2027-02-10')).toBe('26-27');
  });

  it('rolls over on 1 April', () => {
    expect(financialYear('2027-04-01')).toBe('27-28');
  });

  it('generates time-ordered unique ids', () => {
    const a = uuidv7();
    const b = uuidv7();
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(a).not.toBe(b);
  });
});

describe('vehicle registrations', () => {
  it('normalises whatever the counter types', () => {
    expect(normaliseRegistration('up 16 ab 1234')).toBe('UP16AB1234');
    expect(normaliseRegistration('UP-16-AB-1234')).toBe('UP16AB1234');
  });

  it('displays it the way it is written on the plate', () => {
    expect(formatRegistration('UP16AB1234')).toBe('UP 16 AB 1234');
  });
});

describe('money formatting', () => {
  it('uses Indian digit grouping', () => {
    expect(formatINR(142300)).toBe('₹1,42,300');
    expect(formatINR(980400)).toBe('₹9,80,400');
    expect(formatINR(500)).toBe('₹500');
  });

  it('shortens large figures for the dashboard', () => {
    expect(formatINRShort(980400)).toBe('₹9.8L');
    expect(formatINRShort(38600000)).toBe('₹3.86Cr');
  });

  it('computes gross margin', () => {
    const m = margin(1650, 1200);
    expect(m.amount).toBe(450);
    expect(m.pct).toBe(27.27);
  });
});

describe('amount in words', () => {
  it('reads Indian grouping', () => {
    expect(amountInWords(142300)).toBe('One Lakh Forty Two Thousand Three Hundred Rupees Only');
    expect(amountInWords(2360.5)).toBe('Two Thousand Three Hundred Sixty Rupees and Fifty Paise Only');
    expect(amountInWords(10000000)).toBe('One Crore Rupees Only');
    expect(amountInWords(0)).toBe('Zero Rupees Only');
  });
});
