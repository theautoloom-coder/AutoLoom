/**
 * Local SQL views that derive stock and balances from the synced event tables.
 * The server keeps stock_levels / party_balances caches, but they only reach a
 * device after a sync round-trip; deriving from stock_movements and
 * ledger_entries makes an offline purchase or invoice show up immediately.
 */
export const LOCAL_VIEWS_SQL = [
  `CREATE VIEW IF NOT EXISTS stock_on_hand AS
     SELECT variant_id, location_id, SUM(qty) AS qty, MAX(occurred_at) AS last_movement_at
     FROM stock_movements GROUP BY variant_id, location_id`,
  `CREATE VIEW IF NOT EXISTS party_balance_live AS
     SELECT party_type, party_id,
            CASE WHEN party_type = 'customer' THEN SUM(debit) - SUM(credit) ELSE SUM(credit) - SUM(debit) END AS balance,
            MAX(entry_date) AS last_entry_date
     FROM ledger_entries GROUP BY party_type, party_id`,
];
