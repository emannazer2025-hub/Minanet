import AdmZip from 'adm-zip';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { compileHardenedClientDist, compileHardenedDirectHtml } from './clientBundleCompiler.ts';
import {
  computeBuildId,
  computeFilesDigest,
  type UpdateReleaseManifest,
  type UpdateState,
} from './updateService.ts';

interface StoredReleaseRecord {
  version: string;
  releaseSeq: number;
  notes: string;
  releasedAt: string;
  filesDigest: string;
  buildId: string;
  integrityIssuedAt: string;
}

const OWNER_VAULT_DIR = path.resolve(process.cwd(), 'owner_vault');
const RELEASE_FILE = path.join(OWNER_VAULT_DIR, 'update_release.json');

let cachedPackageZip: { buildId: string; buffer: Buffer; sha256: string } | null = null;

function bumpPatchVersion(ver: string): string {
  const parts = String(ver || '1.0.0')
    .trim()
    .split('.')
    .map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n) || n < 0)) {
    return '1.0.1';
  }
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function readCurrentClientIntegrityInfo(hardenedRoot: string): {
  filesDigest: string;
  integrityIssuedAt: string;
} {
  const integrityPath = path.join(hardenedRoot, 'runtime', 'app.integrity.json');
  const parsed = JSON.parse(fs.readFileSync(integrityPath, 'utf-8')) as {
    payload?: { files?: Record<string, string>; issuedAt?: string };
  };
  const files = parsed?.payload?.files || {};
  return {
    filesDigest: computeFilesDigest(files),
    integrityIssuedAt: String(parsed?.payload?.issuedAt || new Date().toISOString()),
  };
}

export function ensureMasterReleaseState(forceRebuild = false): StoredReleaseRecord {
  if (!fs.existsSync(OWNER_VAULT_DIR)) {
    fs.mkdirSync(OWNER_VAULT_DIR, { recursive: true });
  }

  const hardenedRoot = compileHardenedClientDist(forceRebuild, 'mina-classic', 'mina-classic', 'general-classic');
  compileHardenedDirectHtml(forceRebuild, 'mina-classic', 'mina-classic', 'general-classic');
  const { filesDigest, integrityIssuedAt } = readCurrentClientIntegrityInfo(hardenedRoot);

  if (fs.existsSync(RELEASE_FILE)) {
    try {
      const existing = JSON.parse(fs.readFileSync(RELEASE_FILE, 'utf-8')) as StoredReleaseRecord;
      if (existing.version && existing.buildId) {
        if (existing.filesDigest !== filesDigest) {
          const nextSeq = (existing.releaseSeq || 1) + 1;
          const nextBuildId = computeBuildId(existing.version, filesDigest, nextSeq);
          const updated: StoredReleaseRecord = {
            version: existing.version,
            releaseSeq: nextSeq,
            notes: existing.notes || 'تحديثات وتحسينات في النظام',
            releasedAt: new Date().toISOString(),
            filesDigest,
            buildId: nextBuildId,
            integrityIssuedAt,
          };
          fs.writeFileSync(RELEASE_FILE, JSON.stringify(updated, null, 2), 'utf-8');
          cachedPackageZip = null;
          return updated;
        }
        return existing;
      }
    } catch {
      // re-initialize if unreadable
    }
  }

  const initial: StoredReleaseRecord = {
    version: '1.0.0',
    releaseSeq: 1,
    notes: 'الإصدار الأساسي المستقر من برنامج Mina Net ERP',
    releasedAt: integrityIssuedAt,
    filesDigest,
    buildId: computeBuildId('1.0.0', filesDigest, 1),
    integrityIssuedAt,
  };
  fs.writeFileSync(RELEASE_FILE, JSON.stringify(initial, null, 2), 'utf-8');
  return initial;
}

export function publishNewMasterUpdate(input: {
  version?: string;
  notes?: string;
  forceRebuild?: boolean;
}): StoredReleaseRecord {
  if (!fs.existsSync(OWNER_VAULT_DIR)) {
    fs.mkdirSync(OWNER_VAULT_DIR, { recursive: true });
  }

  const shouldRebuild = input.forceRebuild !== false;
  const hardenedRoot = compileHardenedClientDist(shouldRebuild, 'mina-classic', 'mina-classic', 'general-classic');
  compileHardenedDirectHtml(shouldRebuild, 'mina-classic', 'mina-classic', 'general-classic');
  const { filesDigest, integrityIssuedAt } = readCurrentClientIntegrityInfo(hardenedRoot);

  let prev: Partial<StoredReleaseRecord> = {};
  if (fs.existsSync(RELEASE_FILE)) {
    try {
      prev = JSON.parse(fs.readFileSync(RELEASE_FILE, 'utf-8')) as Partial<StoredReleaseRecord>;
    } catch {
      prev = {};
    }
  }

  const prevVer = String(prev.version || '1.0.0');
  const requestedVer = String(input.version || '').trim();
  const nextVersion =
    requestedVer && requestedVer !== prevVer ? requestedVer : requestedVer || bumpPatchVersion(prevVer);
  const finalVersion = nextVersion === prevVer && !requestedVer ? bumpPatchVersion(prevVer) : nextVersion;
  const nextSeq = Number(prev.releaseSeq || 1) + 1;
  const nextNotes = String(input.notes || '').trim() || `تحديث جديد للبرنامج (إصدار ${finalVersion})`;
  const releasedAt = new Date().toISOString();
  const buildId = computeBuildId(finalVersion, filesDigest, nextSeq);

  const record: StoredReleaseRecord = {
    version: finalVersion,
    releaseSeq: nextSeq,
    notes: nextNotes,
    releasedAt,
    filesDigest,
    buildId,
    integrityIssuedAt,
  };
  fs.writeFileSync(RELEASE_FILE, JSON.stringify(record, null, 2), 'utf-8');
  cachedPackageZip = null;
  return record;
}

export function getMasterInitialUpdateState(): UpdateState {
  const rec = ensureMasterReleaseState(false);
  return {
    version: rec.version,
    buildId: rec.buildId,
    releasedAt: rec.releasedAt,
    updatedAt: rec.releasedAt,
    notes: rec.notes,
    filesDigest: rec.filesDigest,
  };
}

export function buildMasterUpdateZip(): { buffer: Buffer; sha256: string; record: StoredReleaseRecord } {
  const record = ensureMasterReleaseState(false);
  if (cachedPackageZip && cachedPackageZip.buildId === record.buildId) {
    return { buffer: cachedPackageZip.buffer, sha256: cachedPackageZip.sha256, record };
  }

  const hardenedRoot = path.join(process.cwd(), 'dist-client');
  const directHtmlPath = path.join(process.cwd(), 'dist-direct', 'index.html');
  const zip = new AdmZip();

  const manifestEntry = {
    version: record.version,
    buildId: record.buildId,
    releasedAt: record.releasedAt,
    notes: record.notes,
    filesDigest: record.filesDigest,
    integrityIssuedAt: record.integrityIssuedAt,
  };
  zip.addFile('manifest.json', Buffer.from(JSON.stringify(manifestEntry, null, 2), 'utf-8'));

  for (const rtFile of ['core.cjs', 'launcher.cjs', 'app.integrity.json']) {
    const abs = path.join(hardenedRoot, 'runtime', rtFile);
    if (!fs.existsSync(abs)) {
      throw new Error(`ملف التشغيل غير مكتمل أثناء بناء التحديث: ${rtFile}`);
    }
    zip.addFile(`runtime/${rtFile}`, fs.readFileSync(abs));
  }

  const distDir = path.join(hardenedRoot, 'dist');
  const addDistDir = (dir: string, relBase: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === 'license-manager.html' || entry.name.startsWith('licenseManager')) continue;
      const abs = path.join(dir, entry.name);
      const rel = `${relBase}/${entry.name}`;
      if (entry.isDirectory()) {
        addDistDir(abs, rel);
      } else if (entry.isFile()) {
        zip.addFile(rel, fs.readFileSync(abs));
      }
    }
  };
  addDistDir(distDir, 'dist');

  if (fs.existsSync(directHtmlPath)) {
    zip.addFile('MINA_NET_DIRECT.html', fs.readFileSync(directHtmlPath));
  }

  const buffer = zip.toBuffer();
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  cachedPackageZip = { buildId: record.buildId, buffer, sha256 };
  return { buffer, sha256, record };
}

export function getMasterUpdateManifest(serverUrl: string): UpdateReleaseManifest {
  const cleanUrl = String(serverUrl || '').replace(/\/+$/, '');
  const { buffer, sha256, record } = buildMasterUpdateZip();
  return {
    version: record.version,
    buildId: record.buildId,
    releasedAt: record.releasedAt,
    notes: record.notes,
    serverUrl: cleanUrl,
    packageUrl: `${cleanUrl}/api/updates/package.zip`,
    directHtmlUrl: `${cleanUrl}/api/desktop/download-direct-html`,
    setupExeUrl: `${cleanUrl}/api/desktop/download-setup-exe`,
    sha256,
    packageSizeBytes: buffer.length,
    integrityIssuedAt: record.integrityIssuedAt,
    filesDigest: record.filesDigest,
  };
}
