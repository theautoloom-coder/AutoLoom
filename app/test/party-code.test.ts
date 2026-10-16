/**
 * Numbering a new grahak or supplier (owner, 16 Oct 2026: "user not able to
 * make new grahak"). The shop's cash grahak carries the code 'CASH', and the
 * string max of the C codes was that — so every new grahak came out C0001.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import { nextPartyCode } from '../src/lib/writes';
import { createDb, row, type FakeDb } from './harness';

let db: FakeDb;
beforeEach(() => {
  db = createDb();
});

const customer = (id: string, code: string) =>
  row(db, 'customers', { id, code, name: id, customer_type: 'retail', credit_limit: 0, credit_days: 0, opening_balance: 0, is_active: 1, search_text: '' });

describe('the next grahak or supplier code', () => {
  it('starts at C0001 in an empty shop', async () => {
    expect(await nextPartyCode(db, 'customers')).toBe('C0001');
  });

  it('counts past a code with no number in it, like the cash grahak’s CASH', async () => {
    customer('modern', 'C0001');
    customer('cash', 'CASH');
    expect(await nextPartyCode(db, 'customers')).toBe('C0002');
  });

  it('counts by number, not by letters: C10000 comes after C9999', async () => {
    customer('a', 'C9999');
    customer('b', 'C10000');
    expect(await nextPartyCode(db, 'customers')).toBe('C10001');
  });

  it('numbers suppliers on their own', async () => {
    customer('modern', 'C0007');
    row(db, 'suppliers', { id: 's1', code: 'S0003', name: 'Bright Auto', payment_terms_days: 0, opening_balance: 0, is_active: 1, search_text: '' });
    row(db, 'suppliers', { id: 's2', code: 'SHOP-OWN', name: 'Own code', payment_terms_days: 0, opening_balance: 0, is_active: 1, search_text: '' });
    expect(await nextPartyCode(db, 'suppliers')).toBe('S0004');
  });
});
