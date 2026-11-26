import initSqlJs from 'sql.js/dist/sql-wasm-inline.js';
import type { DbLike } from '../../shared/dbSchema.ts';
import fsShim from './fsAndPathShim.ts';

type SqlJsDatabase = {
  exec: (sql: string) => Array<{ columns: string[]; values: unknown[][] }>;
  run: (sql: string, params?: unknown[]) => void;
  prepare: (sql: string) => {
    bind: (params?: unknown[]) => boolean;
    step: () => boolean;
    getAsObject: () => Record<string, unknown>;
    free: () => void;
  };
  export: () => Uint8Array;
  close: () => void;
};

let txDepth = 0;

function normalizeParams(args: unknown[]): unknown[] {
  const flat = args.length === 1 && Array.isArray(args[0]) ? args[0] : args;
  return flat.map((v) => {
    if (v === undefined) return null;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (typeof v === 'bigint') return Number(v);
    return v;
  });
}

export class SqlJsDbWrapper implements DbLike {
  private raw: SqlJsDatabase;
  private onDirty?: () => void;

  constructor(raw: SqlJsDatabase, onDirty?: () => void) {
    this.raw = raw;
    this.onDirty = onDirty;
  }

  exec(sql: string) {
    this.raw.exec(sql);
    this.onDirty?.();
    return this;
  }

  pragma(cmd: string) {
    try {
      this.raw.exec(`PRAGMA ${cmd};`);
    } catch {
      // ignore WAL pragma in memory
    }
  }

  prepare(sql: string) {
    const raw = this.raw;
    const onDirty = this.onDirty;
    return {
      get: (...args: unknown[]) => {
        const stmt = raw.prepare(sql);
        try {
          const bound = normalizeParams(args);
          if (bound.length > 0) stmt.bind(bound);
          if (!stmt.step()) return undefined;
          return stmt.getAsObject();
        } finally {
          stmt.free();
        }
      },
      all: (...args: unknown[]) => {
        const stmt = raw.prepare(sql);
        const rows: Record<string, unknown>[] = [];
        try {
          const bound = normalizeParams(args);
          if (bound.length > 0) stmt.bind(bound);
          while (stmt.step()) {
            rows.push(stmt.getAsObject());
          }
          return rows;
        } finally {
          stmt.free();
        }
      },
      run: (...args: unknown[]) => {
        const bound = normalizeParams(args);
        raw.run(sql, bound);
        const meta = raw.exec('SELECT last_insert_rowid() as lid, changes() as ch');
        const lid = Number(meta[0]?.values?.[0]?.[0] ?? 0);
        const ch = Number(meta[0]?.values?.[0]?.[1] ?? 0);
        onDirty?.();
        return { changes: ch, lastInsertRowid: lid };
      },
    };
  }

  transaction(fn: () => void): () => void {
    const wrapper = this;
    return () => {
      const sp = `sp_${txDepth++}`;
      const isOuter = txDepth === 1;
      try {
        wrapper.raw.exec(isOuter ? 'BEGIN TRANSACTION;' : `SAVEPOINT ${sp};`);
        fn();
        wrapper.raw.exec(isOuter ? 'COMMIT;' : `RELEASE SAVEPOINT ${sp};`);
        if (isOuter) wrapper.onDirty?.();
      } catch (err) {
        try {
          wrapper.raw.exec(isOuter ? 'ROLLBACK;' : `ROLLBACK TO SAVEPOINT ${sp};`);
        } catch {
          // ignore
        }
        throw err;
      } finally {
        txDepth--;
      }
    };
  }

  exportBytes(): Uint8Array {
    return this.raw.export();
  }

  async backup(destPath: string): Promise<void> {
    fsShim.writeFileSync(destPath, this.raw.export());
  }

  close() {
    this.raw.close();
  }
}

export async function createSqlJsInstance(initialBytes?: Uint8Array, onDirty?: () => void): Promise<SqlJsDbWrapper> {
  const SQL = await (initSqlJs as unknown as () => Promise<{ Database: new (data?: Uint8Array) => SqlJsDatabase }>)();
  const db = initialBytes && initialBytes.byteLength > 0 ? new SQL.Database(initialBytes) : new SQL.Database();
  return new SqlJsDbWrapper(db, onDirty);
}
