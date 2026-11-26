import { ensureGlobalBuffer } from './bufferShim.ts';
import { dispatchRouters, type MiniRouter, type ShimResponse } from './expressShim.ts';
import { readVirtualFileNormalized } from './fsAndPathShim.ts';
import { initDesktopDb, persistDesktopDb } from './browserDb.ts';

let readyPromise: Promise<MiniRouter[]> | null = null;

async function bootRouters(): Promise<MiniRouter[]> {
  if (!readyPromise) {
    readyPromise = (async () => {
      ensureGlobalBuffer();
      await initDesktopDb();
      const [{ createErpRouter }, { createImportAndReportRouter }] = await Promise.all([
        import('../../server/erpRoutes.ts'),
        import('../../server/importAndReportRoutes.ts'),
      ]);
      return [
        createErpRouter() as unknown as MiniRouter,
        createImportAndReportRouter() as unknown as MiniRouter,
      ];
    })();
  }
  return readyPromise;
}

export async function dispatchLocalApi(url: string, options: RequestInit = {}): Promise<ShimResponse> {
  const routers = await bootRouters();
  const method = (options.method || 'GET').toUpperCase();
  const [rawPath, rawQuery] = url.split('?');
  const apiPath = rawPath.startsWith('/api') ? rawPath.slice(4) || '/' : rawPath;
  const query: Record<string, string> = {};
  if (rawQuery) {
    const sp = new URLSearchParams(rawQuery);
    sp.forEach((v, k) => {
      query[k] = v;
    });
  }

  let parsedBody: unknown = {};
  if (typeof options.body === 'string' && options.body.trim()) {
    try {
      parsedBody = JSON.parse(options.body);
    } catch {
      parsedBody = options.body;
    }
  } else if (options.body && typeof options.body === 'object') {
    parsedBody = options.body;
  }

  const headers: Record<string, string> = {};
  if (options.headers) {
    const h = options.headers as Record<string, string>;
    for (const [k, v] of Object.entries(h)) {
      headers[k.toLowerCase()] = String(v);
    }
  }

  const res = await dispatchRouters(
    routers,
    method,
    apiPath,
    query,
    parsedBody,
    headers,
    (p) => readVirtualFileNormalized(p)
  );

  if (method !== 'GET') {
    await persistDesktopDb();
  }
  return res;
}
