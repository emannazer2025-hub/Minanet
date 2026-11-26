import express from 'express';
import fs from 'fs';
import http from 'http';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createLicenseManagerRouter } from '../server/licenseManagerRouter.ts';
import { getOwnerRegistryDb, getOrCreateOwnerVault } from '../server/licenseCrypto.ts';

async function startStandaloneLicenseTool() {
  try {
    const toolRoot = path.resolve(import.meta.dirname, '..');
    if (process.cwd() !== toolRoot && fs.existsSync(path.join(toolRoot, 'package.json'))) {
      process.chdir(toolRoot);
    }
  } catch {
    // ignore chdir errors
  }

  const app = express();
  const httpServer = http.createServer(app);
  const PORT = Number(process.env.LICENSE_TOOL_PORT || 3099);

  app.use(express.json({ limit: '10mb' }));

  // Initialize independent owner vault & registry DB (zero touch to ERP database)
  getOrCreateOwnerVault();
  getOwnerRegistryDb();

  // Standalone Owner Licensing API
  app.use('/api/license-manager', createLicenseManagerRouter());

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        ws: { server: httpServer },
        hmr: process.env.DISABLE_HMR === 'true' ? false : undefined,
      },
      appType: 'custom',
    });
    app.use(vite.middlewares);

    app.get('*', async (req, res, next) => {
      try {
        const htmlPath = path.resolve(process.cwd(), 'license-manager.html');
        const template = fs.readFileSync(htmlPath, 'utf-8');
        const transformed = await vite.transformIndexHtml(req.originalUrl, template);
        res.status(200).set({ 'Content-Type': 'text/html' }).end(transformed);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'license-manager.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Mina Net License Manager (Standalone Owner Tool) running at http://localhost:${PORT}`);
  });
}

startStandaloneLicenseTool();
