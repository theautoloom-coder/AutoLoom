/**
 * The local database and its sync connection.
 *
 * One PowerSyncDatabase per app. Native builds use op-sqlite; the web build
 * uses wa-sqlite inside a worker. Every screen reads from this database and
 * every write goes into it; PowerSync moves data to and from Supabase.
 */
import { PowerSyncContext } from '@powersync/react';
import { type AbstractPowerSyncDatabase } from '@powersync/react-native';
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { SupabaseConnector } from './connector';
import { LOCAL_VIEWS_SQL } from './local-views';
import { AppSchema } from './schema';

const DB_FILENAME = 'autoloom.db';

export async function ensureLocalViews(db: AbstractPowerSyncDatabase): Promise<void> {
  for (const sql of LOCAL_VIEWS_SQL) await db.execute(sql);
}

function createDatabase(): AbstractPowerSyncDatabase {
  if (Platform.OS === 'web') {
    // Resolved to the web SDK by metro.config.js on web; empty module on native.
    const { PowerSyncDatabase } = require('@powersync/web') as typeof import('@powersync/web');
    return new PowerSyncDatabase({
      schema: AppSchema,
      database: { dbFilename: DB_FILENAME, worker: '/@powersync/worker.js' },
      sync: { worker: '/@powersync/worker.js' },
    });
  }

  const { PowerSyncDatabase } = require('@powersync/react-native') as typeof import('@powersync/react-native');
  return new PowerSyncDatabase({
    schema: AppSchema,
    database: { dbFilename: DB_FILENAME },
  });
}

export type System = {
  db: AbstractPowerSyncDatabase;
  connector: SupabaseConnector;
  /** Call once a Supabase session exists. Safe to call repeatedly. */
  connect: () => Promise<void>;
  /** Call on sign-out. Keeps local data unless `clear` is true. */
  disconnect: (clear?: boolean) => Promise<void>;
  /**
   * Why sync is not running, if it is not. A device with no signal and a
   * device whose token the sync service refuses look identical from the
   * counter — both just say "Offline" — so the reason has to reach the screen
   * instead of only the console.
   */
  syncError: string | null;
};

/**
 * Anything thrown or reported by the sync client, reduced to one line a
 * shopkeeper can read out over the phone.
 *
 * PowerSync reports failures as a plain object, not an Error, so the obvious
 * `String(err)` renders the literal text "[object Object]" on the sync screen —
 * which is what it was doing, and is worse than saying nothing. The service's
 * own codes are the useful part, so they are translated rather than shown raw:
 * every one of these means something a person can act on, and none of them mean
 * "no internet", which is the conclusion everyone jumps to.
 */
const SYNC_CODES: Record<string, string> = {
  PSYNC_S2302:
    'PowerSync par sync rules deploy nahi hui hain. Instance chalu hai par usse pata nahi ki kaunsa data bhejna hai — PowerSync dashboard mein sync rules deploy karni padengi.',
  PSYNC_S2101: 'PowerSync ka database connection nahi ban raha. Source database ki settings check karni padengi.',
  PSYNC_S2203: 'Sync rules mein galti hai — PowerSync unhe padh nahi paaya.',
};

export function describeSyncError(err: unknown): string {
  if (err == null) return '';

  // The body PowerSync returns is JSON inside a string, so the code is findable
  // wherever in the chain it ended up.
  const raw =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? `${err.message}`
        : (() => {
            try {
              return JSON.stringify(err);
            } catch {
              return String(err);
            }
          })();

  const code = raw.match(/PSYNC_[A-Z0-9]+/)?.[0];
  if (code && SYNC_CODES[code]) return `${SYNC_CODES[code]} (${code})`;

  const desc = raw.match(/"description"\s*:\s*"([^"]+)"/)?.[1];
  if (code) return `Sync service ne mana kar diya: ${desc ?? code} (${code})`;

  if (/401|403|jwt|token|unauthor/i.test(raw)) return `Sync service ne login token reject kiya. ${desc ?? raw}`;
  if (/fetch|network|ENOTFOUND|ECONNREFUSED|timeout/i.test(raw)) return `Sync service se baat nahi ho paayi. ${desc ?? raw}`;

  return desc ?? raw.slice(0, 300);
}

const describe = describeSyncError;

const SystemContext = createContext<System | null>(null);

export function SystemProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  // The system object is built once, before the setter exists, so it reaches
  // the closure through a ref rather than by capturing it.
  const reportRef = useRef<(e: string | null) => void>(() => {});
  reportRef.current = setSyncError;
  const systemRef = useRef<System | null>(null);

  if (!systemRef.current) {
    const db = createDatabase();
    const connector = new SupabaseConnector();
    let connected = false;

    systemRef.current = {
      db,
      connector,
      syncError: null,
      async connect() {
        if (connected) return;
        try {
          connected = true;
          await db.connect(connector);
          reportRef.current(null);
        } catch (err) {
          // Must not latch. Leaving this true would make every later attempt
          // return early, so one failed connect left the app offline until the
          // app was killed and reopened — which is what it was doing.
          connected = false;
          reportRef.current(describe(err));
          throw err;
        }
      },
      async disconnect(clear = false) {
        connected = false;
        reportRef.current(null);
        if (clear) await db.disconnectAndClear();
        else await db.disconnect();
      },
    };
  }

  useEffect(() => {
    const system = systemRef.current!;
    let cancelled = false;
    system.db
      .init()
      .then(() => ensureLocalViews(system.db))
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch((err) => {
        console.error('[db] init failed', err);
        setSyncError(`Local database khul nahi paaya: ${describe(err)}`);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Rebuilt when the error changes so screens re-render; the db and connector
  // themselves stay the same instances.
  const value = useMemo(() => ({ ...systemRef.current!, syncError }), [syncError]);

  if (!ready) return null;

  return (
    <SystemContext.Provider value={value}>
      <PowerSyncContext.Provider value={value.db}>{children}</PowerSyncContext.Provider>
    </SystemContext.Provider>
  );
}

export function useSystem(): System {
  const ctx = useContext(SystemContext);
  if (!ctx) throw new Error('useSystem must be used inside SystemProvider');
  return ctx;
}
