import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import http from 'http';
import https from 'https';
import path from 'path';
import { getBakedClientConfig, getClientPublicKeyPem } from './licenseCrypto.ts';

export const DEFAULT_PUBLIC_UPDATE_URL =
  'https://ais-pre-li3xayi7s4u2zgsr4pym46-33756488626.europe-west2.run.app';

export interface UpdateConfig {
  updateServerUrl: string;
  updatedAt: string;
}

export interface UpdateState {
  version: string;
  buildId: string;
  releasedAt: string;
  updatedAt: string;
  notes: string;
  filesDigest?: string;
}

export interface UpdateReleaseManifest {
  version: string;
  buildId: string;
  releasedAt: string;
  notes: string;
  serverUrl: string;
  packageUrl: string;
  directHtmlUrl: string;
  setupExeUrl: string;
  sha256: string;
  packageSizeBytes: number;
  integrityIssuedAt: string;
  filesDigest?: string;
}

const BLOCKED_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '0.0.0.0', '169.254.169.254']);

function isPrivateOrDisallowedIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const a = Number(m[1]);
  const b = Number(m[2]);
  // Loopback, unspecified, link-local / cloud metadata 169.254.0.0/16
  if (a === 127 || a === 0) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

export function normalizeUpdateServerUrl(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) {
    throw new Error('يرجى إدخال رابط سيرفر التحديثات');
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    throw new Error('رابط سيرفر التحديثات غير صالح');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('يجب أن يبدأ رابط سيرفر التحديثات بـ https:// أو http://');
  }
  if (parsed.username || parsed.password) {
    throw new Error('لا يُسمح بتضمين بيانات دخول في رابط التحديث');
  }
  const hostname = parsed.hostname.toLowerCase();
  if (!hostname || BLOCKED_HOSTS.has(hostname) || isPrivateOrDisallowedIpv4(hostname)) {
    throw new Error('لا يمكن استخدام عنوان محلي أو داخلي محظور كسيرفر تحديثات');
  }
  const cleanOrigin = `${parsed.protocol}//${parsed.host}`;
  const cleanPath = parsed.pathname.replace(/\/+$/, '');
  return cleanPath && cleanPath !== '/' ? `${cleanOrigin}${cleanPath}` : cleanOrigin;
}

function mapAiStudioHostToPublic(urlStr: string): string {
  try {
    const u = new URL(urlStr);
    if (u.hostname.startsWith('ais-dev-') && u.hostname.endsWith('.run.app')) {
      u.hostname = 'ais-pre-' + u.hostname.slice('ais-dev-'.length);
    }
    const cleanPath = u.pathname.replace(/\/+$/, '');
    return cleanPath && cleanPath !== '/' ? `${u.origin}${cleanPath}` : u.origin;
  } catch {
    return DEFAULT_PUBLIC_UPDATE_URL;
  }
}

export function resolvePublicUpdateOrigin(req?: {
  headers?: Record<string, string | string[] | undefined>;
  protocol?: string;
}): string {
  const envPublic = (process.env.PUBLIC_UPDATE_URL || '').trim();
  if (envPublic) {
    return mapAiStudioHostToPublic(envPublic);
  }

  const forwardedHost = req?.headers?.['x-forwarded-host'];
  const rawHost = Array.isArray(forwardedHost) ? forwardedHost[0] : forwardedHost || req?.headers?.host;
  const hostStr = String(rawHost || '').split(',')[0].trim();
  if (hostStr) {
    const bareHost = hostStr.split(':')[0].toLowerCase();
    if (bareHost && !BLOCKED_HOSTS.has(bareHost) && !isPrivateOrDisallowedIpv4(bareHost)) {
      const xfProto = req?.headers?.['x-forwarded-proto'];
      const proto = String(Array.isArray(xfProto) ? xfProto[0] : xfProto || req?.protocol || 'https')
        .split(',')[0]
        .trim();
      const scheme = proto === 'http' ? 'http' : 'https';
      return mapAiStudioHostToPublic(`${scheme}://${hostStr}`);
    }
  }

  const envApp = (process.env.APP_URL || '').trim();
  if (envApp && envApp !== 'MY_APP_URL') {
    return mapAiStudioHostToPublic(envApp);
  }

  return DEFAULT_PUBLIC_UPDATE_URL;
}

export function computeFilesDigest(files: Record<string, string>): string {
  const sorted: Record<string, string> = {};
  for (const k of Object.keys(files || {}).sort()) {
    sorted[k] = files[k];
  }
  return crypto.createHash('sha256').update(JSON.stringify(sorted), 'utf-8').digest('hex');
}

export function computeBuildId(version: string, filesDigest: string, releaseSeq = 0): string {
  return crypto
    .createHash('sha256')
    .update(`${version}|${filesDigest}|${releaseSeq}`, 'utf-8')
    .digest('hex')
    .slice(0, 16)
    .toUpperCase();
}

export function readLocalUpdateConfig(rootDir = process.cwd()): UpdateConfig {
  const cfgPath = path.join(rootDir, 'runtime', 'update-config.json');
  if (fs.existsSync(cfgPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(cfgPath, 'utf-8')) as Partial<UpdateConfig>;
      if (parsed.updateServerUrl) {
        return {
          updateServerUrl: normalizeUpdateServerUrl(parsed.updateServerUrl),
          updatedAt: String(parsed.updatedAt || ''),
        };
      }
    } catch {
      // fall back to default
    }
  }
  return {
    updateServerUrl: DEFAULT_PUBLIC_UPDATE_URL,
    updatedAt: '',
  };
}

export function writeLocalUpdateConfig(serverUrl: string, rootDir = process.cwd()): UpdateConfig {
  const cleanUrl = normalizeUpdateServerUrl(serverUrl);
  const runtimeDir = path.join(rootDir, 'runtime');
  if (!fs.existsSync(runtimeDir)) {
    fs.mkdirSync(runtimeDir, { recursive: true });
  }
  const next: UpdateConfig = {
    updateServerUrl: cleanUrl,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(runtimeDir, 'update-config.json'), JSON.stringify(next, null, 2), 'utf-8');
  return next;
}

export function readLocalUpdateState(rootDir = process.cwd()): UpdateState {
  const statePath = path.join(rootDir, 'runtime', 'update-state.json');
  if (fs.existsSync(statePath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Partial<UpdateState>;
      if (parsed.version && parsed.buildId) {
        return {
          version: String(parsed.version),
          buildId: String(parsed.buildId),
          releasedAt: String(parsed.releasedAt || ''),
          updatedAt: String(parsed.updatedAt || ''),
          notes: String(parsed.notes || ''),
          filesDigest: parsed.filesDigest ? String(parsed.filesDigest) : undefined,
        };
      }
    } catch {
      // fallback below
    }
  }

  let filesDigest = '';
  const integrityPath = path.join(rootDir, 'runtime', 'app.integrity.json');
  if (fs.existsSync(integrityPath)) {
    try {
      const manifest = JSON.parse(fs.readFileSync(integrityPath, 'utf-8')) as {
        payload?: { files?: Record<string, string>; issuedAt?: string };
      };
      if (manifest?.payload?.files) {
        filesDigest = computeFilesDigest(manifest.payload.files);
      }
    } catch {
      // ignore
    }
  }

  return {
    version: '1.0.0',
    buildId: filesDigest ? computeBuildId('1.0.0', filesDigest, 1) : 'LOCAL-BASE',
    releasedAt: '',
    updatedAt: '',
    notes: 'الإصدار المثبت حاليًا على الجهاز',
    filesDigest,
  };
}

const MAX_UPDATE_DOWNLOAD_BYTES = 80 * 1024 * 1024;

function httpGetBuffer(rawUrl: string, redirectsLeft = 3, maxBytes = MAX_UPDATE_DOWNLOAD_BYTES): Promise<Buffer> {
  const validatedUrl = normalizeUpdateServerUrl(rawUrl.split('?')[0]) + (rawUrl.includes('?') ? '?' + rawUrl.split('?').slice(1).join('?') : '');
  return new Promise((resolve, reject) => {
    const parsed = new URL(validatedUrl);
    const transport = parsed.protocol === 'https:' ? https : http;
    const req = transport.get(
      parsed,
      {
        timeout: 25_000,
        headers: {
          'User-Agent': 'MinaNetERP-Updater/1.0',
          Accept: 'application/json, application/zip, */*',
        },
      },
      (res) => {
        const status = res.statusCode || 0;
        if (status >= 300 && status < 400 && res.headers.location && redirectsLeft > 0) {
          res.resume();
          const nextUrl = new URL(res.headers.location, parsed).toString();
          resolve(httpGetBuffer(nextUrl, redirectsLeft - 1, maxBytes));
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          reject(new Error(`تعذر الاتصال بسيرفر التحديثات (HTTP ${status})`));
          return;
        }
        const chunks: Buffer[] = [];
        let total = 0;
        res.on('data', (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            req.destroy(new Error('حجم ملف التحديث يتجاوز الحد المسموح'));
            return;
          }
          chunks.push(chunk);
        });
        res.on('end', () => resolve(Buffer.concat(chunks)));
      }
    );
    req.on('timeout', () => {
      req.destroy(new Error('انتهت مهلة الاتصال بسيرفر التحديثات'));
    });
    req.on('error', (err) => {
      reject(new Error(`فشل الاتصال بسيرفر التحديثات: ${err.message}`));
    });
  });
}

export async function fetchRemoteManifest(serverUrl: string): Promise<UpdateReleaseManifest> {
  const base = normalizeUpdateServerUrl(serverUrl);
  const buf = await httpGetBuffer(`${base}/api/updates/manifest`, 3, 512 * 1024);
  const parsed = JSON.parse(buf.toString('utf-8')) as UpdateReleaseManifest;
  if (!parsed || !parsed.version || !parsed.buildId) {
    throw new Error('بيانات بيان التحديث الواردة من السيرفر غير صالحة');
  }
  return parsed;
}

export async function downloadRemoteUpdateZip(packageUrl: string, expectedSha256?: string): Promise<Buffer> {
  const buf = await httpGetBuffer(packageUrl, 3, MAX_UPDATE_DOWNLOAD_BYTES);
  if (expectedSha256) {
    const actualSha = crypto.createHash('sha256').update(buf).digest('hex');
    if (actualSha.toLowerCase() !== expectedSha256.toLowerCase()) {
      throw new Error('فشل التحقق من بصمة حزمة التحديث (SHA-256) بعد التحميل — يرجى إعادة المحاولة');
    }
  }
  return buf;
}

const ALLOWED_DIST_EXTS = new Set([
  '.html',
  '.js',
  '.css',
  '.png',
  '.jpg',
  '.jpeg',
  '.jfif',
  '.webp',
  '.svg',
  '.ico',
  '.webmanifest',
  '.json',
  '.woff',
  '.woff2',
  '.txt',
]);

function isAllowedUpdateRelPath(relPath: string): boolean {
  if (!relPath || relPath.includes('..') || relPath.includes('\0') || relPath.includes(':') || relPath.startsWith('/')) {
    return false;
  }
  if (
    relPath === 'manifest.json' ||
    relPath === 'runtime/core.cjs' ||
    relPath === 'runtime/launcher.cjs' ||
    relPath === 'runtime/app.integrity.json' ||
    relPath === 'MINA_NET_DIRECT.html'
  ) {
    return true;
  }
  if (relPath.startsWith('dist/')) {
    const rest = relPath.slice('dist/'.length);
    if (!rest || rest.startsWith('.') || rest.includes('/.')) return false;
    if (rest.includes('license-manager') || rest.includes('licenseManager')) return false;
    const ext = path.extname(rest).toLowerCase();
    return ALLOWED_DIST_EXTS.has(ext);
  }
  return false;
}

function copyTreeReplace(srcDir: string, dstDir: string): void {
  if (!fs.existsSync(dstDir)) {
    fs.mkdirSync(dstDir, { recursive: true });
  }
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const srcPath = path.join(srcDir, entry.name);
    const dstPath = path.join(dstDir, entry.name);
    if (entry.isDirectory()) {
      copyTreeReplace(srcPath, dstPath);
    } else if (entry.isFile()) {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

export async function verifyAndApplyUpdateZip(
  zipBuffer: Buffer,
  options?: {
    rootDir?: string;
    createBackup?: () => Promise<void> | void;
    enforcePubKeyMatch?: boolean;
  }
): Promise<UpdateState> {
  const rootDir = path.resolve(options?.rootDir || process.cwd());
  const dataDir = path.join(rootDir, 'data');
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const stageDir = path.join(dataDir, `_update_stage_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`);
  fs.mkdirSync(stageDir, { recursive: true });

  try {
    const zip = new AdmZip(zipBuffer);
    const entries = zip.getEntries();
    if (!entries || entries.length === 0) {
      throw new Error('ملف التحديث فارغ ولا يحتوي على بيانات');
    }

    for (const entry of entries) {
      if (entry.isDirectory) continue;
      const normalizedRel = entry.entryName.replace(/\\/g, '/').replace(/^\/+/, '');
      if (!isAllowedUpdateRelPath(normalizedRel)) {
        throw new Error(`يحتوي التحديث على مسار غير مصرح به: ${normalizedRel}`);
      }
      const targetPath = path.resolve(stageDir, normalizedRel);
      if (!targetPath.startsWith(stageDir + path.sep)) {
        throw new Error('محاولة تجاوز مسار التحديث مرفوضة');
      }
      fs.mkdirSync(path.dirname(targetPath), { recursive: true });
      fs.writeFileSync(targetPath, entry.getData());
    }

    const stagedManifestPath = path.join(stageDir, 'manifest.json');
    const stagedIntegrityPath = path.join(stageDir, 'runtime', 'app.integrity.json');
    if (!fs.existsSync(stagedManifestPath) || !fs.existsSync(stagedIntegrityPath)) {
      throw new Error('حزمة التحديث غير مكتملة (تفتقر إلى شهادة التكامل الرقمية أو بيان الإصدار)');
    }

    const updateManifest = JSON.parse(fs.readFileSync(stagedManifestPath, 'utf-8')) as {
      version: string;
      buildId: string;
      releasedAt?: string;
      notes?: string;
      filesDigest?: string;
    };
    if (!updateManifest.version || !updateManifest.buildId) {
      throw new Error('بيانات الإصدار داخل حزمة التحديث غير صالحة');
    }

    const integrityManifest = JSON.parse(fs.readFileSync(stagedIntegrityPath, 'utf-8')) as {
      payload: {
        version: number;
        strictActivation: boolean;
        pubKeySha256: string;
        files: Record<string, string>;
        issuedAt: string;
      };
      signature: string;
      algorithm: string;
    };
    if (!integrityManifest?.payload?.files || !integrityManifest?.signature) {
      throw new Error('شهادة التكامل الرقمية للتحديث تالفة');
    }

    const sortedFiles: Record<string, string> = {};
    for (const k of Object.keys(integrityManifest.payload.files).sort()) {
      sortedFiles[k] = integrityManifest.payload.files[k];
    }
    const canonical = JSON.stringify({
      version: integrityManifest.payload.version,
      strictActivation: Boolean(integrityManifest.payload.strictActivation),
      pubKeySha256: integrityManifest.payload.pubKeySha256,
      files: sortedFiles,
      issuedAt: integrityManifest.payload.issuedAt,
    });

    const pubKeyPem = getClientPublicKeyPem();
    const sigOk = crypto.verify(
      null,
      Buffer.from(canonical, 'utf-8'),
      pubKeyPem,
      Buffer.from(integrityManifest.signature, 'base64')
    );
    if (!sigOk) {
      throw new Error('تم رفض التحديث: التوقيع الرقمي Ed25519 غير مطابق لمالك النظام');
    }

    const baked = getBakedClientConfig();
    if (baked && options?.enforcePubKeyMatch !== false) {
      if (integrityManifest.payload.pubKeySha256 !== baked.pubKeySha256) {
        throw new Error('بصمة المفتاح العام داخل التحديث لا تطابق نسخة البرنامج المثبتة');
      }
      if (Boolean(integrityManifest.payload.strictActivation) !== Boolean(baked.strictActivation)) {
        throw new Error('سياسة التفعيل داخل التحديث لا تطابق هذه النسخة');
      }
    }

    for (const [relPath, expectedSha] of Object.entries(sortedFiles)) {
      const normalizedRel = relPath.replace(/\\/g, '/');
      if (!isAllowedUpdateRelPath(normalizedRel)) {
        throw new Error(`مسار ملف غير مصرح به في الشهادة: ${normalizedRel}`);
      }
      const stagedFile = path.resolve(stageDir, normalizedRel);
      if (!stagedFile.startsWith(stageDir + path.sep) || !fs.existsSync(stagedFile)) {
        throw new Error(`ملف مطلوب مفقود من حزمة التحديث: ${normalizedRel}`);
      }
      const actualSha = crypto.createHash('sha256').update(fs.readFileSync(stagedFile)).digest('hex');
      if (actualSha !== expectedSha) {
        throw new Error(`تم اكتشاف اختلاف أو تلف في ملف التحديث: ${normalizedRel}`);
      }
    }

    // Create automatic database backup before replacing any runtime/dist files
    if (options?.createBackup) {
      await options.createBackup();
    } else {
      const dbFile = path.join(rootDir, 'data', 'plaza_business.db');
      if (fs.existsSync(dbFile)) {
        const backupsDir = path.join(rootDir, 'backups');
        if (!fs.existsSync(backupsDir)) fs.mkdirSync(backupsDir, { recursive: true });
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        fs.copyFileSync(dbFile, path.join(backupsDir, `pre-update_${stamp}.db`));
      }
    }

    // Swap runtime core, launcher, and signed integrity manifest (keep update-config.json untouched)
    const targetRuntimeDir = path.join(rootDir, 'runtime');
    if (!fs.existsSync(targetRuntimeDir)) fs.mkdirSync(targetRuntimeDir, { recursive: true });

    for (const rtFile of ['core.cjs', 'launcher.cjs', 'app.integrity.json']) {
      const src = path.join(stageDir, 'runtime', rtFile);
      if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(targetRuntimeDir, rtFile));
      }
    }

    // Swap dist/ cleanly while removing stale old JS/CSS assets
    const stagedDistDir = path.join(stageDir, 'dist');
    const targetDistDir = path.join(rootDir, 'dist');
    if (fs.existsSync(stagedDistDir)) {
      const targetAssetsDir = path.join(targetDistDir, 'assets');
      if (fs.existsSync(targetAssetsDir)) {
        const nextAssetNames = new Set(
          fs.existsSync(path.join(stagedDistDir, 'assets'))
            ? fs.readdirSync(path.join(stagedDistDir, 'assets'))
            : []
        );
        for (const existing of fs.readdirSync(targetAssetsDir)) {
          if (!nextAssetNames.has(existing)) {
            try {
              fs.unlinkSync(path.join(targetAssetsDir, existing));
            } catch {
              // ignore cleanup errors
            }
          }
        }
      }
      copyTreeReplace(stagedDistDir, targetDistDir);
    }

    // Update standalone HTML copy if bundled
    const stagedDirectHtml = path.join(stageDir, 'MINA_NET_DIRECT.html');
    if (fs.existsSync(stagedDirectHtml)) {
      fs.copyFileSync(stagedDirectHtml, path.join(rootDir, 'MINA_NET_DIRECT.html'));
    }

    const nextState: UpdateState = {
      version: String(updateManifest.version),
      buildId: String(updateManifest.buildId),
      releasedAt: String(updateManifest.releasedAt || integrityManifest.payload.issuedAt || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
      notes: String(updateManifest.notes || ''),
      filesDigest: updateManifest.filesDigest || computeFilesDigest(sortedFiles),
    };
    fs.writeFileSync(path.join(targetRuntimeDir, 'update-state.json'), JSON.stringify(nextState, null, 2), 'utf-8');
    return nextState;
  } finally {
    try {
      fs.rmSync(stageDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}
