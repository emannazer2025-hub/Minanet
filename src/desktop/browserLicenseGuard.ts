import type express from 'express';
import { getDb, isBrowserTrialTampered, updateBrowserTrialAnchor } from './browserDb.ts';
import {
  getDeviceFingerprint,
  getPublicKeyShortId,
  isEmbeddedKeyValid,
  isStrictActivationRequired,
  verifySignedLicense,
} from './browserLicenseCrypto.ts';

export function verifyRuntimeIntegrity(): { ok: boolean; reason?: string } {
  if (!isEmbeddedKeyValid()) {
    return { ok: false, reason: 'تم التلاعب بالمفتاح العام للتحقق داخل حزمة البرنامج' };
  }
  return { ok: true };
}

export function evaluateLicenseState(db: ReturnType<typeof getDb>) {
  const integrity = verifyRuntimeIntegrity();
  const fp = getDeviceFingerprint();
  const keyId = getPublicKeyShortId();
  const strictActivation = isStrictActivationRequired();
  const lic = db.prepare('SELECT * FROM licenses LIMIT 1').get() as Record<string, unknown>;
  const revocations = db.prepare('SELECT license_id FROM license_revocations').all() as Array<{ license_id: string }>;
  const revokedIds = revocations.map((r) => r.license_id);

  const now = new Date();
  const nowMs = now.getTime();
  const lastSeenMs = new Date(String(lic.last_seen_at)).getTime();
  let clockTamper = Number(lic.clock_tamper_flagged) === 1 || isBrowserTrialTampered();

  if (!Number.isNaN(lastSeenMs) && nowMs + 3600000 < lastSeenMs) {
    clockTamper = true;
    db.prepare('UPDATE licenses SET clock_tamper_flagged = 1 WHERE id = ?').run(lic.id);
  } else if (nowMs > lastSeenMs) {
    const nowIso = now.toISOString();
    db.prepare('UPDATE licenses SET last_seen_at = ? WHERE id = ?').run(nowIso, lic.id);
    updateBrowserTrialAnchor(nowIso, fp);
  }

  if (!integrity.ok) {
    return {
      status: 'INVALID_OR_EXPIRED' as const,
      is_operational: false,
      tamper_detected: true,
      license_id: 'TAMPERED',
      customer_name: '',
      license_type: 'TRIAL',
      device_fingerprint: fp,
      bound_fingerprint: fp,
      max_devices: 1,
      issued_at: '',
      expires_at: '',
      days_left: 0,
      warning_level: 'EXPIRED',
      clock_tamper: true,
      strict_activation: strictActivation,
      key_id: keyId,
      message: integrity.reason || 'تم رصد تلاعب في ملف الحماية.',
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
      ? 'تم رصد تلاعب في ساعة النظام أو ملف الحماية — تم إيقاف الفترة التجريبية.'
      : isOperational
      ? `فترة تجريبية مجانية — متبقي ${daysLeft} يوم`
      : 'انتهت الفترة التجريبية المجانية (30 يومًا). يرجى تفعيل البرنامج للمتابعة.',
  };
}

export function assertTxLicenseWitness(db: ReturnType<typeof getDb>, channel: string): string {
  const state = evaluateLicenseState(db);
  if (!state.is_operational) {
    throw new Error('تم إيقاف التشغيل: البرنامج غير مفعل أو تم رصد تعديل غير مصرح به');
  }
  return `${state.license_id}:${channel}:${state.device_fingerprint}`;
}

export function requireOperationalWitness(req: express.Request, res: express.Response, next: express.NextFunction) {
  const db = getDb();
  const state = evaluateLicenseState(db);
  if (!state.is_operational) {
    res.status(403).json({
      error: state.message || 'تم إيقاف العمليات التشغيلية لعدم التفعيل أو انتهاء فترة التجربة.',
      license_expired: true,
      tamper_detected: Boolean((state as { tamper_detected?: boolean }).tamper_detected),
    });
    return;
  }
  void req;
  next();
}
