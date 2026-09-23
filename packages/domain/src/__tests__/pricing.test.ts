import { describe, expect, it } from 'vitest';
import { ageingBucket, allocateFifo, checkCredit, checkPrice, resolvePrice } from '../pricing';

const bulb = {
  mrp: 3200,
  retail_price: 2400,
  dealer_price: 1900,
  wholesale_price: 1750,
  min_selling_price: 1700,
  avg_cost: 1450,
  last_purchase_cost: 1450,
};

describe('price resolution', () => {
  it('prefers a rate negotiated with this customer', () => {
    const r = resolvePrice(bulb, { customerPrice: 1550, priceListColumn: 'dealer_price' });
    expect(r.price).toBe(1550);
    expect(r.source).toBe('customer');
  });

  it('falls back to the price list override', () => {
    const r = resolvePrice(bulb, { priceListItemPrice: 1800, priceListColumn: 'dealer_price' });
    expect(r.price).toBe(1800);
    expect(r.source).toBe('price_list');
  });

  it('uses the dealer column for a dealer', () => {
    expect(resolvePrice(bulb, { priceListColumn: 'dealer_price' }).price).toBe(1900);
  });

  it('uses retail when no price list is attached', () => {
    expect(resolvePrice(bulb).price).toBe(2400);
  });

  it('falls back to retail when the dealer price is missing', () => {
    const r = resolvePrice({ ...bulb, dealer_price: null }, { priceListColumn: 'dealer_price' });
    expect(r.price).toBe(2400);
    expect(r.source).toBe('retail');
  });
});

describe('price control', () => {
  it('accepts a rate at the dealer price', () => {
    expect(checkPrice(1900, bulb).ok).toBe(true);
  });

  it('blocks a rate below the permitted selling price and asks for approval', () => {
    // 1500 clears the 1450 cost but is under the 1700 floor.
    const check = checkPrice(1500, bulb);
    expect(check.ok).toBe(false);
    expect(check.severity).toBe('floor');
    expect(check.needsApproval).toBe(true);
    expect(check.message).toContain('1700');
  });

  it('flags a rate below cost even when no floor is set', () => {
    const check = checkPrice(1200, { ...bulb, min_selling_price: null });
    expect(check.severity).toBe('cost');
  });

  it('reports below cost first when a rate breaks both the cost and the floor', () => {
    expect(checkPrice(1400, bulb).severity).toBe('cost');
  });

  it('warns without blocking when the margin is thin', () => {
    const check = checkPrice(1750, bulb, { marginFloorPct: 25 });
    expect(check.ok).toBe(true);
    expect(check.severity).toBe('margin');
  });
});

describe('credit control', () => {
  it('reports available credit', () => {
    const c = checkCredit({ outstanding: 72000, creditLimit: 100000, invoiceAmount: 10000 });
    expect(c.available).toBe(28000);
    expect(c.exceeded).toBe(false);
  });

  it('flags a bill that pushes the customer past the limit', () => {
    const c = checkCredit({ outstanding: 72000, creditLimit: 100000, invoiceAmount: 40000 });
    expect(c.exceeded).toBe(true);
    expect(c.projected).toBe(112000);
    expect(c.message).toContain('Credit limit exceeded');
  });

  it('treats a zero limit as unrestricted rather than as no credit', () => {
    const c = checkCredit({ outstanding: 5000, creditLimit: 0, invoiceAmount: 90000 });
    expect(c.unlimited).toBe(true);
    expect(c.exceeded).toBe(false);
  });
});

describe('payment allocation', () => {
  const open = [
    { id: 'b', doc_type: 'sales_invoice', outstanding: 5000, doc_date: '2026-08-02' },
    { id: 'a', doc_type: 'sales_invoice', outstanding: 3000, doc_date: '2026-07-15' },
    { id: 'c', doc_type: 'sales_invoice', outstanding: 9000, doc_date: '2026-09-01' },
  ];

  it('settles the oldest invoice first', () => {
    const alloc = allocateFifo(6000, open);
    expect(alloc).toEqual([
      { doc_id: 'a', doc_type: 'sales_invoice', amount: 3000 },
      { doc_id: 'b', doc_type: 'sales_invoice', amount: 3000 },
    ]);
  });

  it('stops when the payment runs out', () => {
    expect(allocateFifo(1000, open)).toHaveLength(1);
  });

  it('leaves the surplus unallocated when the payment exceeds all invoices', () => {
    const alloc = allocateFifo(50000, open);
    const applied = alloc.reduce((a, x) => a + x.amount, 0);
    expect(applied).toBe(17000);
  });
});

describe('ageing', () => {
  const asOf = new Date('2026-09-12');
  it('puts an invoice due tomorrow in current', () => {
    expect(ageingBucket('2026-09-13', asOf)).toBe('current');
  });
  it('buckets a 40 day overdue invoice into 31-60', () => {
    expect(ageingBucket('2026-08-03', asOf)).toBe('31-60');
  });
  it('buckets a very old invoice into 90+', () => {
    expect(ageingBucket('2026-01-01', asOf)).toBe('90+');
  });
});
