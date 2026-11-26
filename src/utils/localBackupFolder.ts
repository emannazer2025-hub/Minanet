import { apiFetch, fetchApiBinaryBytes, isDirectDesktopMode } from '../api.ts';
import { getLocalDateString, getLocalTimeHHMM } from '../../shared/dbSchema.ts';

const HANDLE_DB_NAME = 'MinaNetBackupHandlesDB';
const HANDLE_STORE = 'handles';
const HANDLE_KEY = 'daily_backup_folder';
const LOCAL_FOLDER_LAST_DATE_KEY = 'mina_net_local_folder_backup_last_date';

interface DirHandleWithPerms extends FileSystemDirectoryHandle {
  queryPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
  requestPermission?: (desc: { mode: 'read' | 'readwrite' }) => Promise<'granted' | 'denied' | 'prompt'>;
}

function openHandleDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(HANDLE_DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(HANDLE_STORE)) {
        req.result.createObjectStore(HANDLE_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function loadSavedHandle(): Promise<DirHandleWithPerms | null> {
  try {
    const db = await openHandleDb();
    return await new Promise((resolve) => {
      const tx = db.transaction(HANDLE_STORE, 'readonly');
      const getReq = tx.objectStore(HANDLE_STORE).get(HANDLE_KEY);
      getReq.onsuccess = () => resolve((getReq.result as DirHandleWithPerms) || null);
      getReq.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function saveHandle(handle: DirHandleWithPerms | null): Promise<void> {
  const db = await openHandleDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(HANDLE_STORE, 'readwrite');
    if (handle) {
      tx.objectStore(HANDLE_STORE).put(handle, HANDLE_KEY);
    } else {
      tx.objectStore(HANDLE_STORE).delete(HANDLE_KEY);
    }
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function isDirectoryPickerSupported(): boolean {
  return typeof window !== 'undefined' && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';
}

export async function pickLocalBackupDirectory(): Promise<{ ok: boolean; name?: string; error?: string }> {
  const picker = (window as unknown as { showDirectoryPicker?: (opts: unknown) => Promise<DirHandleWithPerms> }).showDirectoryPicker;
  if (!picker) {
    return {
      ok: false,
      error: 'اختيار المجلد المباشر غير مدعوم في هذا المتصفح؛ يمكنك كتابة مسار المجلد مباشرة أو استخدام نسخة الكمبيوتر.',
    };
  }
  try {
    const handle = await picker({ id: 'mina-net-daily-backups', mode: 'readwrite' });
    if (handle.requestPermission) {
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        return { ok: false, error: 'لم يتم منح صلاحية الكتابة في المجلد المحدد.' };
      }
    }
    await saveHandle(handle);
    return { ok: true, name: handle.name };
  } catch (err: unknown) {
    const e = err as { name?: string; message?: string };
    if (e?.name === 'AbortError') {
      return { ok: false };
    }
    return {
      ok: false,
      error:
        'تعذر فتح نافذة اختيار المجلد داخل إطار المعاينة؛ افتح البرنامج في تبويب مستقل أو بنسخة الكمبيوتر، أو اكتب مسار المجلد مباشرة.',
    };
  }
}

export async function getSavedLocalBackupDirectoryName(): Promise<string | null> {
  const handle = await loadSavedHandle();
  return handle?.name || null;
}

export async function getLocalBackupFolderState(): Promise<{ name: string | null; needsPermission: boolean }> {
  const handle = await loadSavedHandle();
  if (!handle) return { name: null, needsPermission: false };
  try {
    if (handle.queryPermission) {
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      return { name: handle.name || null, needsPermission: perm !== 'granted' };
    }
    return { name: handle.name || null, needsPermission: false };
  } catch {
    return { name: handle.name || null, needsPermission: true };
  }
}

export async function requestLocalBackupDirectoryPermission(): Promise<boolean> {
  try {
    const handle = await loadSavedHandle();
    if (!handle) return false;
    if (handle.requestPermission) {
      const perm = await handle.requestPermission({ mode: 'readwrite' });
      return perm === 'granted';
    }
    return true;
  } catch {
    return false;
  }
}

export async function clearSavedLocalBackupDirectory(): Promise<void> {
  await saveHandle(null);
}

export async function writeBackupToSavedLocalDirectory(
  filename: string,
  requestPermissionOnGesture = false
): Promise<boolean> {
  try {
    const handle = await loadSavedHandle();
    if (!handle) return false;
    if (handle.queryPermission) {
      let perm = await handle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted' && requestPermissionOnGesture && handle.requestPermission) {
        perm = await handle.requestPermission({ mode: 'readwrite' });
      }
      if (perm !== 'granted') return false;
    }
    const bytes = await fetchApiBinaryBytes(`/api/backup/download/${encodeURIComponent(filename)}`);
    const fileHandle = await handle.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(new Uint8Array(bytes));
    await writable.close();
    return true;
  } catch {
    return false;
  }
}

let clientSchedulerBusy = false;

export async function runClientScheduledBackupIfDue(
  settings: Record<string, string>,
  onBackupCreated?: () => void
): Promise<string | null> {
  if (clientSchedulerBusy) return null;
  if (settings.auto_backup_enabled !== '1') return null;

  const scheduledTime = (settings.auto_backup_time || '23:00').trim();
  const now = new Date();
  const today = getLocalDateString(now);
  const nowHHMM = getLocalTimeHHMM(now);

  if (nowHHMM < scheduledTime) return null;

  clientSchedulerBusy = true;
  try {
    // 1) In Direct Desktop mode (no Node server background loop), create scheduled backup in virtual DB & update last_date
    if (isDirectDesktopMode()) {
      if ((settings.auto_backup_last_date || '').trim() === today) return null;
      const created = await apiFetch<{ filename: string }>('/api/backup/create', { method: 'POST' });
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({ auto_backup_last_date: today }),
      });
      await writeBackupToSavedLocalDirectory(created.filename, false);
      localStorage.setItem(LOCAL_FOLDER_LAST_DATE_KEY, today);
      onBackupCreated?.();
      return created.filename;
    }

    // 2) In Server/Web mode, if the user also picked a local PC folder in browser, mirror today's backup there silently
    const handle = await loadSavedHandle();
    if (handle && localStorage.getItem(LOCAL_FOLDER_LAST_DATE_KEY) !== today) {
      const list = await apiFetch<Array<{ filename: string }>>('/api/backup/list');
      const todayPrefix = `${today}_`;
      const existingToday = list.find((f) => f.filename.startsWith(todayPrefix));
      const targetFilename =
        existingToday?.filename || (await apiFetch<{ filename: string }>('/api/backup/create', { method: 'POST' })).filename;
      const wrote = await writeBackupToSavedLocalDirectory(targetFilename);
      if (wrote) {
        localStorage.setItem(LOCAL_FOLDER_LAST_DATE_KEY, today);
      }
      onBackupCreated?.();
      return targetFilename;
    }

    return null;
  } catch {
    return null;
  } finally {
    clientSchedulerBusy = false;
  }
}
