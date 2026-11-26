// Virtual in-browser filesystem shim with IndexedDB persistence for /backups/*.db in standalone direct HTML mode
const virtualFiles = new Map<string, { data: Uint8Array; mtime: Date }>();

const VFS_IDB_NAME = 'MinaNetVirtualBackupsDB';
const VFS_IDB_STORE = 'backup_files';
let persistedLoaded = false;

function normalizeVPath(p: string): string {
  const clean = String(p || '').replace(/\\/g, '/').replace(/\/+/g, '/');
  if (!clean) return '/';
  const withLead = clean.startsWith('/') ? clean : `/${clean}`;
  return withLead.length > 1 && withLead.endsWith('/') ? withLead.slice(0, -1) : withLead;
}

function isPersistentBackupPath(normPath: string): boolean {
  return normPath.startsWith('/backups/') && normPath.endsWith('.db') && !normPath.includes('/TEMP_UPLOAD_');
}

function openVfsIdb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(VFS_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(VFS_IDB_STORE)) {
        req.result.createObjectStore(VFS_IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function saveVirtualBackupToIdb(normPath: string, data: Uint8Array, mtime: Date): void {
  if (!isPersistentBackupPath(normPath) || typeof indexedDB === 'undefined') return;
  void openVfsIdb()
    .then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(VFS_IDB_STORE, 'readwrite');
          tx.objectStore(VFS_IDB_STORE).put({ data: new Uint8Array(data), mtime: mtime.toISOString() }, normPath);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        })
    )
    .catch(() => {
      // ignore IndexedDB quota errors
    });
}

function deleteVirtualBackupFromIdb(normPath: string): void {
  if (!isPersistentBackupPath(normPath) || typeof indexedDB === 'undefined') return;
  void openVfsIdb()
    .then(
      (db) =>
        new Promise<void>((resolve, reject) => {
          const tx = db.transaction(VFS_IDB_STORE, 'readwrite');
          tx.objectStore(VFS_IDB_STORE).delete(normPath);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        })
    )
    .catch(() => {
      // ignore
    });
}

export async function loadPersistedVirtualBackups(): Promise<void> {
  if (persistedLoaded || typeof indexedDB === 'undefined') return;
  persistedLoaded = true;
  try {
    const db = await openVfsIdb();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(VFS_IDB_STORE, 'readonly');
      const store = tx.objectStore(VFS_IDB_STORE);
      const keysReq = store.getAllKeys();
      keysReq.onsuccess = () => {
        const keys = (keysReq.result || []) as string[];
        if (keys.length === 0) {
          resolve();
          return;
        }
        let pending = keys.length;
        for (const k of keys) {
          const getReq = store.get(k);
          getReq.onsuccess = () => {
            const val = getReq.result as { data?: Uint8Array; mtime?: string } | undefined;
            if (val?.data) {
              const norm = normalizeVPath(String(k));
              if (!virtualFiles.has(norm)) {
                virtualFiles.set(norm, {
                  data: new Uint8Array(val.data),
                  mtime: val.mtime ? new Date(val.mtime) : new Date(),
                });
              }
            }
            if (--pending <= 0) resolve();
          };
          getReq.onerror = () => {
            if (--pending <= 0) resolve();
          };
        }
      };
      keysReq.onerror = () => resolve();
    });
  } catch {
    // ignore IDB failures
  }
}

export function getVirtualFileMap() {
  return virtualFiles;
}

export function readVirtualFileNormalized(p: string): Uint8Array {
  const entry = virtualFiles.get(normalizeVPath(p));
  return entry?.data || new Uint8Array();
}

const pathShim = {
  resolve: (...parts: string[]) => normalizeVPath(parts.join('/')),
  join: (...parts: string[]) => normalizeVPath(parts.join('/')),
  basename: (p: string) => p.split(/[/\\]/).pop() || p,
};

const fsShim = {
  existsSync: (p: string) => {
    const norm = normalizeVPath(p);
    return virtualFiles.has(norm) || norm === '/backups' || norm === '/data';
  },
  mkdirSync: (_p: string, _opts?: unknown) => {},
  readdirSync: (dir: string): string[] => {
    const normDir = normalizeVPath(dir);
    const prefix = normDir === '/' ? '/' : `${normDir}/`;
    const names: string[] = [];
    for (const k of virtualFiles.keys()) {
      if (k.startsWith(prefix)) {
        names.push(k.slice(prefix.length));
      }
    }
    return names;
  },
  statSync: (p: string) => {
    const entry = virtualFiles.get(normalizeVPath(p));
    const mtime = entry?.mtime || new Date();
    return { size: entry?.data.byteLength || 0, mtime, birthtime: mtime };
  },
  writeFileSync: (p: string, data: Uint8Array | string) => {
    const norm = normalizeVPath(p);
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data);
    const mtime = new Date();
    virtualFiles.set(norm, { data: bytes, mtime });
    saveVirtualBackupToIdb(norm, bytes, mtime);
  },
  readFileSync: (p: string) => {
    const norm = normalizeVPath(p);
    const entry = virtualFiles.get(norm);
    if (!entry) throw new Error(`ENOENT: ${norm}`);
    const B = (globalThis as Record<string, unknown>).Buffer as { from: (u: Uint8Array) => Uint8Array };
    return B ? B.from(entry.data) : entry.data;
  },
  copyFileSync: (src: string, dest: string) => {
    const normSrc = normalizeVPath(src);
    const normDest = normalizeVPath(dest);
    const entry = virtualFiles.get(normSrc);
    if (entry) {
      const mtime = new Date();
      const copy = new Uint8Array(entry.data);
      virtualFiles.set(normDest, { data: copy, mtime });
      saveVirtualBackupToIdb(normDest, copy, mtime);
    }
  },
  unlinkSync: (p: string) => {
    const norm = normalizeVPath(p);
    virtualFiles.delete(norm);
    deleteVirtualBackupFromIdb(norm);
  },
};

export default fsShim;
export const existsSync = fsShim.existsSync;
export const mkdirSync = fsShim.mkdirSync;
export const readdirSync = fsShim.readdirSync;
export const statSync = fsShim.statSync;
export const writeFileSync = fsShim.writeFileSync;
export const readFileSync = fsShim.readFileSync;
export const copyFileSync = fsShim.copyFileSync;
export const unlinkSync = fsShim.unlinkSync;
export const resolve = pathShim.resolve;
export const join = pathShim.join;
export const basename = pathShim.basename;
export { pathShim };
