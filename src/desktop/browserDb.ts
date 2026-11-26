import {
  APP_MODULES,
  ensureBackupScheduleSettings,
  initializeSchema,
  resetCleanBusinessDatabase,
  seedCoreBusinessData,
} from '../../shared/dbSchema.ts';
import { getDeviceFingerprint, sha512 } from './browserLicenseCrypto.ts';
import { createSqlJsInstance, type SqlJsDbWrapper } from './sqljsAdapter.ts';
import fsShim, { loadPersistedVirtualBackups } from './fsAndPathShim.ts';

export { APP_MODULES, resetCleanBusinessDatabase };
export const DB_PATH = '/data/plaza_business.db';

const IDB_NAME = 'PlazaBusinessDesktopDB';
const IDB_STORE = 'sqlite_files';
const IDB_KEY = 'plaza_business_main';

let dbInstance: SqlJsDbWrapper | null = null;
let saveTimer: number | null = null;

function openIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    let settled = false;
    const timer = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('IndexedDB open timeout'));
      }
    }, 1500);
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE);
        }
      };
      req.onsuccess = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          resolve(req.result);
        }
      };
      req.onerror = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(req.error);
        }
      };
      req.onblocked = () => {
        if (!settled) {
          settled = true;
          window.clearTimeout(timer);
          reject(new Error('IndexedDB blocked'));
        }
      };
    } catch (err) {
      if (!settled) {
        settled = true;
        window.clearTimeout(timer);
        reject(err);
      }
    }
  });
}

async function loadSavedBytes(): Promise<Uint8Array | undefined> {
  try {
    const idb = await openIdb();
    return await new Promise((resolve) => {
      const tx = idb.transaction(IDB_STORE, 'readonly');
      const getReq = tx.objectStore(IDB_STORE).get(IDB_KEY);
      getReq.onsuccess = () => resolve(getReq.result as Uint8Array | undefined);
      getReq.onerror = () => resolve(undefined);
    });
  } catch {
    return undefined;
  }
}

export async function persistDesktopDb(): Promise<void> {
  if (!dbInstance) return;
  try {
    const bytes = dbInstance.exportBytes();
    const idb = await openIdb();
    await new Promise<void>((resolve, reject) => {
      const tx = idb.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).put(bytes, IDB_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // ignore storage quota failures
  }
}

function schedulePersist() {
  if (saveTimer !== null) window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    persistDesktopDb();
  }, 150);
}

let browserTrialTampered = false;

function computeBrowserAnchorTag(trialStart: string, lastSeen: string, fp: string): string {
  const bytes = sha512(new TextEncoder().encode(`MINA_BROWSER_V2|${trialStart}|${lastSeen}|${fp}|OSAMA_01153672084`));
  return Array.from(bytes.slice(0, 16))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isBrowserTrialTampered(): boolean {
  return browserTrialTampered;
}

export function updateBrowserTrialAnchor(nowIso: string, fp: string): void {
  try {
    const anchorKey = 'plaza_desktop_trial_anchor';
    let startIso = nowIso;
    const saved = localStorage.getItem(anchorKey);
    if (saved) {
      const parsed = JSON.parse(saved) as { trial_started_at?: string };
      if (parsed.trial_started_at) startIso = parsed.trial_started_at;
    }
    const tag = computeBrowserAnchorTag(startIso, nowIso, fp);
    localStorage.setItem(anchorKey, JSON.stringify({ trial_started_at: startIso, last_seen_at: nowIso, v: 2, tag }));
  } catch {
    // ignore storage limits
  }
}

function initializeBrowserTrial(db: SqlJsDbWrapper) {
  const fp = getDeviceFingerprint();
  const existing = db.prepare('SELECT * FROM licenses LIMIT 1').get() as Record<string, unknown> | undefined;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();
  const anchorKey = 'plaza_desktop_trial_anchor';
  let startIso = nowIso;
  let lastIso = nowIso;

  try {
    const saved = localStorage.getItem(anchorKey);
    if (saved) {
      const parsed = JSON.parse(saved) as { trial_started_at?: string; last_seen_at?: string; v?: number; tag?: string };
      const ts = String(parsed.trial_started_at || '');
      const ls = String(parsed.last_seen_at || ts);
      const legacyFp = fp.startsWith('MINA-') ? `PLZ-${fp.slice(5)}` : fp;
      const dbSavedFp = String(existing?.device_fingerprint || '');
      if (
        parsed.v === 2 &&
        parsed.tag !== computeBrowserAnchorTag(ts, ls, fp) &&
        parsed.tag !== computeBrowserAnchorTag(ts, ls, legacyFp) &&
        (!dbSavedFp || parsed.tag !== computeBrowserAnchorTag(ts, ls, dbSavedFp))
      ) {
        browserTrialTampered = true;
      }
      if (ts) startIso = ts;
      if (ls) lastIso = ls;
    } else {
      const tag = computeBrowserAnchorTag(nowIso, nowIso, fp);
      localStorage.setItem(anchorKey, JSON.stringify({ trial_started_at: nowIso, last_seen_at: nowIso, v: 2, tag }));
    }
  } catch {
    // localStorage may be blocked in file:// strict security contexts; fall back to DB record without false tamper lock
  }

  if (!existing) {
    const sMs = new Date(startIso).getTime();
    if (Number.isNaN(sMs) || sMs > nowMs + 3600000) browserTrialTampered = true;
    db.prepare(
      `INSERT INTO licenses (trial_started_at, last_seen_at, device_fingerprint, license_type, issued_at, clock_tamper_flagged)
       VALUES (?, ?, ?, 'TRIAL', ?, ?)`
    ).run(startIso, lastIso, fp, startIso, browserTrialTampered ? 1 : 0);
  } else {
    const dbStart = String(existing.trial_started_at || nowIso);
    const dbLast = String(existing.last_seen_at || nowIso);
    const dbStartMs = new Date(dbStart).getTime();
    const aStartMs = new Date(startIso).getTime();
    if (Number.isNaN(dbStartMs) || Number.isNaN(aStartMs) || dbStartMs > nowMs + 3600000 || aStartMs > nowMs + 3600000) {
      browserTrialTampered = true;
    }
    const earliest = !Number.isNaN(dbStartMs) && !Number.isNaN(aStartMs) && dbStartMs <= aStartMs ? dbStart : startIso;
    const latest = new Date(dbLast).getTime() >= new Date(lastIso).getTime() ? dbLast : lastIso;
    db.prepare(
      'UPDATE licenses SET trial_started_at = ?, last_seen_at = ?, clock_tamper_flagged = CASE WHEN ? = 1 THEN 1 ELSE clock_tamper_flagged END WHERE id = ?'
    ).run(earliest, latest, browserTrialTampered ? 1 : 0, existing.id);
    const tag = computeBrowserAnchorTag(earliest, latest, fp);
    try {
      localStorage.setItem(anchorKey, JSON.stringify({ trial_started_at: earliest, last_seen_at: latest, v: 2, tag }));
    } catch {
      // ignore
    }
  }
}

export async function initDesktopDb(): Promise<SqlJsDbWrapper> {
  if (dbInstance) return dbInstance;
  await loadPersistedVirtualBackups();
  const savedBytes = await loadSavedBytes();
  dbInstance = await createSqlJsInstance(savedBytes, schedulePersist);
  dbInstance.pragma('foreign_keys = ON');
  initializeSchema(dbInstance);
  initializeBrowserTrial(dbInstance);
  seedCoreBusinessData(dbInstance);
  ensureBackupScheduleSettings(dbInstance);
  await persistDesktopDb();
  return dbInstance;
}

export function getDb(): SqlJsDbWrapper {
  if (!dbInstance) {
    throw new Error('Desktop SQLite DB not initialized yet');
  }
  return dbInstance;
}

export async function reloadDb(): Promise<SqlJsDbWrapper> {
  if (fsShim.existsSync(DB_PATH)) {
    const restored = fsShim.readFileSync(DB_PATH);
    dbInstance?.close();
    dbInstance = null;
    try {
      const inst = await createSqlJsInstance(new Uint8Array(restored), schedulePersist);
      dbInstance = inst;
      dbInstance.pragma('foreign_keys = ON');
      initializeSchema(dbInstance);
      initializeBrowserTrial(dbInstance);
      ensureBackupScheduleSettings(dbInstance);
      await persistDesktopDb();
    } finally {
      fsShim.unlinkSync(DB_PATH);
    }
  }
  return getDb();
}

export function getBackupsDir(): string {
  return '/backups';
}
