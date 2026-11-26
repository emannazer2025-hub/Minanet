// Browser path shim for Direct Desktop HTML mode
function normalizeSlashes(p: string): string {
  return String(p || '').replace(/\\/g, '/').replace(/\/+/g, '/');
}

export function join(...parts: string[]): string {
  const joined = normalizeSlashes(parts.filter((p) => p !== undefined && p !== null && p !== '').join('/'));
  if (!joined) return '.';
  return joined.length > 1 && joined.endsWith('/') ? joined.slice(0, -1) : joined;
}

export function resolve(...parts: string[]): string {
  const joined = join(...parts);
  return joined.startsWith('/') ? joined : `/${joined}`;
}

export function basename(p: string, ext?: string): string {
  const clean = normalizeSlashes(p).replace(/\/+$/, '');
  const base = clean.split('/').pop() || clean;
  if (ext && base.endsWith(ext)) {
    return base.slice(0, -ext.length);
  }
  return base;
}

export function dirname(p: string): string {
  const clean = normalizeSlashes(p).replace(/\/+$/, '');
  const idx = clean.lastIndexOf('/');
  if (idx < 0) return '.';
  if (idx === 0) return '/';
  return clean.slice(0, idx);
}

export function extname(p: string): string {
  const base = basename(p);
  const idx = base.lastIndexOf('.');
  return idx > 0 ? base.slice(idx) : '';
}

export function isAbsolute(p: string): boolean {
  const clean = normalizeSlashes(p);
  return clean.startsWith('/') || /^[A-Za-z]:\//.test(clean);
}

const pathShim = {
  join,
  resolve,
  basename,
  dirname,
  extname,
  isAbsolute,
  sep: '/',
};

export default pathShim;
