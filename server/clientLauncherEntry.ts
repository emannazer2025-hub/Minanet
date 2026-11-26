import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import path from 'path';

declare const __MINA_BAKED_CFG__: string | undefined;

interface BakedCfg {
  baked: boolean;
  pubKeyParts: string[];
  pubKeyMask: string;
  pubKeySha256: string;
  strictActivation: boolean;
}

function failLock(reason: string) {
  console.error(`[MINA NET SECURITY LOCK] ${reason}`);
  const PORT = Number(process.env.PORT || 3000);
  const srv = http.createServer((_req, res) => {
    res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>Mina Net — إيقاف أمان</title></head>
      <body style="font-family:Tahoma,sans-serif;background:#1b2b4b;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:24px;">
        <div style="background:#ece9d8;color:#111;border:2px solid #991b1b;max-width:520px;padding:24px;">
          <h2 style="color:#991b1b;margin-top:0;">تم إيقاف تشغيل برنامج Mina Net لحماية الترخيص</h2>
          <p style="font-weight:bold;">${reason}</p>
          <p style="font-size:13px;color:#334155;">يرجى عدم تعديل ملفات التشغيل، وللدعم الفني تواصل مع المبرمج: اسامه جرجس (01153672084).</p>
        </div>
      </body></html>`);
  });
  srv.listen(PORT, '0.0.0.0');
}

function resolveAppRoot(): string {
  try {
    if (typeof __dirname === 'string' && fs.existsSync(path.join(__dirname, 'app.integrity.json'))) {
      const parent = path.resolve(__dirname, '..');
      if (process.cwd() !== parent) {
        process.chdir(parent);
      }
      return parent;
    }
  } catch {
    // ignore chdir errors
  }
  return process.cwd();
}

function verifyAndLaunch() {
  const rootDir = resolveAppRoot();
  const rawCfg = typeof __MINA_BAKED_CFG__ !== 'undefined' ? __MINA_BAKED_CFG__ : '';
  if (!rawCfg) return failLock('تكوين الحماية غير موجود في ملف التشغيل.');

  let baked: BakedCfg;
  let pubPem = '';
  try {
    baked = JSON.parse(rawCfg) as BakedCfg;
    const buf = Buffer.from(baked.pubKeyParts.join(''), 'base64');
    const mask = Buffer.from(baked.pubKeyMask, 'hex');
    const out = Buffer.alloc(buf.length);
    for (let i = 0; i < buf.length; i++) out[i] = buf[i] ^ mask[i % mask.length];
    pubPem = out.toString('utf-8');
    const sha = crypto.createHash('sha256').update(pubPem.trim().replace(/\r\n/g, '\n'), 'utf-8').digest('hex');
    if (sha !== baked.pubKeySha256) return failLock('تم تعديل بصمة المفتاح العام.');
  } catch {
    return failLock('فشل التحقق من المفتاح العام المشفر.');
  }

  const manifestPath = path.join(rootDir, 'runtime', 'app.integrity.json');
  if (!fs.existsSync(manifestPath)) {
    return failLock('ملف شهادة التكامل الرقمية مفقود (runtime/app.integrity.json).');
  }

  try {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      payload: {
        version: number;
        strictActivation: boolean;
        pubKeySha256: string;
        files: Record<string, string>;
        issuedAt: string;
      };
      signature: string;
    };

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
      pubPem,
      Buffer.from(manifest.signature, 'base64')
    );

    if (!sigOk) return failLock('توقيع حماية البرنامج غير صالح — تم التلاعب بالملفات.');
    if (
      manifest.payload.pubKeySha256 !== baked.pubKeySha256 ||
      Boolean(manifest.payload.strictActivation) !== Boolean(baked.strictActivation)
    ) {
      return failLock('سياسة الحماية غير مطابقة للشهادة الموقعة.');
    }

    for (const [relPath, expectedSha] of Object.entries(sortedFiles)) {
      const absPath = path.resolve(rootDir, relPath);
      if (!fs.existsSync(absPath)) return failLock(`ملف مفقود: ${relPath}`);
      const actualSha = crypto.createHash('sha256').update(fs.readFileSync(absPath)).digest('hex');
      if (actualSha !== expectedSha) return failLock(`تم اكتشاف تعديل غير مصرح به في الملف: ${relPath}`);
    }
  } catch {
    return failLock('تعذر قراءة أو التحقق من شهادة التكامل الرقمية.');
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require('./core.cjs');
}

verifyAndLaunch();
