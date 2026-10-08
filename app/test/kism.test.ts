/**
 * One item, many kisms (owner, 7 Oct 2026): an item made once is never made
 * again for another car — a kism is added to it — and changing one kism never
 * touches another's details or cars.
 */
import { beforeEach, describe, expect, it } from 'vitest';

import type { Transaction } from '@powersync/react-native';

import { applyItemProposal, applyKismEdit, approveRequest, kindOf, submitRequest, variantNameOf, writeSpecsAndFits, type ChangeRequest, type ItemProposal, type ProposalSpec } from '../src/lib/requests';
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

  // Owner, 8 Oct 2026: the item is made once — its kisms come with the stock.
  it('an item made on its own has no kism yet, only its rate and shared detail', async () => {
    const made = await db.writeTransaction(() => applyItemProposal(tx(), {
      family_id: 'mat', family_name: 'Mats', name: 'ABC 7D Mat', master: true, price: 2400, cost: 1500,
      specs: [spec('material', 'Leatherette', false), spec('colour', 'Black', true)],
    }, { actor, locationId: 'main', takenSkus: new Set() }));
    expect(made.variantId).toBe('');
    expect(many(db, 'SELECT id FROM product_variants')).toHaveLength(0);
    expect(one<{ p: number; c: number }>(db, 'SELECT default_price AS p, default_cost AS c FROM products WHERE id = ?', made.productId))
      .toEqual({ p: 2400, c: 1500 });
    // Only the shared detail is the item's; a kism's own detail waits for the kism.
    expect(many(db, 'SELECT spec_definition_id AS d, variant_id AS v FROM spec_values')).toEqual([{ d: 'material', v: null }]);
  });

  it('a kism made by staff while stocking in does not change the item', async () => {
    const item = await db.writeTransaction(() => applyItemProposal(tx(), {
      family_id: 'mat', family_name: 'Mats', name: 'ABC 7D Mat', master: true, price: 2400, universal: true,
    }, { actor, locationId: 'main', takenSkus: new Set() }));
    const kism = await db.writeTransaction(() => applyItemProposal(tx(), {
      family_id: 'mat', name: 'ABC 7D Mat', product_id: item.productId, product_name: 'ABC 7D Mat', price: 2400, qty: 0,
      specs: [spec('colour', 'Black', true)],
      fits: [{ model_id: 'creta', year_from: 2019, year_to: 2023, label: 'Creta 2019–2023', make: 'Hyundai' }],
    }, { actor, locationId: 'main', takenSkus: new Set(), canEditItem: false }));
    // Staff may add a kism, not rewrite the item: it stays "every car".
    expect(one<{ u: number }>(db, 'SELECT is_universal_fit AS u FROM products WHERE id = ?', item.productId).u).toBeTruthy();
    const v = one<{ n: string; sku: string; r: number }>(db, 'SELECT variant_name AS n, sku, retail_price AS r FROM product_variants WHERE id = ?', kism.variantId);
    expect(v.n).toBe('Creta 2019–2023 · Black');
    expect(v.r).toBe(2400);
    // The SKU names the car and the colour.
    expect(v.sku).toBe('MAT-ABC7DM-CRETA2-BLAC');
    // qty 0: the stock comes with the entry's own lines, not twice.
    expect(many(db, 'SELECT id FROM stock_movements')).toHaveLength(0);
  });

  // Owner, 8 Oct 2026: a kism's change — the owner's own or a staff request
  // approved — touches that kism only. An old form's save once wiped every
  // spec and car of the item.
  it('changing a kism leaves the item and every other kism alone', async () => {
    const item = await db.writeTransaction(() => applyItemProposal(tx(), {
      family_id: 'mat', family_name: 'Mats', name: 'ABC 7D Mat', master: true, price: 2400,
      specs: [spec('material', 'TPE', false)],
    }, { actor, locationId: 'main', takenSkus: new Set() }));
    const kism = (car: string, label: string) => applyItemProposal(tx(), {
      family_id: 'mat', name: 'ABC 7D Mat', product_id: item.productId, product_name: 'ABC 7D Mat', price: 2400, qty: 0,
      specs: [spec('colour', 'Black', true)], fits: [{ model_id: car, label }],
    }, { actor, locationId: 'main', takenSkus: new Set(many<{ sku: string }>(db, 'SELECT sku FROM product_variants').map((r) => r.sku)) });
    const tiago = await db.writeTransaction(() => kism('tiago', 'Tiago'));
    const punch = await db.writeTransaction(() => kism('punch', 'Punch'));

    // Tiago's kism was really for the Tiago 2026; and its rate.
    await db.writeTransaction(() => applyKismEdit(tx(), {
      family_id: 'mat', name: 'ABC 7D Mat', product_id: item.productId, edit_variant_id: tiago.variantId, price: 2600,
      specs: [spec('colour', 'Black', true)], fits: [{ model_id: 'tiago', year_from: 2026, year_to: 2026, label: 'Tiago 2026' }],
    }, actor));

    expect(one<{ n: string; r: number }>(db, 'SELECT variant_name AS n, retail_price AS r FROM product_variants WHERE id = ?', tiago.variantId))
      .toEqual({ n: 'Tiago 2026 · Black', r: 2600 });
    // Punch untouched: its car, its colour, its name.
    expect(many(db, 'SELECT model_id FROM product_fitments WHERE variant_id = ?', punch.variantId)).toEqual([{ model_id: 'punch' }]);
    expect(many(db, 'SELECT display_value AS d FROM spec_values WHERE variant_id = ?', punch.variantId)).toEqual([{ d: 'Black' }]);
    // The item's own detail and its name untouched; not "every car".
    expect(many(db, 'SELECT display_value AS d FROM spec_values WHERE product_id = ? AND variant_id IS NULL', item.productId)).toEqual([{ d: 'TPE' }]);
    expect(one<{ n: string; u: number }>(db, 'SELECT name AS n, is_universal_fit AS u FROM products WHERE id = ?', item.productId))
      .toEqual({ n: 'ABC 7D Mat', u: 0 });
  });

  it('a staff change waits as a request and goes on when approved', async () => {
    const item = await db.writeTransaction(() => applyItemProposal(tx(), abc(), { actor, locationId: 'main', takenSkus: new Set() }));
    const ask = {
      ...abc({ price: 2500 }), product_id: item.productId, product_name: 'ABC 7D Mat', edit_variant_id: item.variantId,
      fits: [{ model_id: 'swift', label: 'Swift' }], before: { name: 'Creta 2019–2023 · Black', price: 2400 },
    };
    expect(kindOf(ask)).toBe('edit_kism');
    const rid = await submitRequest(tx(), ask, { actor: { userId: 'staff-1', deviceId: 'd2' } });
    // Nothing changed yet.
    expect(one<{ r: number }>(db, 'SELECT retail_price AS r FROM product_variants WHERE id = ?', item.variantId).r).toBe(2400);
    const req = one<ChangeRequest>(db, 'SELECT * FROM change_requests WHERE id = ?', rid);
    expect(req.kind).toBe('edit_kism');
    await approveRequest(db as unknown as Parameters<typeof approveRequest>[0], req, { actor, takenSkus: new Set() });
    expect(one<{ n: string; r: number }>(db, 'SELECT variant_name AS n, retail_price AS r FROM product_variants WHERE id = ?', item.variantId))
      .toEqual({ n: 'Swift · Black', r: 2500 });
    expect(many(db, 'SELECT model_id FROM product_fitments WHERE variant_id = ?', item.variantId)).toEqual([{ model_id: 'swift' }]);
    expect(many(db, 'SELECT id FROM product_variants')).toHaveLength(1);
  });

  it('a bulb sold by socket, on every car, is named by its specs', () => {
    expect(variantNameOf({ specs: [spec('socket', 'H4', true), spec('watt', '60/55 W', true)], universal: true })).toBe('H4 · 60/55 W');
  });
});
