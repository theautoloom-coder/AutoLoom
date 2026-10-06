/**
 * Change requests — staff propose an item, an admin approves it.
 *
 * Staff cannot write the catalogue (`catalog.edit` gates products, variants and
 * fitments), so a salesman who finds new stock on the shelf had nowhere to put
 * it and would call the owner instead. Now the same form submits a proposal,
 * the admin sees a queue, and approving it creates the item for real.
 *
 * The one rule that matters here: **approval runs the ordinary item insert, on
 * the approver's device, under the approver's credentials.** There is no second
 * write path with its own quirks, and no server-side job that could create a
 * product nobody was allowed to create. `applyItemProposal` below is the only
 * implementation, and the admin's own "Naya item" form calls it too — so an
 * approved item and a hand-typed item are byte-for-byte the same rows.
 */
import { slug, uniqueSku, uuidv7 } from '@domain';

import { insertRow, searchText, type Actor } from './writes';

/** A database handle or an open write transaction — both expose execute/getAll. */
type Writable = Parameters<typeof insertRow>[0];

/** The simple item form, as data. Deliberately the shape the form collects. */
export type ItemProposal = {
  /** Null when the submitter is proposing a category that does not exist yet. */
  family_id: string | null;
  /** The category's name. Doubles as the NEW category's name when family_id is
   *  null — staff cannot create one themselves (product_families is gated by
   *  `catalog.edit`), so they name it and the approver creates it. */
  family_name?: string | null;
  name: string;
  type?: string;
  colour?: string;
  model_id?: string | null;
  car_text?: string | null;
  year_text?: string;
  qty?: number | null;
  price: number | null;
  cost?: number | null;
  pack_size?: number | null;
  pack_label?: string;
  warranty_months?: number | null;
  /** The family's specs as filled in — socket, watt, colour, mat type… */
  specs?: ProposalSpec[];
  /** Which cars it goes on, each with its years. Replaces model_id/year_text. */
  fits?: ProposalFit[];
  /** Goes on every car (sold by spec, not by car). */
  universal?: boolean;
};

/**
 * One filled-in spec. It carries what the writer needs from its definition
 * (axis, in-name, order) so writing it never has to look the definition up —
 * a proposal is approved on another phone, maybe days later.
 */
export type ProposalSpec = {
  def_id: string;
  name: string;
  axis: boolean;
  in_name: boolean;
  sort: number;
  display: string;
  option_id?: string | null;
  /** Multiselect: comma-separated option ids, as spec_values.option_ids holds them. */
  option_ids?: string | null;
  text?: string | null;
  number?: number | null;
  bool?: boolean | null;
};

export type ProposalFit = { model_id: string; year_from?: number | null; year_to?: number | null; label?: string };

/** "H4 · 60/55 W" from the specs that name a variant, else the typed type/colour. */
export function variantNameOf(p: Pick<ItemProposal, 'specs' | 'type' | 'colour'>): string {
  const named = (p.specs ?? []).filter((s) => (s.axis || s.in_name) && s.display.trim())
    .sort((a, b) => a.sort - b.sort).map((s) => s.display.trim());
  const typed = [p.type?.trim(), p.colour?.trim()].filter(Boolean) as string[];
  return [...named, ...typed].join(' · ') || 'Standard';
}

/** The proposal's cars, folding in the old single-car fields. */
export function fitsOf(p: ItemProposal): ProposalFit[] {
  if (p.fits?.length) return p.fits;
  if (!p.model_id) return [];
  const years = (p.year_text ?? '').match(/(\d{4})\D*(\d{4})?/);
  return [{ model_id: p.model_id, year_from: years ? Number(years[1]) : null, year_to: years?.[2] ? Number(years[2]) : null, label: p.car_text ?? undefined }];
}

/**
 * Write an item's specs and cars. Replaces whatever was there, so the same
 * call serves a new item and an edit. Spec rows on a variant axis (a bulb's
 * socket) sit on the variant; the rest describe the product.
 */
export async function writeSpecsAndFits(
  tx: Writable, productId: string, variantId: string, p: ItemProposal, actor?: Actor,
): Promise<void> {
  await tx.execute('DELETE FROM spec_values WHERE product_id = ?', [productId]);
  for (const sp of p.specs ?? []) {
    if (!sp.display.trim()) continue;
    await insertRow(tx, 'spec_values', {
      product_id: productId,
      variant_id: sp.axis ? variantId : null,
      spec_definition_id: sp.def_id,
      option_id: sp.option_id ?? null,
      option_ids: sp.option_ids ?? null,
      value_text: sp.text ?? null,
      value_number: sp.number ?? null,
      value_bool: sp.bool == null ? null : sp.bool,
      display_value: sp.display.trim(),
    });
  }
  await tx.execute('DELETE FROM product_fitments WHERE product_id = ?', [productId]);
  if (p.universal) return;
  for (const f of fitsOf(p)) {
    await insertRow(tx, 'product_fitments', {
      product_id: productId, variant_id: null, model_id: f.model_id,
      year_from: f.year_from ?? null, year_to: f.year_to ?? null,
    }, actor);
  }
}

export type ChangeRequest = {
  id: string;
  kind: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  payload: string; // jsonb arrives as text through the SQLite mirror
  note: string | null;
  review_note: string | null;
  revision: number;
  submitted_by: string;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  location_id: string | null;
  applied_product_id: string | null;
};

export function parseProposal(req: Pick<ChangeRequest, 'payload'>): ItemProposal | null {
  try {
    const first = JSON.parse(req.payload);
    // Rows written before the column became text were double-encoded — the
    // jsonb column stored the JSON *string*, so one parse yields a string
    // rather than the proposal. Unwrap those rather than showing a request
    // with no name, no price and no quantity, which is how this was found.
    const value = typeof first === 'string' ? JSON.parse(first) : first;
    return value && typeof value === 'object' ? (value as ItemProposal) : null;
  } catch {
    return null;
  }
}

/** Everything a proposal must have before anyone's time is wasted on it. */
export function validateProposal(p: ItemProposal): string | null {
  if (!p.family_id && !p.family_name?.trim()) return 'Category chuno ya nayi likho.';
  if (!p.name.trim()) return 'Item ka naam likho.';
  if (p.price == null || p.price <= 0) return 'Bechne ka rate daalo.';
  // Opening stock with no purchase rate books itself at zero cost, and every
  // piece of it later sells as pure profit. It had already happened here: four
  // 7D mat sets at ₹3,200 sitting at avg_cost 0, ₹12,800 of sale that would
  // have read as ₹12,800 of munafa. Stock Chadhao has warned about this in its
  // help text from the start; this screen let it through.
  //
  //
  // No longer demanded (owner's call, 6 Oct 2026): staff do not see or set
  // buy rates, and the owner prices maal afterwards. The risk above is now
  // handled where the owner works — Stock → "Rate baaki" lists every item
  // still at cost 0, so it is priced before it sells as pure profit.
  return null;
}

/**
 * Create the item: product + one variant + optional fitment + opening stock, in
 * one transaction, exactly as the rest of the app expects to read it.
 *
 * `takenSkus` is passed in rather than queried here because the caller already
 * holds the list from a live query; generating a SKU against a stale set is how
 * two devices end up proposing the same one.
 */
export async function applyItemProposal(
  tx: Writable,
  p: ItemProposal,
  opts: {
    actor?: Actor;
    locationId?: string | null;
    takenSkus: Set<string>;
    skuPrefix?: string | null;
  },
): Promise<{ productId: string; variantId: string }> {
  const { actor, locationId, takenSkus } = opts;

  // A proposal may name a category that does not exist yet. Creating it here
  // means it is made by the approver, who is allowed to, instead of by the
  // staff member, whose insert the server would refuse and PowerSync would
  // silently revert — which is exactly how the first end-to-end run failed.
  let familyId = p.family_id;
  if (!familyId && p.family_name?.trim()) {
    const name = p.family_name.trim();
    // Same read pattern as posting.ts: a transaction exposes execute(), and
    // rows come back on rows._array.
    const found = await tx.execute(
      'SELECT id FROM product_families WHERE lower(name) = lower(?) LIMIT 1', [name]);
    const existingId = (found.rows?._array?.[0] as { id?: string } | undefined)?.id;
    familyId = existingId ?? await insertRow(tx, 'product_families', {
      code: slug(name, 6) || `CAT${Date.now() % 1000}`,
      name,
      sku_prefix: slug(name, 4) || 'ITM',
      sku_template: '{FAMILY}-{AXES}',
      is_fitment_required: false,
      is_active: true,
      sort_order: 100,
    }, actor);
  }

  const variantName = variantNameOf(p);
  const fits = fitsOf(p);
  // The server rebuilds search text from the spec and car rows once they
  // sync; this copy makes the item findable on this phone straight away.
  const text = searchText(p.name, p.family_name, p.type, p.colour, p.car_text, p.year_text,
    ...(p.specs ?? []).map((s) => s.display), ...fits.map((f) => f.label ?? ''));

  const productId = uuidv7();
  await insertRow(tx, 'products', {
    id: productId,
    family_id: familyId,
    name: p.name.trim(),
    is_universal_fit: !!p.universal || fits.length === 0,
    search_text: text,
    is_active: true,
  }, actor);

  const base = [opts.skuPrefix || 'ITM', slug(p.name, 6), slug(p.colour ?? '', 4)].filter(Boolean).join('-');
  const variantId = uuidv7();
  await insertRow(tx, 'product_variants', {
    id: variantId,
    product_id: productId,
    variant_name: variantName,
    sku: uniqueSku(base, takenSkus),
    retail_price: p.price,
    dealer_price: p.price,
    min_stock: 0,
    reorder_level: 0,
    reorder_qty: 0,
    pack_size: p.pack_size ?? 1,
    pack_label: p.pack_label?.trim() || null,
    warranty_months: p.warranty_months ?? 0,
    last_purchase_cost: p.cost ?? 0,
    avg_cost: p.cost ?? 0,
    search_text: searchText(text, base, variantName),
    sort_order: 0,
    is_active: true,
  }, actor);

  await writeSpecsAndFits(tx, productId, variantId, p, actor);

  if ((p.qty ?? 0) > 0 && locationId) {
    await insertRow(tx, 'stock_movements', {
      variant_id: variantId,
      location_id: locationId,
      qty: p.qty,
      movement_type: 'opening',
      unit_cost: p.cost ?? 0,
      occurred_at: new Date().toISOString(),
      note: 'Opening stock',
    }, actor);
  }

  return { productId, variantId };
}

/** Staff sends a proposal up for review. */
export async function submitRequest(
  db: Writable,
  p: ItemProposal,
  opts: { actor: Actor; locationId?: string | null; note?: string },
): Promise<string> {
  const userId = opts.actor.userId;
  if (!userId) throw new Error('Session purana ho gaya. Dobara sign in karo.');
  return insertRow(db, 'change_requests', {
    kind: 'new_item',
    status: 'pending',
    payload: JSON.stringify(p),
    note: opts.note?.trim() || null,
    submitted_by: userId,
    submitted_at: new Date().toISOString(),
    location_id: opts.locationId ?? null,
    revision: 1,
  }, opts.actor);
}

/**
 * Staff corrects a rejected proposal and sends it back. The row is reused so
 * the admin sees the same request again with its history, rather than a new
 * one that looks unrelated to the rejection they wrote.
 *
 * `revision` and the clearing of the review are done by the database trigger,
 * not here — a client must not be the thing that decides it is now on its
 * second attempt.
 */
export async function resubmitRequest(
  db: Writable,
  id: string,
  p: ItemProposal,
  note?: string,
): Promise<void> {
  await db.execute(
    'UPDATE change_requests SET payload = ?, note = ?, status = ? WHERE id = ?',
    [JSON.stringify(p), note?.trim() || null, 'pending', id],
  );
}

/** Staff withdraws their own pending proposal. */
export async function cancelRequest(db: Writable, id: string): Promise<void> {
  await db.execute('UPDATE change_requests SET status = ? WHERE id = ?', ['cancelled', id]);
}

/**
 * Admin rejects, with a reason. The reason is required by the database too —
 * a rejection with no explanation just gets resubmitted unchanged.
 */
export async function rejectRequest(db: Writable, id: string, reason: string): Promise<void> {
  await db.execute(
    'UPDATE change_requests SET status = ?, review_note = ? WHERE id = ?',
    ['rejected', reason.trim(), id],
  );
}

/**
 * Admin approves: create the item and mark the request in ONE transaction, so
 * the queue can never show an approved request whose product was never made,
 * nor a product with no record of who asked for it.
 */
export async function approveRequest(
  db: { writeTransaction: <T>(fn: (tx: Writable) => Promise<T>) => Promise<T> },
  req: ChangeRequest,
  opts: { actor: Actor; locationId?: string | null; takenSkus: Set<string>; skuPrefix?: string | null; note?: string },
): Promise<string> {
  const p = parseProposal(req);
  if (!p) throw new Error('Request ka data padha nahi ja saka.');
  const bad = validateProposal(p);
  if (bad) throw new Error(bad);

  return db.writeTransaction(async (tx) => {
    const { productId } = await applyItemProposal(tx, p, {
      actor: opts.actor,
      // The stock lands where the submitter said it was, not where the admin
      // happens to be standing.
      locationId: req.location_id ?? opts.locationId ?? null,
      takenSkus: opts.takenSkus,
      skuPrefix: opts.skuPrefix,
    });

    await tx.execute(
      'UPDATE change_requests SET status = ?, applied_product_id = ?, review_note = ? WHERE id = ?',
      ['approved', productId, opts.note?.trim() || null, req.id],
    );

    return productId;
  });
}
