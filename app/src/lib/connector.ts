/**
 * PowerSync <-> Supabase connector.
 *
 * fetchCredentials: hands PowerSync the Supabase JWT so the sync service can
 *   authenticate the device.
 * uploadData: drains the local write queue one transaction at a time, sending
 *   each CRUD entry to PostgREST. A posted invoice, its lines, its stock
 *   movements and its ledger entries were written in ONE local transaction, so
 *   they arrive at the server as one unit and are retried as one unit.
 */
import {
  type AbstractPowerSyncDatabase,
  type CrudEntry,
  type PowerSyncBackendConnector,
  UpdateType,
} from '@powersync/common';

import { POWERSYNC_URL, supabase } from './supabase';

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

  async uploadData(database: AbstractPowerSyncDatabase): Promise<void> {
    const transaction = await database.getNextCrudTransaction();
    if (!transaction) return;

    let lastOp: CrudEntry | null = null;

    try {
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
        await transaction.complete();
        return;
      }

      // Retryable: PowerSync will call uploadData again after a delay.
      throw err;
    }
  }
}
