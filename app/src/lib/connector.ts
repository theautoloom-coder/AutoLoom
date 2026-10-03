/**
 * PowerSync <-> Supabase connector.
 *
 * fetchCredentials: hands PowerSync the Supabase JWT so the sync service can
 *   authenticate the device.
 * uploadData: drains the local write queue one transaction at a time. A posted
 *   invoice, its lines, its stock movements and its ledger entries were written
 *   in ONE local transaction, and `apply_crud` applies them in ONE database
 *   transaction: all of it lands, or none of it does.
 */
import {
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  UpdateType,
} from '@powersync/common';

import { POWERSYNC_URL, supabase } from './supabase';
import { announceRejection } from './sync-events';

/**
 * Postgres error codes that mean "this write will never succeed"; retrying
 * would block the queue forever. Anything else (network, 5xx, RLS timing) is
 * retried with backoff by PowerSync.
 *
 *   22xxx data exception (bad number, bad date)
 *   23xxx integrity constraint (unique SKU, FK missing, check failed)
 *   42501 insufficient privilege (RLS said no)
 *   42xxx syntax / undefined column (schema drift)
 */
// SQLSTATE codes are five alphanumerics (22P02 = invalid text representation), not five digits.
const FATAL_RESPONSE_CODES = [/^22[0-9A-Z]{3}$/, /^23[0-9A-Z]{3}$/, /^42[0-9A-Z]{3}$/, /^PGRST1\d\d$/];

/** Rows that are read-only caches on the device; never upload them. */
const SERVER_ONLY_TABLES = new Set(['stock_levels', 'party_balances', 'audit_logs']);

/**
 * When a whole transaction is refused the server does not say which row did
 * it, so the message names the document the person was making — the bill, not
 * "Bill ki line" or a counter they have never heard of.
 */
const HEADERS = ['sales_invoices', 'purchases', 'payments', 'expenses', 'stock_adjustments', 'stock_transfers', 'customers', 'suppliers', 'products', 'change_requests'];

function headerOf(crud: CrudEntry[]): CrudEntry {
  for (const table of HEADERS) {
    const hit = crud.find((op) => op.table === table);
    if (hit) return hit;
  }
  return crud[0];
}

export type UploadFailure = {
  table: string;
  id: string;
  op: string;
  code: string | null;
  message: string;
  at: string;
};

export class SupabaseConnector implements PowerSyncBackendConnector {
  /** Last few fatal failures, surfaced on the sync status screen. */
  readonly failures: UploadFailure[] = [];

  async fetchCredentials() {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession();

    if (error) throw error;
    if (!session) return null;

    return {
      endpoint: POWERSYNC_URL,
      token: session.access_token,
    };
  }

  /**
   * False once the server has said it has no apply_crud (an APK that reached
   * the shop before its migration did). Then the old row-at-a-time path runs.
   */
  private atomic = true;

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    let lastOp: CrudEntry | null = null;

    try {
      const crud = transaction.crud.filter((op) => !SERVER_ONLY_TABLES.has(op.table));

      // The whole transaction in one database transaction. Sent a row at a
      // time, a bill's stock movement committed and then its header was
      // refused: stock left the shelf on the server with no bill behind it.
      if (this.atomic && crud.length > 0) {
        lastOp = headerOf(crud);
        const { data, error } = await supabase.rpc('apply_crud', {
          ops: crud.map((op) => ({ op: op.op, table: op.table, id: op.id, data: op.opData ?? {} })),
        });
        if (!error) {
          if (Array.isArray(data) && data.length > 0) {
            // RLS skipped these quietly — the server keeps them itself (avg_cost).
            console.warn('[sync] server left these updates alone', data);
          }
          await transaction.complete();
          return;
        }
        if (error.code === 'PGRST202') {
          this.atomic = false;
        } else {
          throw Object.assign(new Error(error.message), { code: error.code });
        }
      }

      for (const op of transaction.crud) {
        lastOp = op;
        if (SERVER_ONLY_TABLES.has(op.table)) continue;

        const table = supabase.from(op.table);
        let result: { error: { code?: string; message: string } | null };

        switch (op.op) {
          case UpdateType.PUT:
            // Upsert keyed on the client-generated id: a retried upload is idempotent.
            result = await table.upsert({ ...op.opData, id: op.id });
            break;
          case UpdateType.PATCH:
            result = await table.update(op.opData ?? {}).eq('id', op.id);
            break;
          case UpdateType.DELETE:
            result = await table.delete().eq('id', op.id);
            break;
          default:
            continue;
        }

        if (result.error) {
          throw Object.assign(new Error(result.error.message), { code: result.error.code });
        }
      }

      await transaction.complete();
    } catch (err: unknown) {
      const e = err as { code?: string; message?: string };
      const code = typeof e.code === 'string' ? e.code : null;

      if (code && FATAL_RESPONSE_CODES.some((re) => re.test(code))) {
        // Record it, drop the transaction, keep the queue moving.
        this.failures.unshift({
          table: lastOp?.table ?? '?',
          id: lastOp?.id ?? '?',
          op: lastOp?.op ?? '?',
          code,
          message: e.message ?? String(err),
          at: new Date().toISOString(),
        });
        this.failures.splice(20);
        console.error('[sync] discarding transaction after fatal error', this.failures[0]);
        // The entry was already shown as saved. Say that it was not.
        announceRejection(this.failures[0]);
        await transaction.complete();
        return;
      }

      // Retryable: PowerSync will call uploadData again after a delay.
      throw err;
    }
  }
}
