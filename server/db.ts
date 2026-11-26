import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getBakedClientConfig, getDeviceFingerprint, getOrCreateOwnerVault } from './licenseCrypto.ts';
import {
  APP_MODULES,
  ensureBackupScheduleSettings,
  initializeSchema,
  resetCleanBusinessDatabase,
  seedCoreBusinessData,
} from '../shared/dbSchema.ts';

export { APP_MODULES, resetCleanBusinessDatabase };

const DATA_DIR = path.resolve(process.cwd(), 'data');
const BACKUPS_DIR = path.resolve(process.cwd(), 'backups');
export const DB_PATH = path.join(DATA_DIR, 'plaza_business.db');
const TRIAL_ANCHOR_PATH = path.join(DATA_DIR, '.plaza_trial_anchor.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });

let dbInstance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = new Database(DB_PATH);
    dbInstance.pragma('journal_mode = WAL');
    dbInstance.pragma('foreign_keys = ON');
    initializeSchema(dbInstance);
    initializeTrialIntegrity(dbInstance);
    seedCoreBusinessData(dbInstance);
    ensureBackupScheduleSettings(dbInstance);
  }
  return dbInstance;
}

export function reloadDb(): Database.Database {
  if (dbInstance) {
    dbInstance.close();
    dbInstance = null;
  }
  return getDb();
}

export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.pragma('wal_checkpoint(TRUNCATE)');
    } catch {
      // ignore checkpoint errors
    }
    try {
      dbInstance.close();
    } catch {
      // ignore close errors
    }
    dbInstance = null;
  }
}

export function getDefaultBackupsDir(): string {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  return BACKUPS_DIR;
}

export function getBackupsDir(): string {
  try {
    if (dbInstance) {
      const row = dbInstance.prepare("SELECT value FROM settings WHERE key = 'auto_backup_dir'").get() as
        | { value: string }
        | undefined;
      const custom = row?.value?.trim();
      if (custom) {
        const resolved = path.isAbsolute(custom) ? custom : path.resolve(process.cwd(), custom);
        if (!fs.existsSync(resolved)) {
          fs.mkdirSync(resolved, { recursive: true });
        }
        return resolved;
      }
    }
  } catch (err) {
    console.error('Custom backup directory warning, falling back to default:', err);
  }
  return getDefaultBackupsDir();
}

function computeAnchorMac(trialStart: string, lastSeen: string, fp: string): string {
  const key = crypto.createHash('sha256').update(`MINA_NET_ANCHOR_V2|${fp}|OSAMA_GERGES_01153672084`).digest();
  return crypto.createHmac('sha256', key).update(`${trialStart}|${lastSeen}|${fp}`).digest('hex');
}

export function updateTrialAnchorLastSeen(nowIso: string, fp: string): void {
  try {
    let startIso = nowIso;
    if (fs.existsSync(TRIAL_ANCHOR_PATH)) {
      const parsed = JSON.parse(fs.readFileSync(TRIAL_ANCHOR_PATH, 'utf-8')) as { trial_started_at?: string };
      if (parsed.trial_started_at) startIso = parsed.trial_started_at;
    }
    const mac = computeAnchorMac(startIso, nowIso, fp);
    fs.writeFileSync(
      TRIAL_ANCHOR_PATH,
      JSON.stringify({ trial_started_at: startIso, last_seen_at: nowIso, v: 2, integrity: mac }),
      'utf-8'
    );
  } catch {
    // ignore disk errors
  }
}

function initializeTrialIntegrity(db: Database.Database) {
  const baked = getBakedClientConfig();
  if (!baked) {
    getOrCreateOwnerVault();
  }
  const fp = getDeviceFingerprint();
  const legacyFp = fp.startsWith('MINA-') ? `PLZ-${fp.slice(5)}` : fp;
  const existingLic = db.prepare('SELECT * FROM licenses LIMIT 1').get() as Record<string, unknown> | undefined;

  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  let anchorStart = nowIso;
  let anchorLastSeen = nowIso;
  let tamperDetected = false;
  let migratedLegacyAnchor = false;

  if (fs.existsSync(TRIAL_ANCHOR_PATH)) {
    try {
      const anchor = JSON.parse(fs.readFileSync(TRIAL_ANCHOR_PATH, 'utf-8')) as {
        trial_started_at?: string;
        last_seen_at?: string;
        v?: number;
        integrity?: string;
      };
      const ts = String(anchor.trial_started_at || '');
      const ls = String(anchor.last_seen_at || ts);
      const dbSavedFp = String(existingLic?.device_fingerprint || '');
      if (anchor.v === 2) {
        const expected = computeAnchorMac(ts, ls, fp);
        const expectedLegacy = computeAnchorMac(ts, ls, legacyFp);
        const expectedSaved = dbSavedFp ? computeAnchorMac(ts, ls, dbSavedFp) : '';
        if (anchor.integrity === expected) {
          // valid current anchor
        } else if (anchor.integrity === expectedLegacy || (expectedSaved && anchor.integrity === expectedSaved)) {
          migratedLegacyAnchor = true;
        } else if (baked) {
          tamperDetected = true;
        }
      } else {
        const legacyHash = crypto.createHash('sha256').update(`${ts}|${fp}`).digest('hex');
        const legacyHashOld = crypto.createHash('sha256').update(`${ts}|${legacyFp}`).digest('hex');
        if (anchor.integrity && anchor.integrity !== legacyHash && anchor.integrity !== legacyHashOld && baked) {
          tamperDetected = true;
        }
      }
      if (ts) anchorStart = ts;
      if (ls) anchorLastSeen = ls;
    } catch {
      if (baked) tamperDetected = true;
    }
  } else {
    const mac = computeAnchorMac(nowIso, nowIso, fp);
    fs.writeFileSync(
      TRIAL_ANCHOR_PATH,
      JSON.stringify({ trial_started_at: nowIso, last_seen_at: nowIso, v: 2, integrity: mac }),
      'utf-8'
    );
  }

  if (!existingLic) {
    const startMs = new Date(anchorStart).getTime();
    if (baked && (Number.isNaN(startMs) || startMs > nowMs + 3600000)) tamperDetected = true;
    db.prepare(
      `INSERT INTO licenses (trial_started_at, last_seen_at, device_fingerprint, license_type, issued_at, clock_tamper_flagged)
       VALUES (?, ?, ?, 'TRIAL', ?, ?)`
    ).run(anchorStart, anchorLastSeen, fp, anchorStart, tamperDetected ? 1 : 0);
  } else {
    // Reconcile earliest start & latest seen between DB and hidden anchor file
    const dbStart = String(existingLic.trial_started_at || nowIso);
    const dbLast = String(existingLic.last_seen_at || nowIso);
    const dbStartMs = new Date(dbStart).getTime();
    const anchorStartMs = new Date(anchorStart).getTime();
    const dbLastMs = new Date(dbLast).getTime();
    const anchorLastMs = new Date(anchorLastSeen).getTime();

    if (
      baked &&
      (Number.isNaN(dbStartMs) ||
        Number.isNaN(anchorStartMs) ||
        dbStartMs > nowMs + 3600000 ||
        anchorStartMs > nowMs + 3600000 ||
        nowMs + 3600000 < Math.max(dbLastMs || 0, anchorLastMs || 0))
    ) {
      tamperDetected = true;
    }

    const earliestStart =
      !Number.isNaN(dbStartMs) && !Number.isNaN(anchorStartMs)
        ? dbStartMs <= anchorStartMs
          ? dbStart
          : anchorStart
        : anchorStart;
    const latestLast =
      !Number.isNaN(dbLastMs) && !Number.isNaN(anchorLastMs)
        ? dbLastMs >= anchorLastMs
          ? dbLast
          : anchorLastSeen
        : nowIso;

    // On unbaked cloud demo server or clean PLZ->MINA migration, keep device fingerprint current and clear false tamper flag
    const nextClockFlag = !baked ? 0 : migratedLegacyAnchor ? 0 : tamperDetected ? 1 : Number(existingLic.clock_tamper_flagged || 0);
    db.prepare(
      'UPDATE licenses SET trial_started_at = ?, last_seen_at = ?, device_fingerprint = ?, clock_tamper_flagged = ? WHERE id = ?'
    ).run(earliestStart, !baked ? nowIso : latestLast, fp, nextClockFlag, existingLic.id);

    const mac = computeAnchorMac(earliestStart, !baked ? nowIso : latestLast, fp);
    fs.writeFileSync(
      TRIAL_ANCHOR_PATH,
      JSON.stringify({ trial_started_at: earliestStart, last_seen_at: !baked ? nowIso : latestLast, v: 2, integrity: mac }),
      'utf-8'
    );
  }
}
