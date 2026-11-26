import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';

export interface LicensePayload {
  license_id: string;
  customer_name: string;
  customer_phone?: string;
  device_fingerprint: string; // 'MULTI_DEVICE' or specific fingerprint
  license_type: 'TRIAL' | 'MONTHLY' | 'YEARLY' | 'LIFETIME';
  max_devices: number;
  enabled_modules: string[];
  issued_at: string;
  expires_at: string | null;
}

export interface SignedLicenseFile {
  payload: LicensePayload;
  signature: string; // base64 Ed25519 signature of canonical JSON payload
  algorithm: 'Ed25519';
}

export interface OwnerVault {
  publicKeyPem: string;
  privateKeyPem: string;
  createdAt: string;
}

export interface DistributionPolicy {
  strictActivation: boolean;
  updatedAt: string;
}

declare const __MINA_BAKED_CFG__: string | undefined;

export interface BakedClientConfig {
  baked: boolean;
  pubKeyParts: string[];
  pubKeyMask: string;
  pubKeySha256: string;
  strictActivation: boolean;
  integrityRequired: boolean;
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const OWNER_VAULT_DIR = path.resolve(process.cwd(), 'owner_vault');
const LEGACY_VAULT_FILE = path.join(DATA_DIR, 'owner_license_vault.json');
const VAULT_FILE = path.join(OWNER_VAULT_DIR, 'owner_license_vault.json');
const POLICY_FILE = path.join(OWNER_VAULT_DIR, 'distribution_policy.json');
const OWNER_REGISTRY_DB_PATH = path.join(OWNER_VAULT_DIR, 'owner_licenses_registry.db');
const PUBKEY_FILE = path.join(DATA_DIR, 'client_public_key.pem');

let ownerDbInstance: Database.Database | null = null;

export function computePubKeySha256(pem: string): string {
  return crypto.createHash('sha256').update(pem.trim().replace(/\r\n/g, '\n'), 'utf-8').digest('hex');
}

export function getPublicKeyShortId(pem?: string): string {
  try {
    const keyPem = (pem || getClientPublicKeyPem()).trim().replace(/\r\n/g, '\n');
    const hex = crypto.createHash('sha512').update(keyPem, 'utf-8').digest('hex').toUpperCase();
    return `KEY-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
  } catch {
    return 'KEY-UNKNOWN';
  }
}

export function getBakedClientConfig(): BakedClientConfig | null {
  try {
    const raw = typeof __MINA_BAKED_CFG__ !== 'undefined' ? __MINA_BAKED_CFG__ : '';
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BakedClientConfig;
    if (!parsed || !parsed.baked || !Array.isArray(parsed.pubKeyParts) || !parsed.pubKeySha256) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function decodeBakedPublicKey(cfg: BakedClientConfig): string {
  const joinedB64 = cfg.pubKeyParts.join('');
  const buf = Buffer.from(joinedB64, 'base64');
  const mask = Buffer.from(cfg.pubKeyMask, 'hex');
  const out = Buffer.alloc(buf.length);
  for (let i = 0; i < buf.length; i++) {
    out[i] = buf[i] ^ mask[i % mask.length];
  }
  const pem = out.toString('utf-8');
  if (computePubKeySha256(pem) !== cfg.pubKeySha256) {
    throw new Error('PUBKEY_INTEGRITY_MISMATCH');
  }
  return pem;
}

export function encodeBakedPublicKey(pem: string): { pubKeyParts: string[]; pubKeyMask: string; pubKeySha256: string } {
  const cleanPem = pem.trim().replace(/\r\n/g, '\n');
  const raw = Buffer.from(cleanPem, 'utf-8');
  const mask = crypto.randomBytes(32);
  const masked = Buffer.alloc(raw.length);
  for (let i = 0; i < raw.length; i++) {
    masked[i] = raw[i] ^ mask[i % mask.length];
  }
  const b64 = masked.toString('base64');
  const chunkSize = Math.max(8, Math.ceil(b64.length / 5));
  const pubKeyParts: string[] = [];
  for (let i = 0; i < b64.length; i += chunkSize) {
    pubKeyParts.push(b64.slice(i, i + chunkSize));
  }
  return {
    pubKeyParts,
    pubKeyMask: mask.toString('hex'),
    pubKeySha256: computePubKeySha256(cleanPem),
  };
}

export function readDistributionPolicy(): DistributionPolicy {
  ensureOwnerVaultDir();
  if (fs.existsSync(POLICY_FILE)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(POLICY_FILE, 'utf-8')) as Partial<DistributionPolicy>;
      return {
        strictActivation: parsed.strictActivation === true,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    } catch {
      // fallback to default strict
    }
  }
  const def: DistributionPolicy = { strictActivation: false, updatedAt: new Date().toISOString() };
  fs.writeFileSync(POLICY_FILE, JSON.stringify(def, null, 2), 'utf-8');
  return def;
}

export function writeDistributionPolicy(strictActivation: boolean): DistributionPolicy {
  ensureOwnerVaultDir();
  const next: DistributionPolicy = {
    strictActivation: Boolean(strictActivation),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(POLICY_FILE, JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

function ensureClientDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function ensureOwnerVaultDir() {
  if (!fs.existsSync(OWNER_VAULT_DIR)) {
    fs.mkdirSync(OWNER_VAULT_DIR, { recursive: true });
  }
}

export function getOwnerRegistryDb(): Database.Database {
  ensureOwnerVaultDir();
  if (!ownerDbInstance) {
    ownerDbInstance = new Database(OWNER_REGISTRY_DB_PATH);
    ownerDbInstance.pragma('journal_mode = WAL');
    ownerDbInstance.exec(`
      CREATE TABLE IF NOT EXISTS license_manager_records (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_id TEXT NOT NULL UNIQUE,
        customer_name TEXT NOT NULL,
        customer_phone TEXT DEFAULT '',
        device_fingerprint TEXT NOT NULL,
        license_type TEXT NOT NULL,
        max_devices INTEGER NOT NULL DEFAULT 1,
        enabled_modules TEXT NOT NULL DEFAULT '["ALL"]',
        issued_at TEXT NOT NULL,
        expires_at TEXT,
        status TEXT NOT NULL DEFAULT 'ACTIVE',
        activation_code TEXT NOT NULL,
        signed_json TEXT NOT NULL,
        notes TEXT DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
      );

      CREATE TABLE IF NOT EXISTS owner_revocations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        license_id TEXT NOT NULL UNIQUE,
        revoked_at TEXT NOT NULL,
        reason TEXT DEFAULT ''
      );
    `);

    // One-time migration from legacy plaza_business.db if owner registry is empty
    const countRow = ownerDbInstance.prepare('SELECT COUNT(*) as c FROM license_manager_records').get() as { c: number };
    const legacyDbPath = path.join(DATA_DIR, 'plaza_business.db');
    if (countRow.c === 0 && fs.existsSync(legacyDbPath)) {
      try {
        const clientDb = new Database(legacyDbPath, { readonly: true });
        const hasTable = clientDb
          .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='license_manager_records'")
          .get();
        if (hasTable) {
          const oldRows = clientDb.prepare('SELECT * FROM license_manager_records').all() as Array<Record<string, unknown>>;
          const ins = ownerDbInstance.prepare(
            `INSERT OR IGNORE INTO license_manager_records
              (license_id, customer_name, customer_phone, device_fingerprint, license_type, max_devices, enabled_modules, issued_at, expires_at, status, activation_code, signed_json, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          );
          for (const r of oldRows) {
            ins.run(
              r.license_id,
              r.customer_name,
              r.customer_phone || '',
              r.device_fingerprint,
              r.license_type,
              r.max_devices || 1,
              r.enabled_modules || '["ALL"]',
              r.issued_at,
              r.expires_at,
              r.status || 'ACTIVE',
              r.activation_code,
              r.signed_json,
              r.notes || '',
              r.created_at || new Date().toISOString()
            );
          }
        }
        clientDb.close();
      } catch {
        // ignore if legacy DB not initialized yet
      }
    }
  }
  return ownerDbInstance;
}

export function getDeviceFingerprint(): string {
  const raw = `${os.hostname()}|${os.platform()}|${os.arch()}|${os.cpus()[0]?.model || 'CPU'}`;
  const hash = crypto.createHash('sha256').update(raw).digest('hex').toUpperCase();
  return `MINA-${hash.slice(0, 4)}-${hash.slice(4, 8)}-${hash.slice(8, 12)}-${hash.slice(12, 16)}`;
}

export function getOrCreateOwnerVault(): OwnerVault {
  ensureClientDataDir();
  ensureOwnerVaultDir();

  // Migrate legacy private vault out of client data/ directory into isolated owner_vault/
  if (!fs.existsSync(VAULT_FILE) && fs.existsSync(LEGACY_VAULT_FILE)) {
    const legacy = JSON.parse(fs.readFileSync(LEGACY_VAULT_FILE, 'utf-8')) as OwnerVault;
    fs.writeFileSync(VAULT_FILE, JSON.stringify(legacy, null, 2), 'utf-8');
    fs.writeFileSync(PUBKEY_FILE, legacy.publicKeyPem, 'utf-8');
    try {
      fs.unlinkSync(LEGACY_VAULT_FILE);
    } catch {
      // ignore
    }
    return legacy;
  }

  if (fs.existsSync(VAULT_FILE)) {
    const data = JSON.parse(fs.readFileSync(VAULT_FILE, 'utf-8')) as OwnerVault;
    if (!fs.existsSync(PUBKEY_FILE)) {
      fs.writeFileSync(PUBKEY_FILE, data.publicKeyPem, 'utf-8');
    }
    if (fs.existsSync(LEGACY_VAULT_FILE)) {
      try {
        fs.unlinkSync(LEGACY_VAULT_FILE);
      } catch {
        // ignore
      }
    }
    return data;
  }

  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const vault: OwnerVault = {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(VAULT_FILE, JSON.stringify(vault, null, 2), 'utf-8');
  fs.writeFileSync(PUBKEY_FILE, publicKey, 'utf-8');
  return vault;
}

export function regenerateOwnerKeyPair(): OwnerVault {
  ensureClientDataDir();
  ensureOwnerVaultDir();
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  const vault: OwnerVault = {
    publicKeyPem: publicKey,
    privateKeyPem: privateKey,
    createdAt: new Date().toISOString(),
  };
  fs.writeFileSync(VAULT_FILE, JSON.stringify(vault, null, 2), 'utf-8');
  fs.writeFileSync(PUBKEY_FILE, publicKey, 'utf-8');
  return vault;
}

export function getClientPublicKeyPem(): string {
  const baked = getBakedClientConfig();
  if (baked) {
    return decodeBakedPublicKey(baked);
  }
  ensureClientDataDir();
  if (!fs.existsSync(PUBKEY_FILE)) {
    const vault = getOrCreateOwnerVault();
    return vault.publicKeyPem;
  }
  return fs.readFileSync(PUBKEY_FILE, 'utf-8');
}

export function canonicalPayloadString(payload: LicensePayload): string {
  return JSON.stringify({
    license_id: payload.license_id,
    customer_name: payload.customer_name,
    customer_phone: payload.customer_phone || '',
    device_fingerprint: payload.device_fingerprint,
    license_type: payload.license_type,
    max_devices: payload.max_devices,
    enabled_modules: [...payload.enabled_modules].sort(),
    issued_at: payload.issued_at,
    expires_at: payload.expires_at,
  });
}

export function signLicensePayload(payload: LicensePayload, privateKeyPem?: string): SignedLicenseFile {
  const privKey = privateKeyPem || getOrCreateOwnerVault().privateKeyPem;
  const canonical = canonicalPayloadString(payload);
  const sig = crypto.sign(null, Buffer.from(canonical, 'utf-8'), privKey);
  return {
    payload,
    signature: sig.toString('base64'),
    algorithm: 'Ed25519',
  };
}

export function encodeActivationCode(signed: SignedLicenseFile): string {
  const json = JSON.stringify(signed);
  return 'MINA1-' + Buffer.from(json, 'utf-8').toString('base64url');
}

export function decodeActivationCode(codeOrJson: string): SignedLicenseFile {
  let cleaned = codeOrJson.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '').trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned.startsWith('MINA1-')) {
    const b64 = cleaned.slice(6).replace(/\s+/g, '');
    const json = Buffer.from(b64, 'base64url').toString('utf-8');
    return JSON.parse(json) as SignedLicenseFile;
  }
  if (cleaned.startsWith('PLZ1-')) {
    const b64 = cleaned.slice(5).replace(/\s+/g, '');
    const json = Buffer.from(b64, 'base64url').toString('utf-8');
    return JSON.parse(json) as SignedLicenseFile;
  }
  return JSON.parse(cleaned) as SignedLicenseFile;
}

export function verifySignedLicense(
  signed: SignedLicenseFile,
  currentFingerprint: string,
  revokedIds: string[] = []
): { valid: boolean; reason?: string } {
  try {
    if (!signed || !signed.payload || !signed.signature) {
      return { valid: false, reason: 'بنية ملف الترخيص غير صالحة' };
    }

    const publicKeyPem = getClientPublicKeyPem();
    const canonical = canonicalPayloadString(signed.payload);
    const cleanSig = String(signed.signature).replace(/\s+/g, '');
    const ok = crypto.verify(
      null,
      Buffer.from(canonical, 'utf-8'),
      publicKeyPem,
      Buffer.from(cleanSig, 'base64')
    );

    if (!ok) {
      return { valid: false, reason: 'التوقيع الرقمي غير صحيح أو تم التعديل على ملف الترخيص' };
    }

    if (revokedIds.includes(signed.payload.license_id)) {
      return { valid: false, reason: 'تم إيقاف أو إلغاء هذا الترخيص في قائمة الإبطال' };
    }

    if (
      signed.payload.device_fingerprint !== 'MULTI_DEVICE' &&
      signed.payload.device_fingerprint !== currentFingerprint
    ) {
      return {
        valid: false,
        reason: `الترخيص مقيد بجهاز آخر (${signed.payload.device_fingerprint}) ولا يطابق بصمة هذا الجهاز`,
      };
    }

    if (signed.payload.expires_at) {
      const exp = new Date(signed.payload.expires_at).getTime();
      if (Date.now() > exp) {
        return { valid: false, reason: 'انتهت صلاحية الترخيص في ' + signed.payload.expires_at.slice(0, 10) };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'تعذر التحقق من صحة الترخيص الرقمي' };
  }
}
