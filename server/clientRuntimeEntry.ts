import { spawn } from 'child_process';
import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { closeDb, getBackupsDir, getDb } from './db.ts';
import { startAutoBackupScheduler } from './autoBackupScheduler.ts';
import { createErpRouter, getActor, logAudit } from './erpRoutes.ts';
import { createImportAndReportRouter } from './importAndReportRoutes.ts';
import { verifyRuntimeIntegrity } from './licenseGuard.ts';
import { createHardwareBridgeRouter } from './hardwareBridge.ts';
import {
  downloadRemoteUpdateZip,
  fetchRemoteManifest,
  normalizeUpdateServerUrl,
  readLocalUpdateConfig,
  readLocalUpdateState,
  verifyAndApplyUpdateZip,
  writeLocalUpdateConfig,
} from './updateService.ts';

function ensureCanManageUpdates(req: express.Request): boolean {
  const actor = getActor(req);
  const db = getDb();
  const user = db
    .prepare('SELECT id, role_id, is_active FROM users WHERE id = ?')
    .get(actor.userId) as { id: number; role_id: number; is_active: number } | undefined;
  if (!user || Number(user.is_active) !== 1) return false;
  if (Number(user.role_id) === 1) return true;
  const perm = db
    .prepare("SELECT can_view, can_edit FROM permissions WHERE role_id = ? AND module_key = 'settings'")
    .get(user.role_id) as { can_view?: number; can_edit?: number } | undefined;
  return Boolean(perm && Number(perm.can_view) === 1 && Number(perm.can_edit) === 1);
}

export async function startClientServer() {
  const integrity = verifyRuntimeIntegrity(true);
  if (!integrity.ok) {
    console.error(`[SECURITY] ${integrity.reason || 'Integrity check failed'}`);
  }

  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT || 3000);

  app.use(express.json({ limit: '90mb' }));

  getDb();
  startAutoBackupScheduler();

  app.use('/api', createErpRouter());
  app.use('/api', createImportAndReportRouter());
  app.use('/api', createHardwareBridgeRouter());

  // ==========================================
  // CLIENT AUTO-UPDATE & OFFLINE UPDATE ROUTES
  // ==========================================
  app.get('/api/updates/status', async (req, res) => {
    try {
      const config = readLocalUpdateConfig();
      const localState = readLocalUpdateState();
      const shouldCheck = String(req.query.check || '') === '1';

      if (!shouldCheck) {
        return res.json({
          mode: 'client',
          isClient: true,
          config,
          localState,
          remoteManifest: null,
          hasUpdate: false,
          checkError: null,
        });
      }

      const customUrl = typeof req.query.serverUrl === 'string' && req.query.serverUrl.trim()
        ? normalizeUpdateServerUrl(req.query.serverUrl)
        : config.updateServerUrl;

      try {
        const remoteManifest = await fetchRemoteManifest(customUrl);
        const hasUpdate =
          remoteManifest.buildId !== localState.buildId || remoteManifest.version !== localState.version;
        return res.json({
          mode: 'client',
          isClient: true,
          config: { ...config, updateServerUrl: customUrl },
          localState,
          remoteManifest,
          hasUpdate,
          checkError: null,
        });
      } catch (err: unknown) {
        return res.json({
          mode: 'client',
          isClient: true,
          config: { ...config, updateServerUrl: customUrl },
          localState,
          remoteManifest: null,
          hasUpdate: false,
          checkError: (err as Error).message || 'تعذر الوصول إلى سيرفر التحديثات الرئيسي',
        });
      }
    } catch (err: unknown) {
      return res.status(400).json({ error: (err as Error).message || 'تعذر قراءة حالة التحديثات' });
    }
  });

  app.put('/api/updates/config', (req, res) => {
    try {
      if (!ensureCanManageUpdates(req)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية تعديل إعدادات التحديثات' });
      }
      const { updateServerUrl } = req.body as { updateServerUrl?: string };
      const saved = writeLocalUpdateConfig(String(updateServerUrl || ''));
      const db = getDb();
      const actor = getActor(req);
      logAudit(db, actor.userId, actor.username, 'UPDATE', 'SYSTEM_UPDATE_URL', 'CONFIG', '', null, saved, 'تحديث رابط سيرفر التحديثات');
      return res.json({ ok: true, config: saved });
    } catch (err: unknown) {
      return res.status(400).json({ error: (err as Error).message || 'تعذر حفظ رابط سيرفر التحديثات' });
    }
  });

  const scheduleSelfRestart = () => {
    setTimeout(() => {
      try {
        closeDb();
      } catch {
        // ignore
      }
      const launcherPath = path.resolve(process.cwd(), 'runtime', 'launcher.cjs');
      const finishRestart = () => {
        try {
          const child = spawn(process.execPath, [launcherPath], {
            cwd: process.cwd(),
            detached: true,
            stdio: 'ignore',
            windowsHide: true,
          });
          child.unref();
        } catch (spawnErr) {
          console.error('Failed to spawn updated launcher process:', spawnErr);
        }
        process.exit(0);
      };

      let finished = false;
      const timer = setTimeout(() => {
        if (!finished) {
          finished = true;
          finishRestart();
        }
      }, 1500);

      httpServer.close(() => {
        clearTimeout(timer);
        if (!finished) {
          finished = true;
          finishRestart();
        }
      });
    }, 350);
  };

  app.post('/api/updates/apply', async (req, res) => {
    try {
      if (!ensureCanManageUpdates(req)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية تثبيت التحديثات' });
      }
      const config = readLocalUpdateConfig();
      const bodyUrl = typeof (req.body as { serverUrl?: string })?.serverUrl === 'string'
        ? (req.body as { serverUrl?: string }).serverUrl?.trim()
        : '';
      const serverUrl = bodyUrl ? normalizeUpdateServerUrl(bodyUrl) : config.updateServerUrl;
      if (bodyUrl && bodyUrl !== config.updateServerUrl) {
        writeLocalUpdateConfig(serverUrl);
      }

      const manifest = await fetchRemoteManifest(serverUrl);
      const packageUrl = manifest.packageUrl
        ? normalizeUpdateServerUrl(manifest.packageUrl.split('?')[0])
        : `${serverUrl}/api/updates/package.zip`;
      const zipBuffer = await downloadRemoteUpdateZip(packageUrl, manifest.sha256);

      const db = getDb();
      const actor = getActor(req);
      const nextState = await verifyAndApplyUpdateZip(zipBuffer, {
        createBackup: async () => {
          const backupDir = getBackupsDir();
          if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          await db.backup(path.join(backupDir, `pre-update_${stamp}.db`));
        },
      });

      logAudit(
        db,
        actor.userId,
        actor.username,
        'UPDATE',
        'APP_VERSION',
        nextState.buildId,
        nextState.version,
        null,
        nextState,
        `تحديث البرنامج تلقائياً إلى الإصدار ${nextState.version}`
      );

      res.json({
        ok: true,
        restarting: true,
        localState: nextState,
        message: `تم تنزيل وفرد التحديث (${nextState.version}) بنجاح وجاري إعادة تشغيل البرنامج...`,
      });
      scheduleSelfRestart();
    } catch (err: unknown) {
      res.status(400).json({ error: (err as Error).message || 'تعذر تنفيذ التحديث التلقائي' });
    }
  });

  app.post('/api/updates/apply-upload', async (req, res) => {
    try {
      if (!ensureCanManageUpdates(req)) {
        return res.status(403).json({ error: 'ليس لديك صلاحية تثبيت التحديثات' });
      }
      const { zipBase64 } = req.body as { zipBase64?: string };
      if (!zipBase64 || typeof zipBase64 !== 'string') {
        return res.status(400).json({ error: 'يرجى اختيار ملف التحديث (.zip)' });
      }
      const cleanB64 = zipBase64.includes(',') ? zipBase64.split(',')[1] : zipBase64;
      const zipBuffer = Buffer.from(cleanB64, 'base64');
      if (zipBuffer.length < 64) {
        return res.status(400).json({ error: 'ملف التحديث المرفوع تالف أو فارغ' });
      }

      const db = getDb();
      const actor = getActor(req);
      const nextState = await verifyAndApplyUpdateZip(zipBuffer, {
        createBackup: async () => {
          const backupDir = getBackupsDir();
          if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
          const stamp = new Date().toISOString().replace(/[:.]/g, '-');
          await db.backup(path.join(backupDir, `pre-update_${stamp}.db`));
        },
      });

      logAudit(
        db,
        actor.userId,
        actor.username,
        'UPDATE',
        'APP_VERSION',
        nextState.buildId,
        nextState.version,
        null,
        nextState,
        `تحديث البرنامج يدوياً إلى الإصدار ${nextState.version}`
      );

      res.json({
        ok: true,
        restarting: true,
        localState: nextState,
        message: `تم فرد التحديث (${nextState.version}) بنجاح وجاري إعادة تشغيل البرنامج...`,
      });
      scheduleSelfRestart();
    } catch (err: unknown) {
      res.status(400).json({ error: (err as Error).message || 'تعذر تثبيت ملف التحديث اليدوي' });
    }
  });

  app.get('/api/desktop/download-direct-html', (_req, res) => {
    const directHtmlPath = path.resolve(process.cwd(), 'MINA_NET_DIRECT.html');
    if (!fs.existsSync(directHtmlPath)) {
      return res.status(404).json({ error: 'ملف التشغيل المباشر غير متوفر' });
    }
    res.setHeader('Content-Disposition', 'attachment; filename="MINA_NET_DIRECT.html"');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(fs.readFileSync(directHtmlPath));
  });

  const distDir = path.resolve(process.cwd(), 'dist');
  app.use(express.static(distDir));
  app.get('*', (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'));
  });

  let listenAttempts = 0;
  const maxListenAttempts = 15;
  httpServer.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE' && listenAttempts < maxListenAttempts) {
      listenAttempts++;
      setTimeout(() => {
        httpServer.listen(PORT, '0.0.0.0');
      }, 300);
    } else {
      console.error('Client server listen error:', err);
      process.exit(1);
    }
  });

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Mina Net ERP running at http://localhost:${PORT}`);
  });
}

startClientServer();
