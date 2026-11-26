import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { getDb } from './server/db.ts';
import { startAutoBackupScheduler } from './server/autoBackupScheduler.ts';
import { createErpRouter } from './server/erpRoutes.ts';
import { createImportAndReportRouter } from './server/importAndReportRoutes.ts';
import { createLicenseManagerRouter } from './server/licenseManagerRouter.ts';
import { buildCleanClientErpZip } from './server/clientPackageBuilder.ts';
import { buildMinaNetSetupExe } from './server/winSetupExeBuilder.ts';
import { compileHardenedDirectHtml } from './server/clientBundleCompiler.ts';
import { sanitizeMinaIndustryId, sanitizeMinaLayoutId, sanitizeMinaThemeId } from './shared/themes.ts';
import { resolvePublicUpdateOrigin } from './server/updateService.ts';
import { buildMasterUpdateZip, getMasterUpdateManifest, publishNewMasterUpdate } from './server/masterUpdatePublisher.ts';
import { createHardwareBridgeRouter } from './server/hardwareBridge.ts';

async function startServer() {
  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.PORT) || 3000;

  app.use(express.json({ limit: '50mb' }));

  // Initialize database & start automatic scheduled daily backup (silent, no confirmation)
  getDb();
  startAutoBackupScheduler();

  // ERP API routes
  app.use('/api', createErpRouter());
  app.use('/api', createImportAndReportRouter());
  app.use('/api', createHardwareBridgeRouter());

  // Serve explainer video cleanly with Range request support in both dev and production
  app.get('/mina-net-explainer.mp4', (_req, res, next) => {
    const mp4Path = path.resolve(process.cwd(), 'public', 'mina-net-explainer.mp4');
    if (!fs.existsSync(mp4Path)) return next();
    res.type('video/mp4');
    return res.sendFile(mp4Path);
  });

  // ==========================================
  // CENTRAL UPDATE FEED & PUBLISHER ROUTES
  // ==========================================
  const setPublicUpdateCors = (_req: express.Request, res: express.Response, next: express.NextFunction) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (_req.method === 'OPTIONS') {
      return res.status(204).end();
    }
    next();
  };

  app.get('/api/updates/manifest', setPublicUpdateCors, (req, res) => {
    try {
      const origin = resolvePublicUpdateOrigin(req);
      const manifest = getMasterUpdateManifest(origin);
      res.setHeader('Cache-Control', 'no-store');
      res.json(manifest);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message || 'تعذر قراءة بيان التحديثات' });
    }
  });

  app.get('/api/updates/package.zip', setPublicUpdateCors, (_req, res) => {
    try {
      const { buffer, record } = buildMasterUpdateZip();
      res.setHeader('Content-Disposition', `attachment; filename="MINA_NET_UPDATE_v${record.version}.zip"`);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Cache-Control', 'no-store');
      res.send(buffer);
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message || 'تعذر تجهيز حزمة التحديث' });
    }
  });

  app.get('/api/updates/status', (req, res) => {
    try {
      const origin = resolvePublicUpdateOrigin(req);
      const manifest = getMasterUpdateManifest(origin);
      res.json({
        mode: 'master',
        isClient: false,
        manifest,
      });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message || 'تعذر قراءة حالة النشر' });
    }
  });

  app.post('/api/updates/publish', (req, res) => {
    try {
      const uid = Number(req.headers['x-user-id'] || 1);
      const db = getDb();
      const user = db.prepare('SELECT id, role_id, is_active FROM users WHERE id = ?').get(uid) as
        | { id: number; role_id: number; is_active: number }
        | undefined;
      if (!user || Number(user.is_active) !== 1 || Number(user.role_id) !== 1) {
        return res.status(403).json({ error: 'صلاحية نشر التحديثات متاحة لمدير النظام فقط' });
      }
      const { version, notes, forceRebuild } = (req.body || {}) as {
        version?: string;
        notes?: string;
        forceRebuild?: boolean;
      };
      publishNewMasterUpdate({ version, notes, forceRebuild: forceRebuild !== false });
      const origin = resolvePublicUpdateOrigin(req);
      const manifest = getMasterUpdateManifest(origin);
      res.json({ ok: true, manifest });
    } catch (err: unknown) {
      res.status(500).json({ error: (err as Error).message || 'تعذر بناء ونشر التحديث الجديد' });
    }
  });

  // Safe client desktop package downloads (no owner vault / private keys)
  app.get('/api/desktop/download-setup-exe', (req, res) => {
    const industryId = sanitizeMinaIndustryId(req.query.industry as string | undefined);
    const layoutId = sanitizeMinaLayoutId(req.query.layout as string | undefined);
    const themeId = sanitizeMinaThemeId(req.query.theme as string | undefined);
    const origin = resolvePublicUpdateOrigin(req);
    const buf = buildMinaNetSetupExe(themeId, layoutId, industryId, origin);
    res.setHeader('Content-Disposition', `attachment; filename="MINA_NET_SETUP.exe"`);
    res.setHeader('Content-Type', 'application/vnd.microsoft.portable-executable');
    res.send(buf);
  });

  app.get('/api/desktop/download-zip', (req, res) => {
    const industryId = sanitizeMinaIndustryId(req.query.industry as string | undefined);
    const layoutId = sanitizeMinaLayoutId(req.query.layout as string | undefined);
    const themeId = sanitizeMinaThemeId(req.query.theme as string | undefined);
    const origin = resolvePublicUpdateOrigin(req);
    const buf = buildCleanClientErpZip(themeId, layoutId, industryId, origin);
    res.setHeader('Content-Disposition', `attachment; filename="MINA_NET_ERP_${industryId}_${layoutId}.zip"`);
    res.setHeader('Content-Type', 'application/zip');
    res.send(buf);
  });

  app.get('/api/desktop/download-direct-html', (req, res) => {
    const industryId = sanitizeMinaIndustryId(req.query.industry as string | undefined);
    const layoutId = sanitizeMinaLayoutId(req.query.layout as string | undefined);
    const themeId = sanitizeMinaThemeId(req.query.theme as string | undefined);
    const directHtmlPath = compileHardenedDirectHtml(false, themeId, layoutId, industryId);
    if (!fs.existsSync(directHtmlPath)) {
      return res.status(404).json({ error: 'ملف التشغيل المباشر غير مبني بعد' });
    }
    const origin = resolvePublicUpdateOrigin(req).replace(/"/g, '&quot;');
    let html = fs.readFileSync(directHtmlPath, 'utf-8');
    if (html.includes('name="mina-update-url"')) {
      html = html.replace(/<meta\s+name="mina-update-url"\s+content="[^"]*"\s*\/?>/i, `<meta name="mina-update-url" content="${origin}" />`);
    } else {
      html = html.replace(/<\/head>/i, `<meta name="mina-update-url" content="${origin}" />\n</head>`);
    }
    res.setHeader('Content-Disposition', `attachment; filename="MINA_NET_DIRECT_${industryId}_${layoutId}.html"`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  });

  // Isolated Owner License Manager API (only for the standalone /license-manager tool or standalone port 3099)
  app.use('/api/license-manager', createLicenseManagerRouter());

  // Vite middleware in development, static files in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'spa',
    });

    app.get(['/license-manager', '/license-manager/'], async (req, res, next) => {
      try {
        const htmlPath = path.resolve(process.cwd(), 'license-manager.html');
        const template = fs.readFileSync(htmlPath, 'utf-8');
        const transformed = await vite.transformIndexHtml('/license-manager.html', template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (err) {
        next(err);
      }
    });

    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.get(['/license-manager', '/license-manager/', '/license-manager.html'], (_req, res) => {
      res.sendFile(path.join(distDir, 'license-manager.html'));
    });
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Mina Net ERP server running at http://localhost:${PORT}`);
    console.log(`Standalone License Tool endpoint: http://localhost:${PORT}/license-manager (or run 'npm run license-tool' for independent port 3099)`);
  });
}

startServer();
