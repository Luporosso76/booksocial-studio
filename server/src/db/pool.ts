import Database from "better-sqlite3";
import { join } from "node:path";
import { dataDir } from "../paths.js";
import { norm } from "./normalizeParams.js";

// Embedded SQLite database (better-sqlite3), single file `booksocial.sqlite` on disk under dataDir().
// Timestamps are stored as epoch ms (INTEGER in SQLite).
const db = new Database(join(dataDir(), "booksocial.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.pragma("busy_timeout = 5000");

export type Row = Record<string, unknown>;

// `norm` (normalizzazione bind param) vive in ./normalizeParams.ts: funzione pura, testabile
// senza aprire il database. better-sqlite3 accetta SOLO number | string | bigint | Buffer | null.

export async function query<T extends Row = Row>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const rows = db.prepare(sql).all(...(norm(params) as never[]));
  return rows as T[];
}

export async function execute(
  sql: string,
  params: unknown[] = [],
): Promise<{ insertId: number; affectedRows: number }> {
  const info = db.prepare(sql).run(...(norm(params) as never[]));
  return { insertId: Number(info.lastInsertRowid), affectedRows: info.changes };
}

// Connessione logica passata a withTransaction: stessa forma usata dai call-site
// (conn.execute / conn.query). Le operazioni avvengono sull'unico db condiviso, già
// dentro la transazione aperta da withTransaction.
interface TxConn {
  execute: (sql: string, params?: unknown[]) => Promise<{ insertId: number; affectedRows: number }>;
  query: <T extends Row = Row>(sql: string, params?: unknown[]) => Promise<T[]>;
}

export async function withTransaction<T>(fn: (conn: TxConn) => Promise<T>): Promise<T> {
  // NON usare db.transaction(): richiede una funzione SYNC; qui fn è async.
  // Implementiamo la transazione a mano con BEGIN/COMMIT/ROLLBACK.
  const conn: TxConn = {
    execute: (sql, params = []) => execute(sql, params),
    query: <T extends Row = Row>(sql: string, params: unknown[] = []) => query<T>(sql, params),
  };
  db.exec("BEGIN");
  try {
    const out = await fn(conn);
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // ignore rollback failure
    }
    throw e;
  }
}

// Wrapper esportato come `pool` per i file che lo importano (migrate.ts: .exec/.prepare;
// index.ts: .end() async per lo shutdown). Delega all'istanza Database condivisa.
export const pool = {
  exec: (sql: string): void => {
    db.exec(sql);
  },
  prepare: (sql: string) => db.prepare(sql),
  close: (): void => {
    db.close();
  },
  end: async (): Promise<void> => {
    db.close();
  },
  raw: db,
};
