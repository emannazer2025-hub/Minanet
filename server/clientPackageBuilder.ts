import AdmZip from 'adm-zip';
import fs from 'fs';
import path from 'path';
import { compileHardenedClientDist, compileHardenedDirectHtml } from './clientBundleCompiler.ts';
import { buildMinaNetWindowsExe } from './winExeBuilder.ts';
import { getMasterInitialUpdateState } from './masterUpdatePublisher.ts';
import { DEFAULT_PUBLIC_UPDATE_URL } from './updateService.ts';
import {
  getMinaIndustryById,
  getMinaLayoutById,
  getMinaThemeById,
  sanitizeMinaIndustryId,
  sanitizeMinaLayoutId,
  sanitizeMinaThemeId,
} from '../shared/themes.ts';

export function buildCleanClientErpZip(
  rawTheme?: string,
  rawLayout?: string,
  rawIndustry?: string,
  updateServerUrl?: string
): Buffer {
  const rootDir = process.cwd();
  const zip = new AdmZip();
  const folder = 'MINA_NET_ERP_CLIENT';
  const industryId = sanitizeMinaIndustryId(rawIndustry);
  const layoutId = sanitizeMinaLayoutId(rawLayout);
  const themeId = sanitizeMinaThemeId(rawTheme);
  const industryMeta = getMinaIndustryById(industryId);
  const layoutMeta = getMinaLayoutById(layoutId);
  const themeMeta = getMinaThemeById(themeId);

  // Ensure compiled, obfuscated, Ed25519-integrity-signed client bundle & direct HTML are ready
  const hardenedRoot = compileHardenedClientDist(false, themeId, layoutId, industryId);
  const directHtmlPath = compileHardenedDirectHtml(false, themeId, layoutId, industryId);

  const addTreeFrom = (baseDir: string, relDir: string, excludeNames: Set<string>, excludePrefixes: string[] = []) => {
    const absDir = path.join(baseDir, relDir);
    if (!fs.existsSync(absDir)) return;
    for (const entry of fs.readdirSync(absDir, { withFileTypes: true })) {
      if (excludeNames.has(entry.name)) continue;
      if (excludePrefixes.some((p) => entry.name.startsWith(p))) continue;
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) {
        addTreeFrom(baseDir, rel, excludeNames, excludePrefixes);
      } else if (entry.isFile()) {
        zip.addFile(`${folder}/${rel}`, fs.readFileSync(abs));
      }
    }
  };

  // Safe metadata & env template (no source code, no private keys)
  for (const f of ['metadata.json', '.env.example']) {
    const abs = path.join(rootDir, f);
    if (fs.existsSync(abs)) {
      zip.addFile(`${folder}/${f}`, fs.readFileSync(abs));
    }
  }

  // Runtime-only package.json (no TypeScript/Vite source tools needed on client machine)
  const runtimePkg = {
    name: 'mina-net-erp',
    private: true,
    version: '1.0.0',
    scripts: {
      start: 'node runtime/launcher.cjs',
      dev: 'node runtime/launcher.cjs',
    },
    dependencies: {
      'adm-zip': '^0.6.1',
      bcryptjs: '^3.0.3',
      'better-sqlite3': '^13.2.0',
      dotenv: '^17.2.3',
      express: '^4.21.2',
      xlsx: '^0.18.5',
    },
  };
  zip.addFile(`${folder}/package.json`, Buffer.from(JSON.stringify(runtimePkg, null, 2), 'utf-8'));

  // Hardened, obfuscated runtime & Ed25519 integrity signature
  addTreeFrom(hardenedRoot, 'runtime', new Set(['.build-meta.json']));
  // Remote update config & initial release state (not hashed in app.integrity.json so client can update safely)
  const updateConfig = {
    updateServerUrl: (updateServerUrl || DEFAULT_PUBLIC_UPDATE_URL).replace(/\/+$/, ''),
    updatedAt: new Date().toISOString(),
  };
  const updateState = getMasterInitialUpdateState();
  zip.addFile(`${folder}/runtime/update-config.json`, Buffer.from(JSON.stringify(updateConfig, null, 2), 'utf-8'));
  zip.addFile(`${folder}/runtime/update-state.json`, Buffer.from(JSON.stringify(updateState, null, 2), 'utf-8'));

  // Prebuilt obfuscated frontend dist/
  addTreeFrom(hardenedRoot, 'dist', new Set(['license-manager.html']), ['licenseManager']);

  // Include zero-install direct desktop singlefile ERP (MINA_NET_DIRECT.html)
  if (fs.existsSync(directHtmlPath)) {
    zip.addFile(`${folder}/MINA_NET_DIRECT.html`, fs.readFileSync(directHtmlPath));
  }

  // Include PWA / desktop icons from public/ (excluding assets)
  addTreeFrom(rootDir, 'public', new Set(['assets']));

  // Primary native Windows GUI Executable (MINA_NET.exe) with embedded icon & version metadata
  zip.addFile(`${folder}/MINA_NET.exe`, buildMinaNetWindowsExe());

  // Windows Desktop Shortcut Creator (.bat) pointing to MINA_NET.exe (PowerShell + VBScript fallback for Win7/8/10/11)
  const shortcutBat = `@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "MINA_DIR=%~dp0"
powershell -NoProfile -Command "$d=$env:MINA_DIR; $exe=[System.IO.Path]::Combine($d,'MINA_NET.exe'); $s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Desktop') + '\\Mina Net.lnk'); $s.TargetPath=$exe; $s.WorkingDirectory=$d; $s.IconLocation=$exe+',0'; $s.Save()" 2>nul
if errorlevel 1 (
  set "VBS_TMP=%TEMP%\\mina_net_lnk.vbs"
  > "%VBS_TMP%" echo Set sh = CreateObject("WScript.Shell"^)
  >> "%VBS_TMP%" echo d = "%~dp0"
  >> "%VBS_TMP%" echo Set sc = sh.CreateShortcut(sh.SpecialFolders("Desktop"^) ^& "\\Mina Net.lnk"^)
  >> "%VBS_TMP%" echo sc.TargetPath = d ^& "MINA_NET.exe"
  >> "%VBS_TMP%" echo sc.WorkingDirectory = d
  >> "%VBS_TMP%" echo sc.IconLocation = d ^& "MINA_NET.exe,0"
  >> "%VBS_TMP%" echo sc.Save
  cscript //nologo "%VBS_TMP%"
  del /q "%VBS_TMP%" >nul 2>nul
)
echo تم إنشاء أيقونة "Mina Net" على سطح المكتب بنجاح!
pause
`;
  zip.addFile(`${folder}/CREATE_DESKTOP_SHORTCUT.bat`, Buffer.from(shortcutBat, 'utf-8'));

  const readmeTxt = `Mina Net - نظام إدارة المحلات التجارية والمخازن والشركات (نسخة محصّنة ومحمية)
النشاط المختار لهذه النسخة: ${industryMeta.nameAr} (${industryMeta.id})
الواجهة المختارة: ${layoutMeta.nameAr} (${layoutMeta.id})
الألوان المختارة: ${themeMeta.nameAr} (${themeMeta.id})
المبرمج: اسامه جرجس - 01153672084
=========================================================

طريقة التشغيل المباشر على الكمبيوتر:
1) فك ضغط هذا المجلد بالكامل في أي مكان أو درايف على الجهاز (مثلاً C:\\MinaNet أو D:\\MinaNet أو E:\\MinaNet).
2) اضغط مرتين على أيقونة البرنامج:
   - MINA_NET.exe
   (يعمل على جميع إصدارات ويندوز Windows 7 / 8 / 8.1 / 10 / 11 نواة 32-bit و 64-bit)
3) لإنشاء اختصار للبرنامج على سطح المكتب: اضغط مرتين على CREATE_DESKTOP_SHORTCUT.bat
4) يعمل البرنامج بفترة تجريبية 30 يومًا، وبعدها يمكنك التفعيل بإرسال "بصمة الجهاز" للمبرمج (اسامه جرجس - 01153672084).
5) تنبيه أمني: ملفات النظام محمية بتوقيع رقمي Ed25519؛ أي تعديل على ملفات التشغيل سيوقف النظام لحماية الترخيص.
`;
  zip.addFile(`${folder}/README_التشغيل_المباشر.txt`, Buffer.from(readmeTxt, 'utf-8'));

  return zip.toBuffer();
}
