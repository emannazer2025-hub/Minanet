import express from 'express';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import Database from 'better-sqlite3';
import * as XLSX from 'xlsx';
import {
  encodeActivationCode,
  getDeviceFingerprint,
  getOrCreateOwnerVault,
  getOwnerRegistryDb,
  getPublicKeyShortId,
  readDistributionPolicy,
  regenerateOwnerKeyPair,
  signLicensePayload,
  writeDistributionPolicy,
  type LicensePayload,
} from './licenseCrypto.ts';
import { buildDirectOpenLicenseManagerHtml } from './standaloneHtmlBuilder.ts';
import { buildCleanClientErpZip } from './clientPackageBuilder.ts';
import { compileHardenedClientDist, compileHardenedDirectHtml } from './clientBundleCompiler.ts';
import { buildLicenseManagerWindowsExe } from './winExeBuilder.ts';
import { buildMinaNetSetupExe } from './winSetupExeBuilder.ts';
import { sanitizeMinaIndustryId, sanitizeMinaLayoutId, sanitizeMinaThemeId } from '../shared/themes.ts';

function buildStandaloneLicenseZip(): Buffer {
  const rootDir = process.cwd();
  const zip = new AdmZip();
  const folder = 'MINA_NET_LICENSE_MANAGER_STANDALONE';

  const copyFileIfExists = (relPath: string, targetRelPath?: string) => {
    const abs = path.join(rootDir, relPath);
    if (fs.existsSync(abs)) {
      zip.addFile(`${folder}/${targetRelPath || relPath}`, fs.readFileSync(abs));
    }
  };

  // Core standalone source files
  copyFileIfExists('license-manager.html');
  copyFileIfExists('tsconfig.json');
  copyFileIfExists('tools/license-manager-server.ts');
  copyFileIfExists('server/licenseCrypto.ts');
  copyFileIfExists('server/licenseManagerRouter.ts');
  copyFileIfExists('src/license-manager-main.tsx');
  copyFileIfExists('src/pages/LicenseManagerView.tsx');
  copyFileIfExists('src/api.ts');
  copyFileIfExists('src/index.css');

  // Ensure owner vault is initialized & exported inside the standalone archive
  const vault = getOrCreateOwnerVault();
  getOwnerRegistryDb();
  const vaultDir = path.join(rootDir, 'owner_vault');
  if (fs.existsSync(vaultDir)) {
    for (const f of fs.readdirSync(vaultDir)) {
      if (f.endsWith('-shm') || f.endsWith('-wal')) continue;
      const abs = path.join(vaultDir, f);
      if (fs.statSync(abs).isFile()) {
        zip.addFile(`${folder}/owner_vault/${f}`, fs.readFileSync(abs));
      }
    }
  }

  // Zero-install direct-open HTML tool (double-click in any browser without Node.js)
  zip.addFile(
    `${folder}/OPEN_LICENSE_MANAGER_DIRECT.html`,
    Buffer.from(buildDirectOpenLicenseManagerHtml(vault), 'utf-8')
  );

  // Also include matching client public key reference
  copyFileIfExists('data/client_public_key.pem', 'client_public_key.pem');

  // Dedicated standalone package.json
  const standalonePkg = {
    name: 'mina-net-license-manager-standalone',
    private: true,
    version: '1.0.0',
    type: 'module',
    scripts: {
      dev: 'tsx tools/license-manager-server.ts',
      start: 'tsx tools/license-manager-server.ts',
      build: 'vite build',
      lint: 'tsc --noEmit',
    },
    dependencies: {
      'adm-zip': '^0.6.1',
      '@tailwindcss/vite': '^4.3.3',
      '@vitejs/plugin-react': '^6.1.1',
      'better-sqlite3': '^13.2.0',
      express: '^4.21.2',
      'lucide-react': '^0.546.0',
      react: '^19.0.1',
      'react-dom': '^19.0.1',
      tailwindcss: '^4.3.3',
      tsx: '^4.21.0',
      vite: '^8.3.0',
      xlsx: '^0.18.5',
    },
    devDependencies: {
      '@types/adm-zip': '^0.5.8',
      '@types/express': '^4.17.21',
      '@types/node': '^22.14.0',
      '@types/react': '^19.3.0',
      '@types/react-dom': '^19.3.0',
      typescript: '^7.0.2',
    },
  };
  zip.addFile(`${folder}/package.json`, Buffer.from(JSON.stringify(standalonePkg, null, 2), 'utf-8'));

  // Dedicated standalone vite.config.ts
  const standaloneViteConfig = `import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
    },
  },
  build: {
    rollupOptions: {
      input: path.resolve(import.meta.dirname, 'license-manager.html'),
    },
  },
});
`;
  zip.addFile(`${folder}/vite.config.ts`, Buffer.from(standaloneViteConfig, 'utf-8'));

  // Windows One-Click Launcher (.bat) - opens in Desktop App Mode (--app=) without browser tabs
  const batContent = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Mina Net License Manager - Desktop App
where node >nul 2>nul
if errorlevel 1 (
  call :open_desktop "file:///%~dp0OPEN_LICENSE_MANAGER_DIRECT.html"
  exit /b 0
)
if not exist node_modules (
  echo Installing dependencies for first run...
  call npm install
)
start /b cmd /c "call npm start"
node -e "const h=require('http'),u='http://127.0.0.1:3099/api/license-manager/vault';let n=60;(function t(){const q=h.get(u,r=>{r.resume();if(r.statusCode<400)process.exit(0);else if(--n>0)setTimeout(t,500);else process.exit(1)});q.on('error',()=>{if(--n>0)setTimeout(t,500);else process.exit(1)})})();"
call :open_desktop "http://localhost:3099"
pause
exit /b 0

:open_desktop
if exist "%ProgramW6432%\\Microsoft\\Edge\\Application\\msedge.exe" (
  start "" "%ProgramW6432%\\Microsoft\\Edge\\Application\\msedge.exe" --app=%~1 --window-size=1180,760
) else if exist "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" (
  start "" "%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe" --app=%~1 --window-size=1180,760
) else if exist "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" (
  start "" "%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe" --app=%~1 --window-size=1180,760
) else if exist "%ProgramW6432%\\Google\\Chrome\\Application\\chrome.exe" (
  start "" "%ProgramW6432%\\Google\\Chrome\\Application\\chrome.exe" --app=%~1 --window-size=1180,760
) else if exist "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" (
  start "" "%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe" --app=%~1 --window-size=1180,760
) else if exist "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" (
  start "" "%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe" --app=%~1 --window-size=1180,760
) else (
  start "" %~1
)
exit /b 0
`;
  zip.addFile(`${folder}/RUN_LICENSE_MANAGER.bat`, Buffer.from(batContent, 'utf-8'));

  // Native Win32 GUI Desktop Executable (LICENSE_MANAGER.exe) compatible with all Windows editions
  zip.addFile(`${folder}/LICENSE_MANAGER.exe`, buildLicenseManagerWindowsExe());

  // Windows Desktop Shortcut Creator (.bat) pointing to LICENSE_MANAGER.exe
  const shortcutBat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "MINA_LM_DIR=%~dp0"
powershell -NoProfile -Command "$d=$env:MINA_LM_DIR; $exe=[System.IO.Path]::Combine($d,'LICENSE_MANAGER.exe'); $s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\Mina Net License Manager.lnk'); $s.TargetPath=$exe; $s.WorkingDirectory=$d; $s.IconLocation=$exe+',0'; $s.Save()" 2>nul
if errorlevel 1 (
  set "VBS_TMP=%TEMP%\\mina_lm_lnk.vbs"
  > "%VBS_TMP%" echo Set sh = CreateObject("WScript.Shell"^)
  >> "%VBS_TMP%" echo d = "%~dp0"
  >> "%VBS_TMP%" echo Set sc = sh.CreateShortcut(sh.SpecialFolders("Desktop"^) ^& "\\Mina Net License Manager.lnk"^)
  >> "%VBS_TMP%" echo sc.TargetPath = d ^& "LICENSE_MANAGER.exe"
  >> "%VBS_TMP%" echo sc.WorkingDirectory = d
  >> "%VBS_TMP%" echo sc.IconLocation = d ^& "LICENSE_MANAGER.exe,0"
  >> "%VBS_TMP%" echo sc.Save
  cscript //nologo "%VBS_TMP%"
  del /q "%VBS_TMP%" >nul 2>nul
)
echo تم إنشاء أيقونة أداة التراخيص على سطح المكتب بنجاح!
pause
`;
  zip.addFile(`${folder}/CREATE_DESKTOP_SHORTCUT.bat`, Buffer.from(shortcutBat, 'utf-8'));

  // Linux / macOS Launcher (.sh)
  const shContent = `#!/usr/bin/env bash
set -e
cd "$(dirname "$0")"
if [ ! -d "node_modules" ]; then
  echo "Installing dependencies..."
  npm install
fi
echo "Starting Mina Net License Manager on http://localhost:3099 ..."
npm start
`;
  zip.addFile(`${folder}/RUN_LICENSE_MANAGER.sh`, Buffer.from(shContent, 'utf-8'), '', 0o755);

  // Arabic README
  const readmeContent = `# Mina Net License Manager (أداة التراخيص المستقلة)
المبرمج: اسامه جرجس - 01153672084

هذه الأداة مستقلة تمامًا عن برنامج المبيعات والمحاسبة (Mina Net) ومخصصة لجهاز المالك فقط.

## الطريقة 1 (الأسرع — فتح مباشر بواجهة .exe بدون تثبيت):
1. فك ضغط هذا المجلد بالكامل في مكان واحد على جهازك.
2. اضغط مرتين على أيقونة التطبيق **\`LICENSE_MANAGER.exe\`** ليفتح كبرنامج ديسكتوب مستقل بنافذة خاصة وبدون Node.js!
3. لإنشاء أيقونة على سطح المكتب: اضغط مرتين على **\`CREATE_DESKTOP_SHORTCUT.bat\`**.

## الطريقة 2 (تشغيل النسخة الكاملة بقاعدة بيانات SQLite على http://localhost:3099):
1. تأكد من تثبيت Node.js (الإصدار 20 أو أحدث) ثم نفّذ \`npm install\`.
2. اضغط مرتين على **\`LICENSE_MANAGER.exe\`** أو \`RUN_LICENSE_MANAGER.bat\` ليفتح كنافذة ديسكتوب على http://localhost:3099.
`;
  zip.addFile(`${folder}/README.md`, Buffer.from(readmeContent, 'utf-8'));

  return zip.toBuffer();
}

export function createLicenseManagerRouter(): express.Router {
  const router = express.Router();

  router.get('/vault', (_req, res) => {
    const vault = getOrCreateOwnerVault();
    res.json({
      publicKeyPem: vault.publicKeyPem,
      createdAt: vault.createdAt,
      currentDeviceFingerprint: getDeviceFingerprint(),
      keyId: getPublicKeyShortId(vault.publicKeyPem),
    });
  });

  router.get('/vault/public-key', (_req, res) => {
    const vault = getOrCreateOwnerVault();
    res.setHeader('Content-Disposition', 'attachment; filename="client_public_key.pem"');
    res.setHeader('Content-Type', 'application/x-pem-file');
    res.send(vault.publicKeyPem);
  });

  router.get('/download-package', (_req, res) => {
    const buf = buildStandaloneLicenseZip();
    res.setHeader('Content-Disposition', 'attachment; filename="MINA_NET_LICENSE_MANAGER_STANDALONE.zip"');
    res.setHeader('Content-Type', 'application/zip');
    res.send(buf);
  });

  router.get('/download-exe', (_req, res) => {
    const buf = buildLicenseManagerWindowsExe();
    res.setHeader('Content-Disposition', 'attachment; filename="LICENSE_MANAGER.exe"');
    res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
    res.send(buf);
  });

  router.get('/download-direct-html', (_req, res) => {
    const vault = getOrCreateOwnerVault();
    const html = buildDirectOpenLicenseManagerHtml(vault);
    res.setHeader('Content-Disposition', 'attachment; filename="OPEN_LICENSE_MANAGER_DIRECT.html"');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  router.get('/policy', (_req, res) => {
    res.json(readDistributionPolicy());
  });

  router.put('/policy', (req, res) => {
    const { strictActivation, rebuildNow } = req.body as { strictActivation?: boolean; rebuildNow?: boolean };
    const updated = writeDistributionPolicy(strictActivation !== false);
    if (rebuildNow) {
      compileHardenedDirectHtml(true);
      compileHardenedClientDist(true);
    }
    res.json(updated);
  });

  router.get('/download-direct-erp-html', (req, res) => {
    const industryId = sanitizeMinaIndustryId(req.query.industry as string | undefined);
    const layoutId = sanitizeMinaLayoutId(req.query.layout as string | undefined);
    const themeId = sanitizeMinaThemeId(req.query.theme as string | undefined);
    const directHtmlPath = compileHardenedDirectHtml(false, themeId, layoutId, industryId);
    if (!fs.existsSync(directHtmlPath)) {
      return res.status(404).json({ error: 'ملف التشغيل المباشر غير مبني بعد' });
    }
    res.setHeader('Content-Disposition', `attachment; filename="MINA_NET_DIRECT_${industryId}_${layoutId}.html"`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(fs.readFileSync(directHtmlPath));
  });

  router.get('/download-client-setup', (req, res) => {
    const industryId = sanitizeMinaIndustryId(req.query.industry as string | undefined);
    const layoutId = sanitizeMinaLayoutId(req.query.layout as string | undefined);
    const themeId = sanitizeMinaThemeId(req.query.theme as string | undefined);
    const buf = buildMinaNetSetupExe(themeId, layoutId, industryId);
    res.setHeader('Content-Disposition', `attachment; filename="MINA_NET_SETUP.exe"`);
    res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
    res.send(buf);
  });

  router.get('/download-client-erp', (req, res) => {
    const industryId = sanitizeMinaIndustryId(req.query.industry as string | undefined);
    const layoutId = sanitizeMinaLayoutId(req.query.layout as string | undefined);
    const themeId = sanitizeMinaThemeId(req.query.theme as string | undefined);
    const buf = buildCleanClientErpZip(themeId, layoutId, industryId);
    res.setHeader('Content-Disposition', `attachment; filename="MINA_NET_ERP_${industryId}_${layoutId}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    res.send(buf);
  });

  router.post('/vault/backup', (_req, res) => {
    const vault = getOrCreateOwnerVault();
    res.json(vault);
  });

  router.post('/vault/regenerate', (_req, res) => {
    const vault = regenerateOwnerKeyPair();
    res.json({ publicKeyPem: vault.publicKeyPem, createdAt: vault.createdAt });
  });

  router.get('/records', (_req, res) => {
    const ownerDb = getOwnerRegistryDb();
    res.json(ownerDb.prepare('SELECT * FROM license_manager_records ORDER BY id DESC').all());
  });

  router.post('/issue', (req, res) => {
    const ownerDb = getOwnerRegistryDb();
    const {
      customer_name,
      customer_phone,
      device_fingerprint,
      license_type,
      duration_days,
      max_devices,
      enabled_modules,
      notes,
    } = req.body;

    if (!customer_name?.trim()) {
      return res.status(400).json({ error: 'اسم العميل مطلوب' });
    }

    const licenseId = `MINA-${new Date().getFullYear()}-${String(Math.floor(10000 + Math.random() * 90000))}`;
    const issuedAt = new Date().toISOString();
    let expiresAt: string | null = null;

    if (license_type === 'TRIAL') {
      expiresAt = new Date(Date.now() + 30 * 86400000).toISOString();
    } else if (license_type === 'MONTHLY') {
      expiresAt = new Date(Date.now() + (Number(duration_days) || 30) * 86400000).toISOString();
    } else if (license_type === 'YEARLY') {
      expiresAt = new Date(Date.now() + (Number(duration_days) || 365) * 86400000).toISOString();
    }

    const payload: LicensePayload = {
      license_id: licenseId,
      customer_name: customer_name.trim(),
      customer_phone: customer_phone || '',
      device_fingerprint: device_fingerprint?.trim() || 'MULTI_DEVICE',
      license_type: license_type || 'YEARLY',
      max_devices: Number(max_devices || 1),
      enabled_modules: Array.isArray(enabled_modules) && enabled_modules.length > 0 ? enabled_modules : ['ALL'],
      issued_at: issuedAt,
      expires_at: expiresAt,
    };

    const signed = signLicensePayload(payload);
    const activationCode = encodeActivationCode(signed);
    const signedJson = JSON.stringify(signed, null, 2);

    ownerDb
      .prepare(
        `INSERT INTO license_manager_records (license_id, customer_name, customer_phone, device_fingerprint, license_type, max_devices, enabled_modules, issued_at, expires_at, status, activation_code, signed_json, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?)`
      )
      .run(
        licenseId,
        payload.customer_name,
        payload.customer_phone,
        payload.device_fingerprint,
        payload.license_type,
        payload.max_devices,
        JSON.stringify(payload.enabled_modules),
        issuedAt,
        expiresAt,
        activationCode,
        signedJson,
        notes || ''
      );

    res.json({ license_id: licenseId, activation_code: activationCode, signed_json: signedJson, payload });
  });

  router.post('/revoke', (req, res) => {
    const ownerDb = getOwnerRegistryDb();
    const { license_id, reason } = req.body;
    const now = new Date().toISOString();
    const revReason = reason || 'إيقاف من أداة إدارة التراخيص المستقلة';

    ownerDb.prepare("UPDATE license_manager_records SET status = 'REVOKED' WHERE license_id = ?").run(license_id);
    ownerDb.prepare('INSERT OR REPLACE INTO owner_revocations (license_id, revoked_at, reason) VALUES (?, ?, ?)').run(
      license_id,
      now,
      revReason
    );

    const localClientDbPath = path.resolve(process.cwd(), 'data', 'plaza_business.db');
    if (fs.existsSync(localClientDbPath)) {
      try {
        const cdb = new Database(localClientDbPath);
        cdb.prepare('INSERT OR REPLACE INTO license_revocations (license_id, revoked_at, reason) VALUES (?, ?, ?)').run(
          license_id,
          now,
          revReason
        );
        cdb.close();
      } catch {
        // standalone usage without local client DB
      }
    }

    res.json({ ok: true });
  });

  router.post('/export-excel', (_req, res) => {
    const ownerDb = getOwnerRegistryDb();
    const rows = ownerDb
      .prepare(
        `SELECT license_id as 'رقم الترخيص', customer_name as 'العميل', customer_phone as 'الهاتف',
          device_fingerprint as 'بصمة الجهاز', license_type as 'النوع', max_devices as 'عدد الأجهزة',
          issued_at as 'تاريخ الإصدار', expires_at as 'تاريخ الانتهاء', status as 'الحالة'
         FROM license_manager_records ORDER BY id DESC`
      )
      .all();
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'سجل التراخيص');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename="MINA_NET_LICENSES_REGISTRY.xlsx"');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buf);
  });

  return router;
}
