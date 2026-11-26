import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type express from 'express';
import type Database from 'better-sqlite3';
import { getDb, updateTrialAnchorLastSeen } from './db.ts';
import {
  computePubKeySha256,
  getBakedClientConfig,
  getClientPublicKeyPem,
  getDeviceFingerprint,
  getPublicKeyShortId,
  verifySignedLicense,
} from './licenseCrypto.ts';

export interface IntegrityManifestPayload {
  version: number;
  strictActivation: boolean;
  pubKeySha256: string;
  files: Record<string, string>;
  issuedAt: string;
}

export interface SignedIntegrityManifest {
  payload: IntegrityManifestPayload;
  signature: string;
  algorithm: 'Ed25519';
}

const RUNTIME_BOOT_NONCE = crypto.randomBytes(32);

let lastIntegrityCheckAt = 0;
let lastIntegrityResult: { ok: boolean; reason?: string } = { ok: true };

export function verifyRuntimeIntegrity(force = false): { ok: boolean; reason?: string } {
  const baked = getBakedClientConfig();
  if (!baked || !baked.integrityRequired) {
    return { ok: true };
  }

  const now = Date.now();
  if (!force && lastIntegrityCheckAt > 0 && now - lastIntegrityCheckAt < 15_000) {
    return lastIntegrityResult;
  }

  try {
    const pubKeyPem = getClientPublicKeyPem();
    if (computePubKeySha256(pubKeyPem) !== baked.pubKeySha256) {
      lastIntegrityResult = { ok: false, reason: 'تم تعديل المفتاح العام للترخيص داخل ملفات التشغيل' };
      lastIntegrityCheckAt = now;
      return lastIntegrityResult;
    }

    const rootDir = process.cwd();
    const manifestPath = path.join(rootDir, 'runtime', 'app.integrity.json');
    if (!fs.existsSync(manifestPath)) {
      lastIntegrityResult = { ok: false, reason: 'ملف شهادة التكامل الرقمية مفقود (app.integrity.json)' };
      lastIntegrityCheckAt = now;
      return lastIntegrityResult;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as SignedIntegrityManifest;
    if (!manifest?.payload || !manifest?.signature) {
      lastIntegrityResult = { ok: false, reason: 'شهادة التكامل الرقمية تالفة' };
      lastIntegrityCheckAt = now;
      return lastIntegrityResult;
    }

    const sortedFiles: Record<string, string> = {};
    for (const k of Object.keys(manifest.payload.files || {}).sort()) {
      sortedFiles[k] = manifest.payload.files[k];
    }
    const canonical = JSON.stringify({
      version: manifest.payload.version,
      strictActivation: Boolean(manifest.payload.strictActivation),
      pubKeySha256: manifest.payload.pubKeySha256,
      files: sortedFiles,
      issuedAt: manifest.payload.issuedAt,
    });

    const sigOk = crypto.verify(
      null,
      Buffer.from(canonical, 'utf-8'),
      pubKeyPem,
      Buffer.from(manifest.signature, 'base64')
    );

    if (!sigOk) {
      lastIntegrityResult = { ok: false, reason: 'توقيع حماية الكود البرمجي غير صحيح — تم التلاعب في الملفات' };
      lastIntegrityCheckAt = now;
      return lastIntegrityResult;
    }

    if (
      manifest.payload.pubKeySha256 !== baked.pubKeySha256 ||
      Boolean(manifest.payload.strictActivation) !== Boolean(baked.strictActivation)
    ) {
      lastIntegrityResult = { ok: false, reason: 'عدم تطابق سياسة التفعيل مع شهادة التكامل الموقعة' };
      lastIntegrityCheckAt = now;
      return lastIntegrityResult;
    }

    for (const [relPath, expectedSha] of Object.entries(sortedFiles)) {
      const absPath = path.resolve(rootDir, relPath);
      if (!fs.existsSync(absPath)) {
        lastIntegrityResult = { ok: false, reason: `ملف نظامي مفقود بعد التلاعب: ${relPath}` };
        lastIntegrityCheckAt = now;
        return lastIntegrityResult;
      }
      const actualSha = crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
      if (actualSha !== expectedSha) {
        lastIntegrityResult = { ok: false, reason: `تم اكتشاف تعديل غير مصرح به في الملف: ${relPath}` };
        lastIntegrityCheckAt = now;
        return lastIntegrityResult;
      }
    }

    lastIntegrityResult = { ok: true };
    lastIntegrityCheckAt = now;
    return lastIntegrityResult;
  } catch {
    lastIntegrityResult = { ok: false, reason: 'فشل التحقق من سلامة الكود البرمجي' };
    lastIntegrityCheckAt = now;
    return lastIntegrityResult;
  }
}

export function evaluateLicenseState(db: Database.Database) {
  const integrity = verifyRuntimeIntegrity();
  const fp = getDeviceFingerprint();
  const keyId = getPublicKeyShortId();
  const baked = getBakedClientConfig();
  const strictActivation = baked ? Boolean(baked.strictActivation) : false;

  const lic = db.prepare('SELECT * FROM licenses LIMIT 1').get() as Record<string, unknown>;
  const revocations = db.prepare('SELECT license_id FROM license_revocations').all() as Array<{ license_id: string }>;
  const revokedIds = revocations.map((r) => r.license_id);

  const now = new Date();
  const nowMs = now.getTime();
  const lastSeenMs = new Date(String(lic.last_seen_at)).getTime();
  let clockTamper = baked ? Number(lic.clock_tamper_flagged) === 1 : false;

  if (baked) {
    if (!Number.isNaN(lastSeenMs) && nowMs + 3600000 < lastSeenMs) {
      clockTamper = true;
      db.prepare('UPDATE licenses SET clock_tamper_flagged = 1 WHERE id = ?').run(lic.id);
    } else if (nowMs > lastSeenMs) {
      const nowIso = now.toISOString();
      db.prepare('UPDATE licenses SET last_seen_at = ? WHERE id = ?').run(nowIso, lic.id);
      updateTrialAnchorLastSeen(nowIso, fp);
    }
  } else {
    const nowIso = now.toISOString();
    if (Number(lic.clock_tamper_flagged) === 1) {
      db.prepare('UPDATE licenses SET clock_tamper_flagged = 0, last_seen_at = ? WHERE id = ?').run(nowIso, lic.id);
    }
  }

  if (!integrity.ok) {
    return {
      status: 'INVALID_OR_EXPIRED' as const,
      is_operational: false,
      tamper_detected: true,
      license_id: String(lic.license_id || 'TAMPERED'),
      customer_name: String(lic.customer_name || ''),
      license_type: String(lic.license_type || 'TRIAL'),
      device_fingerprint: fp,
      bound_fingerprint: fp,
      max_devices: 1,
      issued_at: String(lic.issued_at || ''),
      expires_at: String(lic.expires_at || ''),
      days_left: 0,
      warning_level: 'EXPIRED',
      clock_tamper: true,
      strict_activation: strictActivation,
      key_id: keyId,
      message: integrity.reason || 'تم رصد تلاعب في ملفات البرنامج — تم إيقاف التشغيل.',
    };
  }

  if (Number(lic.is_activated) === 1 && lic.raw_license_json) {
    try {
      const signed = JSON.parse(String(lic.raw_license_json));
      const check = verifySignedLicense(signed, fp, revokedIds);
      if (check.valid) {
        const exp = signed.payload.expires_at ? new Date(signed.payload.expires_at).getTime() : null;
        const daysLeft = exp ? Math.max(0, Math.ceil((exp - nowMs) / 86400000)) : null;
        return {
          status: 'ACTIVATED' as const,
          is_operational: true,
          tamper_detected: false,
          license_id: signed.payload.license_id,
          customer_name: signed.payload.customer_name,
          license_type: signed.payload.license_type,
          device_fingerprint: fp,
          bound_fingerprint: signed.payload.device_fingerprint,
          max_devices: signed.payload.max_devices,
          issued_at: signed.payload.issued_at,
          expires_at: signed.payload.expires_at,
          days_left: daysLeft,
          warning_level: daysLeft !== null && daysLeft <= 7 ? (daysLeft <= 1 ? 'CRITICAL' : 'WARN') : 'NONE',
          clock_tamper: clockTamper,
          strict_activation: strictActivation,
          key_id: keyId,
          message: 'الترخيص مفعل وساري المفعول',
        };
      }
      return {
        status: 'INVALID_OR_EXPIRED' as const,
        is_operational: false,
        tamper_detected: false,
        license_id: signed.payload?.license_id || '',
        customer_name: signed.payload?.customer_name || '',
        license_type: signed.payload?.license_type || 'TRIAL',
        device_fingerprint: fp,
        bound_fingerprint: signed.payload?.device_fingerprint || fp,
        max_devices: signed.payload?.max_devices || 1,
        issued_at: signed.payload?.issued_at || '',
        expires_at: signed.payload?.expires_at || '',
        days_left: 0,
        warning_level: 'EXPIRED',
        clock_tamper: clockTamper,
        strict_activation: strictActivation,
        key_id: keyId,
        message: check.reason || 'الترخيص غير صالح',
      };
    } catch {
      // fall through
    }
  }

  // Strict Activation Policy: disallow running without a real Ed25519 license
  if (strictActivation) {
    return {
      status: 'INVALID_OR_EXPIRED' as const,
      is_operational: false,
      tamper_detected: false,
      license_id: 'ACTIVATION-REQUIRED',
      customer_name: 'نسخة غير مفعلة',
      license_type: 'TRIAL',
      device_fingerprint: fp,
      bound_fingerprint: fp,
      max_devices: 1,
      issued_at: String(lic.trial_started_at || ''),
      expires_at: '',
      days_left: 0,
      warning_level: 'EXPIRED',
      clock_tamper: clockTamper,
      strict_activation: true,
      key_id: keyId,
      message: 'هذه النسخة مؤمّنة ضد التشغيل بدون تفعيل. يرجى إدخال كود التفعيل أو ملف الترخيص الموقع للمتابعة.',
    };
  }

  // On the unbaked cloud live demo server, never expire or lock out the online showcase trial
  if (!baked) {
    return {
      status: 'TRIAL' as const,
      is_operational: true,
      tamper_detected: false,
      license_id: 'LIVE-DEMO',
      customer_name: 'نسخة تجربة مباشرة',
      license_type: 'TRIAL',
      device_fingerprint: fp,
      bound_fingerprint: fp,
      max_devices: 1,
      issued_at: String(lic.trial_started_at || now.toISOString()),
      expires_at: new Date(nowMs + 30 * 86400000).toISOString(),
      days_left: 30,
      warning_level: 'NONE',
      clock_tamper: false,
      strict_activation: false,
      key_id: keyId,
      message: 'نسخة التجربة المباشرة تعمل بكامل المزايا — لطلب نسخة كاملة مفعلة تواصل معنا على 01153672084',
    };
  }

  const trialStartMs = new Date(String(lic.trial_started_at)).getTime();
  if (Number.isNaN(trialStartMs) || trialStartMs > nowMs + 3600000) {
    clockTamper = true;
    db.prepare('UPDATE licenses SET clock_tamper_flagged = 1 WHERE id = ?').run(lic.id);
  }

  const trialDaysTotal = 30;
  const elapsedDays = clockTamper ? trialDaysTotal : Math.max(0, Math.floor((nowMs - trialStartMs) / 86400000));
  const daysLeft = clockTamper ? 0 : Math.max(0, trialDaysTotal - elapsedDays);
  const trialExpiresAt = new Date(trialStartMs + trialDaysTotal * 86400000).toISOString();
  const isOperational = !clockTamper && daysLeft > 0;

  let warningLevel = 'NONE';
  if (daysLeft === 0) warningLevel = 'EXPIRED';
  else if (daysLeft <= 1) warningLevel = 'DAY_1';
  else if (daysLeft <= 3) warningLevel = 'DAY_3';
  else if (daysLeft <= 7) warningLevel = 'DAY_7';

  return {
    status: isOperational ? ('TRIAL' as const) : ('TRIAL_EXPIRED' as const),
    is_operational: isOperational,
    tamper_detected: clockTamper,
    license_id: 'TRIAL-30D',
    customer_name: 'نسخة تجريبية مجانية',
    license_type: 'TRIAL',
    device_fingerprint: fp,
    bound_fingerprint: fp,
    max_devices: 1,
    issued_at: String(lic.trial_started_at),
    expires_at: trialExpiresAt,
    days_left: daysLeft,
    warning_level: warningLevel,
    clock_tamper: clockTamper,
    strict_activation: false,
    key_id: keyId,
    message: clockTamper
      ? 'تم رصد تلاعب في ساعة النظام أو ملف الحماية — تم إيقاف الفترة التجريبية. يرجى التفعيل برخصة رسمية.'
      : isOperational
      ? `فترة تجريبية مجانية — متبقي ${daysLeft} يوم`
      : 'انتهت الفترة التجريبية المجانية (30 يومًا). يرجى تفعيل البرنامج للمتابعة.',
  };
}

export function computeLicenseWitness(db: Database.Database, channel: string): string | null {
  const state = evaluateLicenseState(db);
  if (!state.is_operational) return null;
  const seal = crypto
    .createHmac('sha256', RUNTIME_BOOT_NONCE)
    .update(`${state.license_id}|${state.device_fingerprint}|${channel}|${state.status}`)
    .digest('hex');
  return seal;
}

export function assertTxLicenseWitness(db: Database.Database, channel: string): string {
  const witness = computeLicenseWitness(db, channel);
  if (!witness) {
    throw new Error('تم إيقاف التشغيل: البرنامج غير مفعل أو تم رصد تعديل غير مصرح به في الحماية');
  }
  return witness;
}

export function requireOperationalWitness(req: express.Request, res: express.Response, next: express.NextFunction) {
  const db = getDb();
  const state = evaluateLicenseState(db);
  const witness = state.is_operational ? computeLicenseWitness(db, req.path || 'api') : null;
  if (!state.is_operational || !witness) {
    res.status(403).json({
      error: state.message || 'تم إيقاف العمليات التشغيلية لانتهاء فترة التجربة أو عدم التفعيل.',
      license_expired: true,
      tamper_detected: Boolean((state as { tamper_detected?: boolean }).tamper_detected),
    });
    return;
  }
  next();
}
