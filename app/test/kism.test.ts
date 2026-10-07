/**
 * One item, many kisms (owner, 7 Oct 2026): an item made once is never made
 * again for another car — a kism is added to it — and changing one kism never
 * touches another's details or cars.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { Transaction } from '@powersync/react-native';

import { applyItemProposal, variantNameOf, writeSpecsAndFits, type ItemProposal, type ProposalSpec } from '../src/lib/requests';
import type { Actor } from '../src/lib/writes';
import { createDb, many, one, row, type FakeDb } from './harness';

const actor: Actor = { userId: 'owner-1', deviceId: 'device-1' };
let db: FakeDb;
const tx = () => db as unknown as Transaction;

const spec = (def: string, display: string, axis: boolean, extra: Partial<ProposalSpec> = {}): ProposalSpec =>
  ({ def_id: def, name: def, axis, in_name: axis, sort: axis ? 1 : 5, display, ...extra });

beforeEach(() => {
  db = createDb();
  row(db, 'locations', { id: 'main', code: 'MAIN', name: 'AutoLoom', type: 'warehouse', is_active: 1, sort_order: 1 });
  row(db, 'product_families', { id: 'mat', code: 'MAT', name: 'Mats', sku_prefix: 'MAT', is_active: 1 });
});

const abc = (over: Partial<ItemProposal> = {}): ItemProposal => ({
  family_id: 'mat', family_name: 'Mats', name: 'ABC 7D Mat', price: 2400, qty: 3,
  specs: [spec('colour', 'Black', true), spec('material', 'Leatherette', false)],
  fits: [{ model_id: 'creta', year_from: 2019, year_to: 2023, label: 'Creta 2019–2023', make: 'Hyundai' }],
  ...over,
});

describe('one item, many kisms', () => {
  it('a new item: the car is on the kism, and in its name', async () => {
    const made = await db.writeTransaction(() => applyItemProposal(tx(), abc(), { actor, locationId: 'main', takenSkus: new Set() }));
    const v = one<{ variant_name: string }>(db, 'SELECT variant_name FROM product_variants WHERE id = ?', made.variantId);
    expect(v.variant_name).toBe('Creta 2019–2023 · Black');
    const f = many<{ variant_id: string | null }>(db, 'SELECT variant_id FROM product_fitments WHERE product_id = ?', made.productId);
    expect(f).toEqual([{ variant_id: made.variantId }]);
    // Material is the item's, shared; colour is the kism's.
    expect(one<{ v: string | null }>(db, "SELECT variant_id AS v FROM spec_values WHERE spec_definition_id = 'material'").v).toBeNull();
    expect(one<{ v: string | null }>(db, "SELECT variant_id AS v FROM spec_values WHERE spec_definition_id = 'colour'").v).toBe(made.variantId);
  });

  it('the same mat for another car is a kism of it, not a new item', async () => {
    const first = await db.writeTransaction(() => applyItemProposal(tx(), abc(), { actor, locationId: 'main', takenSkus: new Set() }));
    const taken = new Set(many<{ sku: string }>(db, 'SELECT sku FROM product_variants').map((r) => r.sku));
    const second = await db.writeTransaction(() => applyItemProposal(tx(), abc({
      product_id: first.productId, product_name: 'ABC 7D Mat', qty: 2,
      // Material unchanged (inherited) — not repeated on the kism.
      specs: [spec('colour', 'Black', true), spec('material', 'Leatherette', false, { inherited: true })],
      fits: [{ model_id: 'swift', year_from: 2018, year_to: null, label: 'Swift 2018+', make: 'Maruti' }],
    }), { actor, locationId: 'main', takenSkus: taken }));

    expect(second.productId).toBe(first.productId);
    expect(many(db, 'SELECT id FROM products')).toHaveLength(1);
    expect(many(db, 'SELECT id FROM product_variants WHERE product_id = ?', first.productId)).toHaveLength(2);
    expect(one<{ n: string }>(db, 'SELECT variant_name AS n FROM product_variants WHERE id = ?', second.variantId).n).toBe('Swift 2018+ · Black');
    // Each kism keeps its own car and its own stock.
    const cars = many<{ variant_id: string; model_id: string }>(db, 'SELECT variant_id, model_id FROM product_fitments ORDER BY model_id');
    expect(cars).toEqual([{ variant_id: first.variantId, model_id: 'creta' }, { variant_id: second.variantId, model_id: 'swift' }]);
    expect(one<{ q: number }>(db, 'SELECT SUM(qty) AS q FROM stock_movements WHERE variant_id = ?', second.variantId).q).toBe(2);
    // The shared material is not copied onto the new kism.
    expect(many(db, "SELECT id FROM spec_values WHERE spec_definition_id = 'material'")).toHaveLength(1);
    // Two different SKUs.
    const skus = many<{ sku: string }>(db, 'SELECT sku FROM product_variants').map((r) => r.sku);
    expect(new Set(skus).size).toBe(2);
  });

  it('changing one kism leaves the other kism alone', async () => {
    const first = await db.writeTransaction(() => applyItemProposal(tx(), abc(), { actor, locationId: 'main', takenSkus: new Set() }));
    const second = await db.writeTransaction(() => applyItemProposal(tx(), abc({
      product_id: first.productId, product_name: 'ABC 7D Mat',
      specs: [spec('colour', 'Brown', true), spec('material', 'Leatherette', false, { inherited: true })],
      fits: [{ model_id: 'swift', label: 'Swift' }],
    }), { actor, locationId: 'main', takenSkus: new Set(['MAT-ABC7DM-CRETA2-BL']) }));

    // Edit the first kism: new car, new colour.
    await db.writeTransaction(() => writeSpecsAndFits(tx(), first.productId, first.variantId, abc({
      specs: [spec('colour', 'Beige', true), spec('material', 'PU', false)],
      fits: [{ model_id: 'venue', label: 'Venue' }],
    }), actor, { scope: 'item' }));

    expect(one<{ d: string }>(db, "SELECT display_value AS d FROM spec_values WHERE variant_id = ? AND spec_definition_id = 'colour'", second.variantId).d).toBe('Brown');
    expect(many(db, 'SELECT model_id FROM product_fitments WHERE variant_id = ?', second.variantId)).toEqual([{ model_id: 'swift' }]);
    expect(many(db, 'SELECT model_id FROM product_fitments WHERE variant_id = ?', first.variantId)).toEqual([{ model_id: 'venue' }]);
    // The shared material changed for the item, once.
    expect(many<{ d: string }>(db, "SELECT display_value AS d FROM spec_values WHERE spec_definition_id = 'material'")).toEqual([{ d: 'PU' }]);
  });

  it('a bulb sold by socket, on every car, is named by its specs', () => {
    expect(variantNameOf({ specs: [spec('socket', 'H4', true), spec('watt', '60/55 W', true)], universal: true })).toBe('H4 · 60/55 W');
  });
});
