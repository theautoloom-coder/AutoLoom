/**
 * A tiny stand-in for PowerSync's database built on node:sqlite.
 *
 * Creates one table per entry in the generated AppSchema (plus the local
 * views), and exposes execute / getAll / getOptional / writeTransaction with
 * the same result shape the app code relies on ({ rows: { _array } }).
 */
import type { QueryResult } from '@powersync/common';
import { DatabaseSync } from 'node:sqlite';

import { LOCAL_VIEWS_SQL } from '../src/lib/local-views';
import { AppSchema } from '../src/lib/schema';

type Params = Array<string | number | null | undefined | boolean>;
export type Result = QueryResult;

export type FakeTx = {
  execute: (sql: string, params?: Params) => Promise<Result>;
  getAll: <T>(sql: string, params?: Params) => Promise<T[]>;
  getOptional: <T>(sql: string, params?: Params) => Promise<T | null>;
};
export type FakeDb = FakeTx & { writeTransaction: <T>(fn: (tx: FakeTx) => Promise<T>) => Promise<T>; raw: DatabaseSync };

function sqlType(t: unknown): string {
  const s = String(t).toUpperCase();
  if (s.includes('INT')) return 'INTEGER';
  if (s.includes('REAL')) return 'REAL';
  return 'TEXT';
}

export function createDb(): FakeDb {
  const raw = new DatabaseSync(':memory:');
  for (const table of AppSchema.tables) {
    const cols = table.columns.map((c) => `${c.name} ${sqlType(c.type)}`).join(', ');
    raw.exec(`CREATE TABLE ${table.name} (id TEXT PRIMARY KEY, ${cols})`);
  }
  for (const v of LOCAL_VIEWS_SQL) raw.exec(v);

  const norm = (params?: Params) => (params ?? []).map((p) => (p === undefined ? null : typeof p === 'boolean' ? (p ? 1 : 0) : p));

  const execute = async (sql: string, params?: Params): Promise<Result> => {
    // SQLite's ?NNN numbered placeholders work on device; node:sqlite only binds them by name.
    let bound: Array<string | number | null> | [Record<string, string | number | null>] = norm(params);
    let text = sql;
    if (/\?\d+/.test(sql)) {
      const named: Record<string, string | number | null> = {};
      norm(params).forEach((v, i) => { named[`p${i + 1}`] = v; });
      text = sql.replace(/\?(\d+)/g, (_m, n: string) => `:p${n}`);
      bound = [named];
    }
    const stmt = raw.prepare(text);
    if (/^\s*(select|with|pragma)/i.test(sql)) {
      const rows = stmt.all(...(bound as never[])) as Record<string, unknown>[];
      return { rows: { _array: rows, length: rows.length, item: (<T,>(i: number) => rows[i] as T) }, rowsAffected: 0 } as unknown as QueryResult;
    }
    const r = stmt.run(...(bound as never[]));
    return { rows: { _array: [], length: 0, item: (<T,>() => undefined as T) }, rowsAffected: Number(r.changes), insertId: Number(r.lastInsertRowid) } as unknown as QueryResult;
  };
  const getAll = async <T,>(sql: string, params?: Params) => ((await execute(sql, params)).rows?._array ?? []) as T[];
  const getOptional = async <T,>(sql: string, params?: Params) => (((await execute(sql, params)).rows?._array ?? [])[0] as T) ?? null;
  const tx: FakeTx = { execute, getAll, getOptional };

  return {
    ...tx,
    raw,
    async writeTransaction<T>(fn: (t: FakeTx) => Promise<T>): Promise<T> {
      raw.exec('BEGIN');
      try {
        const out = await fn(tx);
        raw.exec('COMMIT');
        return out;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

/** Insert a row with the given id and columns (no audit columns needed). */
export function row(db: FakeDb, table: string, data: Record<string, unknown>) {
  const cols = Object.keys(data);
  db.raw.prepare(`INSERT INTO ${table} (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})`).run(...cols.map((c) => { const v = data[c]; return v === undefined ? null : typeof v === 'boolean' ? (v ? 1 : 0) : (v as string | number | null); }));
}

export function one<T = Record<string, unknown>>(db: FakeDb, sql: string, ...params: (string | number | null)[]): T {
  return db.raw.prepare(sql).get(...params) as T;
}
export function many<T = Record<string, unknown>>(db: FakeDb, sql: string, ...params: (string | number | null)[]): T[] {
  return db.raw.prepare(sql).all(...params) as T[];
}
