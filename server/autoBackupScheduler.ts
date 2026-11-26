import path from 'path';
import { getDb, getBackupsDir } from './db.ts';
import {
  formatBackupDateTimeFilename,
  getLocalDateString,
  getLocalTimeHHMM,
} from '../shared/dbSchema.ts';

let isAutoBackupRunning = false;
let schedulerTimer: NodeJS.Timeout | null = null;

export async function runScheduledAutoBackupIfDue(): Promise<string | null> {
  if (isAutoBackupRunning) return null;
  isAutoBackupRunning = true;
  try {
    const db = getDb();
    const rows = db
      .prepare(
        "SELECT key, value FROM settings WHERE key IN ('auto_backup_enabled', 'auto_backup_time', 'auto_backup_last_date')"
      )
      .all() as Array<{ key: string; value: string }>;
    const map = new Map(rows.map((r) => [r.key, r.value]));

    if (map.get('auto_backup_enabled') !== '1') return null;

    const scheduledTime = (map.get('auto_backup_time') || '23:00').trim();
    const lastDate = (map.get('auto_backup_last_date') || '').trim();
    const now = new Date();
    const today = getLocalDateString(now);
    const nowHHMM = getLocalTimeHHMM(now);

    if (lastDate === today) return null;
    if (nowHHMM < scheduledTime) return null;

    const dir = getBackupsDir();
    const filename = formatBackupDateTimeFilename(now);
    const destPath = path.join(dir, filename);

    await db.backup(destPath);

    db.prepare(
      'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
    ).run('auto_backup_last_date', today);

    db.prepare(
      `INSERT INTO audit_logs (user_id, username, action, entity_type, entity_id, doc_number, notes)
       VALUES (1, 'System', 'AUTO_BACKUP', 'DATABASE', ?, ?, ?)`
    ).run(filename, filename, `نسخ احتياطي يومي تلقائي في المجلد: ${dir}`);

    return filename;
  } catch (err) {
    console.error('Scheduled auto backup warning:', err);
    return null;
  } finally {
    isAutoBackupRunning = false;
  }
}

export function startAutoBackupScheduler() {
  void runScheduledAutoBackupIfDue();
  if (!schedulerTimer) {
    schedulerTimer = setInterval(() => {
      void runScheduledAutoBackupIfDue();
    }, 20_000);
    schedulerTimer.unref?.();
  }
}
