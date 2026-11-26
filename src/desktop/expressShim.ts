// Minimal Express Router shim enabling server/erpRoutes.ts and server/importAndReportRoutes.ts to run in-browser
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface ShimRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string>;
}

export interface ShimResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: unknown;
  downloadName?: string;
  status: (code: number) => ShimResponse;
  setHeader: (k: string, v: string) => void;
  json: (data: unknown) => void;
  send: (data: unknown) => void;
  download: (filePath: string, filename?: string) => void;
}

type Handler = (req: ShimRequest, res: ShimResponse, next: (err?: unknown) => void) => unknown;

interface RouteEntry {
  method: Method;
  pattern: string;
  regex: RegExp;
  paramNames: string[];
  handlers: Handler[];
}

function compilePattern(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const escaped = pattern.replace(/:([a-zA-Z0-9_]+)/g, (_m, name) => {
    paramNames.push(name);
    return '([^/]+)';
  });
  return {
    regex: new RegExp(`^${escaped}$`),
    paramNames,
  };
}

export class MiniRouter {
  routes: RouteEntry[] = [];

  private add(method: Method, pattern: string, handlers: Handler[]) {
    const { regex, paramNames } = compilePattern(pattern);
    this.routes.push({ method, pattern, regex, paramNames, handlers });
  }

  get(pattern: string, ...handlers: Handler[]) {
    this.add('GET', pattern, handlers);
  }
  post(pattern: string, ...handlers: Handler[]) {
    this.add('POST', pattern, handlers);
  }
  put(pattern: string, ...handlers: Handler[]) {
    this.add('PUT', pattern, handlers);
  }
  patch(pattern: string, ...handlers: Handler[]) {
    this.add('PATCH', pattern, handlers);
  }
  delete(pattern: string, ...handlers: Handler[]) {
    this.add('DELETE', pattern, handlers);
  }
}

export async function dispatchRouters(
  routers: MiniRouter[],
  method: string,
  urlPath: string,
  query: Record<string, string>,
  body: unknown,
  headers: Record<string, string>,
  virtualReadFile?: (path: string) => Uint8Array
): Promise<ShimResponse> {
  const upper = method.toUpperCase() as Method;
  const res: ShimResponse = {
    statusCode: 200,
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: null,
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    setHeader(k: string, v: string) {
      this.headers[k.toLowerCase()] = v;
    },
    json(data: unknown) {
      this.headers['content-type'] = 'application/json; charset=utf-8';
      this.body = data;
    },
    send(data: unknown) {
      this.body = data;
    },
    download(filePath: string, filename?: string) {
      this.downloadName = filename || filePath.split(/[/\\]/).pop() || 'backup.db';
      if (virtualReadFile) {
        this.body = virtualReadFile(filePath);
      }
      this.headers['content-type'] = 'application/octet-stream';
    },
  };

  for (const router of routers) {
    for (const route of router.routes) {
      if (route.method !== upper) continue;
      const m = urlPath.match(route.regex);
      if (!m) continue;
      const params: Record<string, string> = {};
      route.paramNames.forEach((name, idx) => {
        params[name] = decodeURIComponent(m[idx + 1] || '');
      });
      const req: ShimRequest = {
        method: upper,
        path: urlPath,
        params,
        query,
        body: (body && typeof body === 'object' ? body : {}) as Record<string, unknown>,
        headers,
      };
      let idx = 0;
      let stopped = false;
      const next = async (err?: unknown): Promise<void> => {
        if (err) {
          res.status(500).json({ error: String((err as Error)?.message || err) });
          stopped = true;
          return;
        }
        const h = route.handlers[idx++];
        if (!h || stopped) return;
        let calledNext = false;
        await h(req, res, async (e?: unknown) => {
          calledNext = true;
          await next(e);
        });
        if (!calledNext) {
          stopped = true;
        }
      };
      await next();
      return res;
    }
  }

  res.status(404).json({ error: `Route not found: ${upper} ${urlPath}` });
  return res;
}

const expressDefault = {
  Router: () => new MiniRouter(),
};

export default expressDefault;
export const Router = expressDefault.Router;
