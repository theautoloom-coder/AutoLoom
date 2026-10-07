/**
 * SQL used by the screens, in one place.
 *
 * Everything runs against local SQLite. The same statements (minus SQLite
 * quirks) run on Postgres, which is why the schema avoids anything exotic.
 * Booleans are 1/0, dates are ISO strings, money is REAL.
 */

// -----------------------------------------------------------------------------
// Universal search
// -----------------------------------------------------------------------------

/** Turn "h4 led" into a LIKE clause that requires every token. */
export function tokenClause(column: string, tokens: string[]): { sql: string; params: string[] } {
  if (tokens.length === 0) return { sql: '1=1', params: [] };
  return {
    sql: tokens.map(() => `${column} LIKE ?`).join(' AND '),
    params: tokens.map((t) => `%${t.toLowerCase()}%`),
  };
}

export function tokenize(input: string): string[] {
  return input.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

/**
 * The specs that tell two items apart, in the family's own order: "H4 ·
 * 60/55 W · 3200 K" for a bulb, "7D · Black · PU leather" for a mat.
 * Variant-level values win over product-level ones for the same spec.
 */
export const SPECS_OF = (p: string, pv: string) => `
  (SELECT GROUP_CONCAT(v, ' · ') FROM (
     SELECT COALESCE(
              (SELECT x.display_value FROM spec_values x
                WHERE x.spec_definition_id = sd.id AND x.variant_id = ${pv}.id AND x.display_value <> ''),
              (SELECT x.display_value FROM spec_values x
                WHERE x.spec_definition_id = sd.id AND x.product_id = ${p}.id AND x.variant_id IS NULL AND x.display_value <> '')
            ) AS v
       FROM spec_definitions sd
      WHERE sd.family_id = ${p}.family_id
      ORDER BY sd.sort_order, sd.name
   ) WHERE v IS NOT NULL)`;

/** Which cars an item goes on: "Creta 2019–2023, Venue 2020+". */
export const FITS_OF = (p: string, pv: string) => `
  (SELECT COALESCE(GROUP_CONCAT(label, ', '), CASE WHEN ${p}.is_universal_fit = 1 THEN 'Sab gaadi' END) FROM (
     SELECT vm.name || COALESCE(' ' || COALESCE(pf.year_from, g.year_from)
              || CASE WHEN COALESCE(pf.year_to, g.year_to) IS NULL THEN '+'
                      WHEN COALESCE(pf.year_to, g.year_to) = COALESCE(pf.year_from, g.year_from) THEN ''
                      ELSE '–' || COALESCE(pf.year_to, g.year_to) END, '') AS label
       FROM product_fitments pf
       JOIN vehicle_models vm ON vm.id = pf.model_id
       LEFT JOIN vehicle_generations g ON g.id = pf.generation_id
      WHERE pf.product_id = ${p}.id AND (pf.variant_id IS NULL OR pf.variant_id = ${pv}.id)
      ORDER BY vm.name, COALESCE(pf.year_from, g.year_from)
      LIMIT 4))`;

/** What can be sold: the godown, not the kharab corner. */
export const SELLABLE_QTY = (pv: string) => `
  COALESCE((SELECT SUM(sl.qty) FROM stock_on_hand sl
             WHERE sl.variant_id = ${pv}.id
               AND sl.location_id NOT IN (SELECT id FROM locations WHERE type = 'damaged')), 0)`;

export const SEARCH_VARIANTS = (tokens: string[], limit = 40) => {
  const { sql, params } = tokenClause('pv.search_text', tokens);
  return {
    sql: `
      SELECT pv.id, pv.sku, pv.barcode, pv.variant_name, pv.retail_price, pv.dealer_price, pv.wholesale_price,
             pv.mrp, pv.min_stock, pv.reorder_level, pv.avg_cost, pv.last_purchase_cost,
             p.id AS product_id, p.name AS product_name, p.is_universal_fit,
             b.name AS brand_name, f.name AS family_name, f.code AS family_code,
             ${SPECS_OF('p', 'pv')} AS specs,
             ${FITS_OF('p', 'pv')} AS fits,
             ${SELLABLE_QTY('pv')} AS qty,
             (SELECT pi.storage_path FROM product_images pi
               WHERE pi.variant_id = pv.id ORDER BY pi.sort_order LIMIT 1) AS photo_path
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      LEFT JOIN brands b ON b.id = p.brand_id
      LEFT JOIN product_families f ON f.id = p.family_id
      WHERE pv.is_active = 1 AND p.is_active = 1 AND ${sql}
      ORDER BY f.sort_order, p.name, pv.sort_order, pv.variant_name
      LIMIT ${limit}`,
    params,
  };
};

export const SEARCH_VEHICLES = (tokens: string[], limit = 10) => {
  const { sql, params } = tokenClause('vm.search_text', tokens);
  return {
    sql: `
      SELECT vm.id, vm.name, vm.code, vm.body_type, mk.name AS make_name,
             (SELECT COUNT(*) FROM product_fitments pf WHERE pf.model_id = vm.id) AS fitment_count
      FROM vehicle_models vm
      JOIN vehicle_makes mk ON mk.id = vm.make_id
      WHERE vm.is_active = 1 AND ${sql}
      ORDER BY fitment_count DESC, vm.name
      LIMIT ${limit}`,
    params,
  };
};

export const SEARCH_CUSTOMERS = (tokens: string[], limit = 10) => {
  const { sql, params } = tokenClause('c.search_text', tokens);
  return {
    sql: `
      SELECT c.id, c.code, c.name, c.business_name, c.mobile, c.city, c.customer_type,
             COALESCE(pb.balance, 0) AS balance, c.credit_limit
      FROM customers c
      LEFT JOIN party_balance_live pb ON pb.party_type = 'customer' AND pb.party_id = c.id
      WHERE c.is_active = 1 AND ${sql}
      ORDER BY c.name
      LIMIT ${limit}`,
    params,
  };
};

export const SEARCH_INVOICES = (term: string, limit = 10) => ({
  sql: `
    SELECT i.id, i.doc_type, i.doc_no, i.doc_date, i.grand_total, i.paid_total, i.status, c.name AS customer_name
    FROM sales_invoices i
    JOIN customers c ON c.id = i.customer_id
    WHERE i.doc_no LIKE ?
    ORDER BY i.doc_date DESC
    LIMIT ${limit}`,
  params: [`%${term.toUpperCase()}%`],
});

export const SEARCH_REGISTRATIONS = (reg: string, limit = 10) => ({
  sql: `
    SELECT cv.id, cv.registration_no, cv.color, c.id AS customer_id, c.name AS customer_name,
           vm.name AS model_name, mk.name AS make_name, vg.name AS generation_name
    FROM customer_vehicles cv
    JOIN customers c ON c.id = cv.customer_id
    LEFT JOIN vehicle_models vm ON vm.id = cv.model_id
    LEFT JOIN vehicle_makes mk ON mk.id = vm.make_id
    LEFT JOIN vehicle_generations vg ON vg.id = cv.generation_id
    WHERE cv.registration_no LIKE ?
    ORDER BY cv.registration_no
    LIMIT ${limit}`,
  params: [`%${reg}%`],
});

// -----------------------------------------------------------------------------
// Vehicle -> products
// -----------------------------------------------------------------------------

export const VEHICLE_MODEL = {
  sql: `
    SELECT vm.id, vm.name, vm.code, vm.body_type, mk.name AS make_name
    FROM vehicle_models vm JOIN vehicle_makes mk ON mk.id = vm.make_id
    WHERE vm.id = ?`,
};

export const VEHICLE_GENERATIONS = {
  sql: `SELECT id, model_id, name, year_from, year_to, is_facelift FROM vehicle_generations WHERE model_id = ? ORDER BY year_from DESC`,
};

/**
 * Model-specific products for a vehicle. A fitment on the product (variant
 * null) expands to every active variant; a fitment on a variant is exact.
 * `?1` model, `?2` generation (or '' for any), `?3` year (or 0 for any).
 */
export const VEHICLE_PRODUCTS = {
  sql: `
    SELECT DISTINCT pv.id, pv.sku, pv.variant_name, pv.retail_price, pv.dealer_price, pv.wholesale_price, pv.mrp,
           pv.min_stock, pv.reorder_level,
           p.id AS product_id, p.name AS product_name, p.is_universal_fit,
           b.name AS brand_name, f.name AS family_name, f.sort_order AS family_sort,
           pf.position,
           ${SELLABLE_QTY('pv')} AS qty,
           (SELECT pi.storage_path FROM product_images pi WHERE pi.variant_id = pv.id ORDER BY pi.sort_order LIMIT 1) AS photo_path
    FROM product_fitments pf
    JOIN products p ON p.id = pf.product_id AND p.is_active = 1
    JOIN product_variants pv ON pv.product_id = p.id AND pv.is_active = 1
                             AND (pf.variant_id IS NULL OR pf.variant_id = pv.id)
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_families f ON f.id = p.family_id
    LEFT JOIN vehicle_generations vg ON vg.id = pf.generation_id
    WHERE pf.model_id = ?1
      AND (?2 = '' OR pf.generation_id IS NULL OR pf.generation_id = ?2)
      AND (?3 = 0
           OR (pf.year_from IS NOT NULL AND ?3 >= pf.year_from AND (pf.year_to IS NULL OR ?3 <= pf.year_to))
           OR (pf.year_from IS NULL AND pf.year_to IS NULL AND (vg.id IS NULL OR (?3 >= vg.year_from AND (vg.year_to IS NULL OR ?3 <= vg.year_to)))))
    ORDER BY f.sort_order, p.name, pv.variant_name`,
};

/** Bulb sockets a vehicle generation uses, so universal bulbs can be matched by socket. */
export const VEHICLE_SOCKETS = {
  sql: `
    SELECT vsm.position_label, so.value AS socket, so.id AS option_id
    FROM vehicle_spec_map vsm
    JOIN spec_options so ON so.id = vsm.option_id
    WHERE vsm.generation_id = ?
    ORDER BY vsm.position_label`,
};

/** Variants whose effective socket is one of the given options (for "fits by socket"). */
export const VARIANTS_BY_OPTIONS = (optionIds: string[]) => ({
  sql: `
    SELECT DISTINCT pv.id, pv.sku, pv.variant_name, pv.retail_price, pv.dealer_price, pv.wholesale_price, pv.mrp,
           pv.min_stock, pv.reorder_level,
           p.id AS product_id, p.name AS product_name, p.is_universal_fit,
           b.name AS brand_name, f.name AS family_name, f.sort_order AS family_sort,
           so.value AS socket,
           ${SELLABLE_QTY('pv')} AS qty
    FROM spec_values sv
    JOIN spec_options so ON so.id = sv.option_id
    JOIN product_variants pv ON pv.id = sv.variant_id AND pv.is_active = 1
    JOIN products p ON p.id = pv.product_id AND p.is_active = 1
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_families f ON f.id = p.family_id
    WHERE sv.option_id IN (${optionIds.map(() => '?').join(',')})
    ORDER BY f.sort_order, p.name, pv.variant_name`,
  params: optionIds,
});

// -----------------------------------------------------------------------------
// Product / variant detail
// -----------------------------------------------------------------------------

export const PRODUCT = {
  sql: `
    SELECT p.*, b.name AS brand_name, b.code AS brand_code, f.name AS family_name, f.code AS family_code,
           c1.name AS category_name, c2.name AS subcategory_name, u.code AS unit_code, tr.rate_pct AS tax_rate_pct
    FROM products p
    LEFT JOIN brands b ON b.id = p.brand_id
    LEFT JOIN product_families f ON f.id = p.family_id
    LEFT JOIN categories c1 ON c1.id = p.category_id
    LEFT JOIN categories c2 ON c2.id = p.subcategory_id
    LEFT JOIN units u ON u.id = p.unit_id
    LEFT JOIN tax_rates tr ON tr.id = p.tax_rate_id
    WHERE p.id = ?`,
};

export const PRODUCT_VARIANTS = {
  sql: `
    SELECT pv.*, ${SELLABLE_QTY('pv')} AS qty
    FROM product_variants pv WHERE pv.product_id = ? AND pv.is_active = 1
    ORDER BY pv.sort_order, pv.variant_name`,
};

/** Effective specs for every variant of a product: product-level overlaid by variant-level. */
export const PRODUCT_SPECS = {
  sql: `
    SELECT sd.id AS spec_definition_id, sd.code, sd.name, sd.data_type, sd.unit, sd.is_variant_axis, sd.sort_order,
           sv.variant_id, sv.display_value, sv.option_id, sv.value_number, sv.value_text, sv.value_bool
    FROM spec_values sv
    JOIN spec_definitions sd ON sd.id = sv.spec_definition_id
    WHERE sv.product_id = ?
    ORDER BY sd.sort_order`,
};

export const PRODUCT_FITMENTS = {
  sql: `
    SELECT pf.id, pf.variant_id, pf.position, pf.year_from, pf.year_to,
           vm.id AS model_id, vm.name AS model_name, mk.name AS make_name,
           vg.name AS generation_name, vg.year_from AS gen_from, vg.year_to AS gen_to
    FROM product_fitments pf
    JOIN vehicle_models vm ON vm.id = pf.model_id
    JOIN vehicle_makes mk ON mk.id = vm.make_id
    LEFT JOIN vehicle_generations vg ON vg.id = pf.generation_id
    WHERE pf.product_id = ?
    ORDER BY mk.name, vm.name, vg.year_from`,
};

export const VARIANT_STOCK_BY_LOCATION = {
  sql: `
    SELECT l.id AS location_id, l.code, l.name, l.type, COALESCE(sl.qty, 0) AS qty
    FROM locations l
    LEFT JOIN stock_on_hand sl ON sl.location_id = l.id AND sl.variant_id = ?
    WHERE l.is_active = 1
    ORDER BY l.sort_order`,
};

export const VARIANT_PURCHASE_HISTORY = {
  sql: `
    SELECT pl.id, pu.doc_date, pu.doc_no, s.name AS supplier_name, pl.qty, pl.rate, pl.landed_unit_cost
    FROM purchase_lines pl
    JOIN purchases pu ON pu.id = pl.purchase_id AND pu.status = 'posted' AND pu.doc_type = 'purchase'
    JOIN suppliers s ON s.id = pu.supplier_id
    WHERE pl.variant_id = ?
    ORDER BY pu.doc_date DESC, pu.created_at DESC
    LIMIT 20`,
};

export const VARIANT_SALES_HISTORY = {
  sql: `
    SELECT il.id, i.doc_date, i.doc_no, c.name AS customer_name, il.qty, il.rate, il.price_source
    FROM sales_invoice_lines il
    JOIN sales_invoices i ON i.id = il.invoice_id AND i.status = 'posted' AND i.doc_type = 'invoice'
    JOIN customers c ON c.id = i.customer_id
    WHERE il.variant_id = ?
    ORDER BY i.doc_date DESC, i.created_at DESC
    LIMIT 20`,
};

/** What this customer last paid for this SKU. */
export const CUSTOMER_LAST_RATE = {
  sql: `
    SELECT il.rate, i.doc_date, i.doc_no
    FROM sales_invoice_lines il
    JOIN sales_invoices i ON i.id = il.invoice_id AND i.status = 'posted' AND i.doc_type = 'invoice'
    WHERE i.customer_id = ? AND il.variant_id = ?
    ORDER BY i.doc_date DESC, i.created_at DESC
    LIMIT 1`,
};

export const CUSTOMER_PRICE_CONTEXT = {
  sql: `
    SELECT
      (SELECT price FROM customer_prices cp WHERE cp.customer_id = ?1 AND cp.variant_id = ?2 ORDER BY effective_from DESC LIMIT 1) AS customer_price,
      (SELECT pli.price FROM price_list_items pli JOIN customers c ON c.price_list_id = pli.price_list_id
         WHERE c.id = ?1 AND pli.variant_id = ?2 ORDER BY pli.effective_from DESC LIMIT 1) AS price_list_item_price,
      (SELECT pl.price_column FROM price_lists pl JOIN customers c ON c.price_list_id = pl.id WHERE c.id = ?1) AS price_list_column`,
};

// -----------------------------------------------------------------------------
// Dashboard
// -----------------------------------------------------------------------------

export const DASHBOARD_TODAY = {
  sql: `
    SELECT
      -- Net of posted returns, the same rule as Hisab.
      (SELECT COALESCE(SUM(CASE WHEN doc_type='credit_note' THEN -grand_total ELSE grand_total END),0) FROM sales_invoices WHERE doc_type IN ('invoice','credit_note') AND status='posted' AND doc_date = ?1) AS sales_today,
      (SELECT COUNT(*) FROM sales_invoices WHERE doc_type='invoice' AND status='posted' AND doc_date = ?1) AS invoices_today,
      (SELECT COALESCE(SUM(grand_total),0) FROM sales_invoices WHERE doc_type='invoice' AND status='posted' AND doc_date = ?1 AND payment_mode <> 'credit') AS cash_sales_today,
      (SELECT COALESCE(SUM(grand_total),0) FROM purchases WHERE doc_type='purchase' AND status='posted' AND doc_date = ?1) AS purchases_today,
      (SELECT COUNT(*) FROM purchases WHERE doc_type='purchase' AND status='posted' AND doc_date = ?1) AS purchase_docs_today,
      (SELECT COALESCE(SUM(amount),0) FROM payments WHERE direction='in' AND party_type <> 'partner' AND status='posted' AND payment_date = ?1) AS collected_today,
      (SELECT COUNT(*) FROM payments WHERE direction='in' AND party_type <> 'partner' AND status='posted' AND payment_date = ?1) AS receipts_today,
      (SELECT COALESCE(SUM(balance),0) FROM party_balance_live WHERE party_type='customer' AND balance > 0) AS receivables,
      (SELECT COALESCE(SUM(balance),0) FROM party_balance_live WHERE party_type='supplier' AND balance > 0) AS payables,
      (SELECT COALESCE(SUM(sl.qty * pv.avg_cost),0) FROM stock_on_hand sl JOIN product_variants pv ON pv.id = sl.variant_id JOIN locations l ON l.id = sl.location_id WHERE l.type <> 'damaged') AS stock_value,
      (SELECT COALESCE(SUM(grand_total - paid_total),0) FROM sales_invoices WHERE doc_type='invoice' AND status='posted' AND due_date < ?1 AND grand_total > paid_total) AS overdue_amount,
      (SELECT COUNT(DISTINCT customer_id) FROM sales_invoices WHERE doc_type='invoice' AND status='posted' AND due_date < ?1 AND grand_total > paid_total) AS overdue_customers,
      -- What the maal that went out today had cost. Taken from the movement's
      -- own unit_cost, which posting stamped with the moving average at the
      -- moment of sale — so it is the cost of THOSE pieces, not today's rate.
      -- Sale movements are negative, hence the sign flip.
      -- Only bills and write-offs that stand, by their own date — the same rule
      -- as Hisab, so Home and Hisab cannot disagree about the same day.
      (SELECT COALESCE(SUM(-m.qty * m.unit_cost),0) FROM stock_movements m JOIN sales_invoices i ON i.id = m.ref_id
        WHERE m.movement_type IN ('sale','sale_return') AND i.status='posted' AND i.doc_date = ?1) AS cogs_today,
      (SELECT COALESCE(SUM(-m.qty * m.unit_cost),0) FROM stock_movements m JOIN stock_adjustments a ON a.id = m.ref_id
        WHERE m.movement_type='damage' AND a.status='posted' AND a.doc_date = ?1) AS damage_today,
      -- A partner taking money for themselves is money leaving the business
      -- but it is NOT a business expense. Hisab filters it out; without the
      -- same clause here, Home's kharcha and munafa would disagree with Hisab
      -- on exactly the days somebody made a withdrawal.
      (SELECT COALESCE(SUM(amount),0) FROM expenses WHERE expense_date = ?1 AND COALESCE(is_personal,0) = 0) AS spent_today,
      (SELECT COUNT(*) FROM product_variants pv JOIN products p ON p.id = pv.product_id
        WHERE pv.is_active = 1 AND p.is_active = 1
          AND COALESCE((SELECT SUM(qty) FROM stock_on_hand sl WHERE sl.variant_id = pv.id),0)
              <= MAX(pv.min_stock, pv.reorder_level)) AS low_stock_count`,
};

export const STOCK_VALUE_BY_LOCATION = {
  sql: `
    SELECT l.id, l.code, l.name, l.type, COALESCE(SUM(sl.qty * pv.avg_cost),0) AS value, COALESCE(SUM(sl.qty),0) AS units
    FROM locations l
    LEFT JOIN stock_on_hand sl ON sl.location_id = l.id
    LEFT JOIN product_variants pv ON pv.id = sl.variant_id
    WHERE l.is_active = 1
    GROUP BY l.id ORDER BY l.sort_order`,
};

export const LOW_STOCK = (limit = 50) => ({
  sql: `
    SELECT pv.id, pv.sku, pv.variant_name, pv.min_stock, pv.reorder_level, pv.reorder_qty,
           p.name AS product_name, f.name AS family_name,
           COALESCE((SELECT SUM(qty) FROM stock_on_hand sl JOIN locations l ON l.id = sl.location_id WHERE sl.variant_id = pv.id AND l.type <> 'damaged'), 0) AS qty
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    LEFT JOIN product_families f ON f.id = p.family_id
    WHERE pv.is_active = 1 AND p.is_active = 1 AND (pv.min_stock > 0 OR pv.reorder_level > 0)
      AND qty <= MAX(pv.min_stock, pv.reorder_level)
    ORDER BY (qty * 1.0 / MAX(pv.min_stock, pv.reorder_level, 1)) ASC
    LIMIT ${limit}`,
});

export const OVERDUE_CUSTOMERS = (today: string, limit = 10) => ({
  sql: `
    SELECT c.id, c.name, SUM(i.grand_total - i.paid_total) AS overdue,
           CAST(julianday(?1) - julianday(MIN(i.due_date)) AS INTEGER) AS days
    FROM sales_invoices i JOIN customers c ON c.id = i.customer_id
    WHERE i.doc_type='invoice' AND i.status='posted' AND i.due_date < ?1 AND i.grand_total > i.paid_total
    GROUP BY c.id ORDER BY overdue DESC LIMIT ${limit}`,
  params: [today],
});

export const FAST_MOVING = (sinceDate: string, limit = 8) => ({
  sql: `
    SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name, SUM(il.qty) AS sold
    FROM sales_invoice_lines il
    JOIN sales_invoices i ON i.id = il.invoice_id AND i.status='posted' AND i.doc_type='invoice' AND i.doc_date >= ?1
    JOIN product_variants pv ON pv.id = il.variant_id
    JOIN products p ON p.id = pv.product_id
    GROUP BY pv.id ORDER BY sold DESC LIMIT ${limit}`,
  params: [sinceDate],
});

export const DEAD_STOCK = (sinceDate: string, limit = 8) => ({
  sql: `
    SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name,
           COALESCE((SELECT SUM(qty) FROM stock_on_hand sl WHERE sl.variant_id = pv.id),0) AS qty,
           pv.avg_cost,
           (SELECT MAX(i.doc_date) FROM sales_invoice_lines il JOIN sales_invoices i ON i.id = il.invoice_id AND i.status='posted' WHERE il.variant_id = pv.id) AS last_sold
    FROM product_variants pv JOIN products p ON p.id = pv.product_id
    WHERE pv.is_active = 1 AND qty > 0 AND (last_sold IS NULL OR last_sold < ?1)
    ORDER BY qty * pv.avg_cost DESC LIMIT ${limit}`,
  params: [sinceDate],
});

// -----------------------------------------------------------------------------
// Parties
// -----------------------------------------------------------------------------

export const CUSTOMER = {
  sql: `
    SELECT c.*, pl.name AS price_list_name, pl.price_column, COALESCE(pb.balance, 0) AS balance
    FROM customers c
    LEFT JOIN price_lists pl ON pl.id = c.price_list_id
    LEFT JOIN party_balance_live pb ON pb.party_type = 'customer' AND pb.party_id = c.id
    WHERE c.id = ?`,
};

export const CUSTOMER_LEDGER = {
  sql: `
    SELECT id, entry_date, doc_type, doc_no, debit, credit, narration, created_at
    FROM ledger_entries WHERE party_type = 'customer' AND party_id = ?
    ORDER BY entry_date DESC, created_at DESC LIMIT 200`,
};

export const CUSTOMER_TOP_PRODUCTS = (sinceDate: string) => ({
  sql: `
    SELECT pv.id, pv.sku, pv.variant_name, p.name AS product_name, SUM(il.qty) AS qty, MAX(il.rate) AS last_rate
    FROM sales_invoice_lines il
    JOIN sales_invoices i ON i.id = il.invoice_id AND i.status='posted' AND i.doc_type='invoice' AND i.customer_id = ?1 AND i.doc_date >= ?2
    JOIN product_variants pv ON pv.id = il.variant_id
    JOIN products p ON p.id = pv.product_id
    GROUP BY pv.id ORDER BY qty DESC LIMIT 20`,
  params: [sinceDate],
});


/**
 * Aaj kya hua — everything that happened today, in the order it happened.
 *
 * One list out of five tables, because the shop does not think in tables. The
 * time is what makes it read as a day rather than a report, so each row keeps
 * whatever timestamp it actually has.
 */
export const TODAY_FEED = {
  sql: `
    SELECT * FROM (
      SELECT 'sale' AS kind, i.id, i.created_at AS at,
             COALESCE(c.name, 'Cash') AS who,
             i.grand_total AS amount, NULL AS qty
        FROM sales_invoices i LEFT JOIN customers c ON c.id = i.customer_id
       WHERE i.doc_type='invoice' AND i.status='posted' AND i.doc_date = ?1
      UNION ALL
      SELECT 'purchase', p.id, p.created_at, COALESCE(s.name, 'Maal aaya'), p.grand_total, NULL
        FROM purchases p LEFT JOIN suppliers s ON s.id = p.supplier_id
       WHERE p.doc_type='purchase' AND p.status='posted' AND p.doc_date = ?1
      UNION ALL
      SELECT 'expense', e.id, e.created_at, COALESCE(e.category, 'Kharcha'), e.amount, NULL
        FROM expenses e WHERE e.expense_date = ?1 AND COALESCE(e.is_personal, 0) = 0
      UNION ALL
      SELECT 'payment', pm.id, pm.created_at,
             CASE WHEN pm.direction='in' THEN 'Paisa aaya' ELSE 'Paisa diya' END,
             pm.amount, NULL
        FROM payments pm WHERE pm.status='posted' AND pm.party_type <> 'partner' AND pm.payment_date = ?1
      UNION ALL
      SELECT CASE WHEN a.reason='damage' THEN 'damage' ELSE 'adjust' END, a.id, a.created_at,
             COALESCE(a.notes, a.reason), NULL,
             (SELECT COALESCE(SUM(qty_delta),0) FROM stock_adjustment_lines WHERE adjustment_id = a.id)
        FROM stock_adjustments a WHERE a.status='posted' AND a.doc_date = ?1
    ) feed ORDER BY at DESC LIMIT 40`,
};
