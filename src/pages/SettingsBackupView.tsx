import React, { useEffect, useState } from 'react';
import {
  Save,
  DatabaseBackup,
  Download,
  Upload,
  KeyRound,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  FolderOpen,
  Clock,
  X,
  RefreshCw,
  CloudDownload,
  Server,
  MessageCircle,
  Printer,
  Monitor,
  ScanBarcode,
  Usb,
  QrCode,
  Image as ImageIcon,
  Plus,
  Video,
  ExternalLink,
  Coins,
} from 'lucide-react';
import { apiFetch, downloadApiFile, isDirectDesktopMode } from '../api.ts';
import type { LicenseState, PromoSlide, SettingsSubTab, UpdateReleaseManifest, UpdateStatusResponse } from '../types.ts';
import { isClientDesktopPackage } from '../themes.ts';
import {
  clearSavedLocalBackupDirectory,
  getLocalBackupFolderState,
  isDirectoryPickerSupported,
  pickLocalBackupDirectory,
  requestLocalBackupDirectoryPermission,
  writeBackupToSavedLocalDirectory,
} from '../utils/localBackupFolder.ts';
import {
  connectSerialBarcodeScanner,
  connectSerialPrinter,
  connectUsbPrinter,
  fetchInstalledWindowsPrinters,
  generateQrDataUrl,
  playPosBeep,
  triggerCashDrawer,
} from '../utils/posHardware.ts';
import {
  detectSecondaryScreen,
  getDefaultPromoSlides,
  openCustomerDisplayWindow,
  parsePromoSlides,
  publishCustomerDisplayState,
} from '../utils/customerDisplaySync.ts';

interface SettingsBackupViewProps {
  settings: Record<string, string>;
  license: LicenseState;
  onRefreshBootstrap: () => void;
  initialTab?: SettingsSubTab;
}

function suggestNextPatchVersion(ver: string): string {
  const parts = String(ver || '1.0.0')
    .trim()
    .split('.')
    .map((p) => Number.parseInt(p, 10));
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n) || n < 0)) return '1.0.1';
  return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
}

function getDirectDefaultUpdateUrl(): string {
  try {
    const saved = localStorage.getItem('mina_net_update_url');
    if (saved) return saved;
    const meta = document.querySelector('meta[name="mina-update-url"]')?.getAttribute('content');
    if (meta) return meta;
  } catch {
    // ignore
  }
  return 'https://ais-pre-li3xayi7s4u2zgsr4pym46-33756488626.europe-west2.run.app';
}

export const SettingsBackupView: React.FC<SettingsBackupViewProps> = ({
  settings,
  license,
  onRefreshBootstrap,
  initialTab = 'company',
}) => {
  const hideDesktopDownloadUi = isClientDesktopPackage();
  const isDirectMode = isDirectDesktopMode();
  const [tab, setTab] = useState<SettingsSubTab>(initialTab);
  const [form, setForm] = useState<Record<string, string>>(settings);
  const [backups, setBackups] = useState<Array<{ filename: string; sizeBytes: number; createdAt: string }>>([]);
  const [effectiveBackupDir, setEffectiveBackupDir] = useState('');
  const [localFolderName, setLocalFolderName] = useState<string | null>(null);
  const [localFolderNeedsPermission, setLocalFolderNeedsPermission] = useState(false);
  const [activationInput, setActivationInput] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  // Updates tab state
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusResponse | null>(null);
  const [updateUrlInput, setUpdateUrlInput] = useState('');
  const [directRemoteManifest, setDirectRemoteManifest] = useState<UpdateReleaseManifest | null>(null);
  const [publishVersion, setPublishVersion] = useState('');
  const [publishNotes, setPublishNotes] = useState('');
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [applyingUpdate, setApplyingUpdate] = useState(false);
  const [publishingUpdate, setPublishingUpdate] = useState(false);
  const [restartingAfterUpdate, setRestartingAfterUpdate] = useState(false);

  // POS Hardware & Customer Display state
  const [winPrinters, setWinPrinters] = useState<Array<{ Name: string; DriverName?: string; PortName?: string }>>([]);
  const [loadingPrinters, setLoadingPrinters] = useState(false);
  const [hardwareBusy, setHardwareBusy] = useState(false);
  const [lastSerialScan, setLastSerialScan] = useState('');
  const [qrPreviewUrl, setQrPreviewUrl] = useState('');
  const [secondScreenDetected, setSecondScreenDetected] = useState<boolean | null>(null);
  const [newSlideTitle, setNewSlideTitle] = useState('');
  const [newSlideSubtitle, setNewSlideSubtitle] = useState('');
  const [newSlideBadge, setNewSlideBadge] = useState('عرض خاص');
  const [newSlideMediaType, setNewSlideMediaType] = useState<'image' | 'video'>('image');
  const [newSlideMediaUrl, setNewSlideMediaUrl] = useState('');

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  useEffect(() => {
    let active = true;
    const val = (form.customer_display_qr_value || '').trim();
    if (!val) {
      setQrPreviewUrl('');
      return;
    }
    void generateQrDataUrl(val, 140).then((url) => {
      if (active) setQrPreviewUrl(url);
    });
    return () => {
      active = false;
    };
  }, [form.customer_display_qr_value]);

  useEffect(() => {
    if (tab !== 'hardware') return;
    let active = true;
    setLoadingPrinters(true);
    void fetchInstalledWindowsPrinters().then((list) => {
      if (active) {
        setWinPrinters(list);
        setLoadingPrinters(false);
      }
    });
    void detectSecondaryScreen().then((info) => {
      if (active) setSecondScreenDetected(info.hasExtendedScreen);
    });
    return () => {
      active = false;
    };
  }, [tab]);

  const loadBackups = async () => {
    try {
      const [list, info, folderState] = await Promise.all([
        apiFetch<Array<{ filename: string; sizeBytes: number; createdAt: string }>>('/api/backup/list'),
        apiFetch<{ effectiveDir: string }>('/api/backup/info').catch(() => ({ effectiveDir: '' })),
        getLocalBackupFolderState(),
      ]);
      setBackups(list);
      if (info?.effectiveDir) setEffectiveBackupDir(info.effectiveDir);
      setLocalFolderName(folderState.name);
      setLocalFolderNeedsPermission(folderState.needsPermission);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadBackups();
  }, []);

  const loadUpdateStatus = async (checkRemote = false, customServerUrl?: string) => {
    if (isDirectMode) {
      const targetUrl = (customServerUrl ?? (updateUrlInput || getDirectDefaultUpdateUrl())).trim().replace(/\/+$/, '');
      if (!updateUrlInput) setUpdateUrlInput(targetUrl);
      if (checkRemote) {
        setCheckingUpdate(true);
        setError('');
        setMsg('');
        try {
          try {
            localStorage.setItem('mina_net_update_url', targetUrl);
          } catch {
            // ignore
          }
          const resp = await fetch(`${targetUrl}/api/updates/manifest`, { cache: 'no-store' });
          if (!resp.ok) throw new Error(`تعذر الوصول إلى السيرفر (${resp.status})`);
          const manifest = (await resp.json()) as UpdateReleaseManifest;
          setDirectRemoteManifest(manifest);
          setMsg(`تم الاتصال بالسيرفر الرئيسي بنجاح. أحدث إصدار متاح: ${manifest.version}`);
        } catch (err: unknown) {
          setError((err as Error).message || 'تعذر الاتصال بسيرفر التحديثات الرئيسي');
        } finally {
          setCheckingUpdate(false);
        }
      }
      return;
    }

    if (checkRemote) setCheckingUpdate(true);
    try {
      const qs = checkRemote
        ? `?check=1${customServerUrl ? `&serverUrl=${encodeURIComponent(customServerUrl)}` : ''}`
        : '';
      const data = await apiFetch<UpdateStatusResponse>(`/api/updates/status${qs}`);
      setUpdateStatus(data);
      if (data.mode === 'client' && data.config?.updateServerUrl) {
        setUpdateUrlInput(data.config.updateServerUrl);
      } else if (data.mode === 'master' && data.manifest) {
        setPublishVersion((prev) => prev || suggestNextPatchVersion(data.manifest!.version));
      }
      if (checkRemote) {
        if (data.checkError) {
          setError(data.checkError);
        } else if (data.hasUpdate && data.remoteManifest) {
          setMsg(`يوجد تحديث جديد متاح (${data.remoteManifest.version}) جاهز للتنزيل والفرد الآن.`);
        } else {
          setMsg('برنامجك يعمل بالفعل على أحدث إصدار متاح.');
        }
      }
    } catch (err: unknown) {
      if (checkRemote) setError((err as Error).message);
    } finally {
      if (checkRemote) setCheckingUpdate(false);
    }
  };

  useEffect(() => {
    if (tab === 'updates') {
      void loadUpdateStatus(false);
    }
  }, [tab]);

  const pollRestartAndReload = () => {
    setRestartingAfterUpdate(true);
    let attempts = 0;
    const timer = window.setInterval(async () => {
      attempts++;
      try {
        const res = await fetch('/api/bootstrap', { cache: 'no-store' });
        if (res.ok && attempts >= 2) {
          window.clearInterval(timer);
          window.location.reload();
          return;
        }
      } catch {
        // server restarting
      }
      if (attempts >= 25) {
        window.clearInterval(timer);
        setRestartingAfterUpdate(false);
        setMsg('تم تطبيق التحديث. إذا لم تُعاد الصفحة تلقائياً اضغط زر تحديث المتصفح (F5).');
      }
    }, 1100);
  };

  const handleSaveUpdateUrl = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      if (isDirectMode) {
        const clean = updateUrlInput.trim().replace(/\/+$/, '');
        localStorage.setItem('mina_net_update_url', clean);
        setUpdateUrlInput(clean);
        setMsg('تم حفظ رابط سيرفر التحديثات الرئيسي.');
        return;
      }
      const res = await apiFetch<{ ok: boolean; config: { updateServerUrl: string } }>('/api/updates/config', {
        method: 'PUT',
        body: JSON.stringify({ updateServerUrl: updateUrlInput }),
      });
      setUpdateUrlInput(res.config.updateServerUrl);
      setMsg('تم حفظ رابط سيرفر التحديثات الرئيسي بنجاح.');
      await loadUpdateStatus(false);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const handleApplyRemoteUpdate = async () => {
    setMsg('');
    setError('');
    setApplyingUpdate(true);
    try {
      const res = await apiFetch<{ ok: boolean; restarting: boolean; message: string }>('/api/updates/apply', {
        method: 'POST',
        body: JSON.stringify({ serverUrl: updateUrlInput.trim() || undefined }),
      });
      setMsg(res.message || 'تم تنزيل وفرد التحديث بنجاح، جاري إعادة تشغيل البرنامج...');
      if (res.restarting) {
        pollRestartAndReload();
      }
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setApplyingUpdate(false);
    }
  };

  const handleUploadUpdateZip = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMsg('');
    setError('');
    setApplyingUpdate(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const raw = String(reader.result || '');
        const b64 = raw.includes(',') ? raw.split(',')[1] : raw;
        const res = await apiFetch<{ ok: boolean; restarting: boolean; message: string }>('/api/updates/apply-upload', {
          method: 'POST',
          body: JSON.stringify({ zipBase64: b64 }),
        });
        setMsg(res.message || 'تم فرد ملف التحديث اليدوي بنجاح، جاري إعادة تشغيل البرنامج...');
        if (res.restarting) {
          pollRestartAndReload();
        }
      } catch (err: unknown) {
        setError((err as Error).message);
      } finally {
        setApplyingUpdate(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handlePublishUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setError('');
    setPublishingUpdate(true);
    try {
      const res = await apiFetch<{ ok: boolean; manifest: UpdateReleaseManifest }>('/api/updates/publish', {
        method: 'POST',
        body: JSON.stringify({
          version: publishVersion.trim(),
          notes: publishNotes.trim(),
          forceRebuild: true,
        }),
      });
      setMsg(`تم بناء وتوقيع ونشر التحديث (الإصدار ${res.manifest.version}) بنجاح لجميع أجهزة العملاء!`);
      setPublishVersion(suggestNextPatchVersion(res.manifest.version));
      setPublishNotes('');
      await loadUpdateStatus(false);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setPublishingUpdate(false);
    }
  };

  const saveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      await apiFetch('/api/settings', { method: 'PUT', body: JSON.stringify(form) });
      setMsg('تم حفظ إعدادات المنشأة والنظام بنجاح');
      onRefreshBootstrap();
      loadBackups();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const saveBackupSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setError('');
    try {
      await apiFetch('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          auto_backup_enabled: form.auto_backup_enabled === '1' ? '1' : '0',
          auto_backup_time: form.auto_backup_time || '23:00',
          auto_backup_dir: (form.auto_backup_dir || '').trim(),
        }),
      });
      setMsg('تم حفظ فولدر وميعاد النسخ الاحتياطي التلقائي اليومي بنجاح (يعمل تلقائيًا بدون تأكيد).');
      onRefreshBootstrap();
      await loadBackups();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const handlePickLocalFolder = async () => {
    setMsg('');
    setError('');
    const res = await pickLocalBackupDirectory();
    if (res.ok && res.name) {
      setLocalFolderName(res.name);
      setLocalFolderNeedsPermission(false);
      setMsg(`تم تحديد المجلد "${res.name}" لحفظ النسخ الاحتياطية اليومية تلقائيًا على جهازك بدون تأكيد.`);
    } else if (res.error) {
      setError(res.error);
    }
  };

  const handleGrantLocalFolderPermission = async () => {
    setMsg('');
    setError('');
    const ok = await requestLocalBackupDirectoryPermission();
    setLocalFolderNeedsPermission(!ok);
    if (ok) {
      setMsg('تم تفعيل صلاحية الحفظ في المجلد المحدد بنجاح.');
    } else {
      setError('لم يتم منح صلاحية الكتابة للمجلد؛ يمكنك اختيار المجلد مرة أخرى.');
    }
  };

  const handleClearLocalFolder = async () => {
    await clearSavedLocalBackupDirectory();
    setLocalFolderName(null);
    setLocalFolderNeedsPermission(false);
    setMsg('تم إلغاء ربط المجلد المحلي من المتصفح.');
  };

  const createBackup = async () => {
    setMsg('');
    setError('');
    try {
      const res = await apiFetch<{ filename: string }>('/api/backup/create', { method: 'POST' });
      const copiedToLocal = await writeBackupToSavedLocalDirectory(res.filename, true);
      if (copiedToLocal) {
        setLocalFolderNeedsPermission(false);
      } else if (isDirectDesktopMode()) {
        await downloadApiFile(`/api/backup/download/${encodeURIComponent(res.filename)}`, res.filename);
      }
      setMsg(
        copiedToLocal && localFolderName
          ? `تم إنشاء النسخة الاحتياطية (${res.filename}) وحفظها في المجلد "${localFolderName}" تلقائيًا.`
          : isDirectDesktopMode()
          ? `تم إنشاء النسخة الاحتياطية (${res.filename}) وحفظها داخليًا وتنزيل نسخة على جهازك.`
          : `تم إنشاء النسخة الاحتياطية: ${res.filename}`
      );
      await loadBackups();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const restoreFromList = async (filename: string) => {
    setMsg('');
    setError('');
    try {
      const res = await apiFetch<{ message: string }>('/api/backup/restore', {
        method: 'POST',
        body: JSON.stringify({ filename }),
      });
      setMsg(res.message);
      onRefreshBootstrap();
      await loadBackups();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const restoreFromUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setMsg('');
    setError('');
    const reader = new FileReader();
    reader.onload = async () => {
      const resStr = String(reader.result || '');
      const b64 = resStr.includes(',') ? resStr.split(',')[1] : resStr;
      try {
        const res = await apiFetch<{ message: string }>('/api/backup/restore', {
          method: 'POST',
          body: JSON.stringify({ base64Db: b64 }),
        });
        setMsg(res.message);
        onRefreshBootstrap();
        await loadBackups();
      } catch (err: unknown) {
        setError((err as Error).message);
      }
    };
    reader.readAsDataURL(file);
  };

  const activateLicense = async (inputStr: string) => {
    setMsg('');
    setError('');
    try {
      await apiFetch('/api/license/activate', { method: 'POST', body: JSON.stringify({ activationInput: inputStr }) });
      setMsg('تم تفعيل الترخيص بنجاح! جميع وظائف النظام مفعلة الآن.');
      setActivationInput('');
      onRefreshBootstrap();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const handleLicFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || '');
      activateLicense(txt);
    };
    reader.readAsText(file);
  };

  return (
    <div className="bg-[#ece9d8] text-slate-900">
      {/* Classic Sub-Tabs Strip */}
      <div className="bg-[#d6d2c2] border-b border-[#aca899] px-3 py-2 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => setTab('company')}
          className={`px-3 py-1.5 font-bold border ${tab === 'company' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          بيانات الشركة والنظام
        </button>
        <button
          type="button"
          onClick={() => setTab('hardware')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'hardware' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <Printer className="w-3.5 h-3.5 text-teal-700" /> الأجهزة والطابعات وشاشة العميل
        </button>
        <button
          type="button"
          onClick={() => setTab('backup')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'backup' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <DatabaseBackup className="w-3.5 h-3.5" /> النسخ الاحتياطي والاستعادة
        </button>
        <button
          type="button"
          onClick={() => setTab('license')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'license' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <KeyRound className="w-3.5 h-3.5" /> حالة التجربة والتفعيل
        </button>
        <button
          type="button"
          onClick={() => setTab('updates')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'updates' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <RefreshCw className="w-3.5 h-3.5 text-emerald-700" /> تحديثات البرنامج
        </button>
      </div>

      {error && <div className="m-3 p-2 text-xs bg-red-100 text-red-800 border border-red-400 font-semibold">{error}</div>}
      {msg && <div className="m-3 p-2 text-xs bg-emerald-100 text-emerald-900 border border-emerald-500 font-semibold">{msg}</div>}

      <div className="p-3">
        {/* COMPANY SETTINGS */}
        {tab === 'company' && (
          <form onSubmit={saveSettings} className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-4 text-xs max-w-4xl">
            <h3 className="font-bold text-sm pb-1.5 border-b border-[#aca899]">بيانات المنشأة وتخصيص النظام</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold mb-1">اسم المنشأة / المحل</label>
                <input value={form.company_name || ''} onChange={(e) => setForm({ ...form, company_name: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white" />
              </div>
              <div>
                <label className="block font-bold mb-1">النشاط / الوصف الفرعي</label>
                <input value={form.company_subtitle || ''} onChange={(e) => setForm({ ...form, company_subtitle: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white" />
              </div>
              <div>
                <label className="block font-bold mb-1">الهاتف</label>
                <input value={form.company_phone || ''} onChange={(e) => setForm({ ...form, company_phone: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] font-mono-num bg-white" />
              </div>
              <div>
                <label className="block font-bold mb-1">الرقم الضريبي</label>
                <input value={form.company_tax_no || ''} onChange={(e) => setForm({ ...form, company_tax_no: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] font-mono-num bg-white" />
              </div>
              <div className="md:col-span-2">
                <label className="block font-bold mb-1">العنوان</label>
                <input value={form.company_address || ''} onChange={(e) => setForm({ ...form, company_address: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white" />
              </div>
              <div>
                <label className="block font-bold mb-1">العملة</label>
                <input value={form.currency || 'ج.م.'} onChange={(e) => setForm({ ...form, currency: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white" />
              </div>
              <div>
                <label className="block font-bold mb-1">حجم الطباعة الافتراضي</label>
                <select value={form.default_print_format || '80MM'} onChange={(e) => setForm({ ...form, default_print_format: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                  <option value="80MM">إيصال حراري 80mm</option>
                  <option value="58MM">إيصال حراري صغير 58mm</option>
                  <option value="A4">ورق A4 قياسي</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">نسبة الضريبة %</label>
                <input type="number" step="0.1" value={form.tax_rate || '14'} onChange={(e) => setForm({ ...form, tax_rate: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] font-mono-num bg-white" />
              </div>
              <div className="md:col-span-2 bg-white border border-[#aca899] p-2.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  {form.company_logo ? (
                    <img src={form.company_logo} alt="شعار المحل" className="w-12 h-12 object-contain border border-slate-300 bg-white p-0.5 rounded" />
                  ) : (
                    <div className="w-12 h-12 border border-dashed border-slate-400 bg-slate-50 flex items-center justify-center text-slate-400 rounded">
                      <ImageIcon className="w-5 h-5" />
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-slate-900">شعار / لوجو المحل (يظهر على الفاتورة وشاشة العميل)</div>
                    <div className="text-[11px] text-slate-500">يفضل صورة PNG أو JPG بحجم مناسب</div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="win-btn px-3 py-1.5 font-bold cursor-pointer flex items-center gap-1.5 text-blue-950">
                    <Upload className="w-3.5 h-3.5" /> اختيار لوجو المحل
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setForm((prev) => ({ ...prev, company_logo: String(reader.result || '') }));
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {form.company_logo && (
                    <button
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, company_logo: '' }))}
                      className="win-btn px-2.5 py-1.5 font-bold text-red-700"
                    >
                      حذف الشعار
                    </button>
                  )}
                </div>
              </div>
              <div className="flex flex-col justify-center gap-2 pt-2 font-semibold md:col-span-2">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.tax_enabled === '1'} onChange={(e) => setForm({ ...form, tax_enabled: e.target.checked ? '1' : '0' })} />
                  تفعيل ضريبة القيمة المضافة على الفواتير
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.allow_negative_stock_global === '1'} onChange={(e) => setForm({ ...form, allow_negative_stock_global: e.target.checked ? '1' : '0' })} />
                  السماح بالبيع بالسالب (للمستخدمين المصرح لهم فقط)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.auto_backup_enabled === '1'} onChange={(e) => setForm({ ...form, auto_backup_enabled: e.target.checked ? '1' : '0' })} />
                  تفعيل النسخ الاحتياطي التلقائي اليومي
                </label>
              </div>
            </div>
            <button type="submit" className="win-btn flex items-center gap-2 px-5 py-2 font-bold text-blue-950">
              <Save className="w-4 h-4 text-emerald-800" /> حفظ الإعدادات
            </button>
          </form>
        )}

        {/* POS HARDWARE & CUSTOMER DISPLAY SETTINGS */}
        {tab === 'hardware' && (() => {
          const slides = parsePromoSlides(form.customer_display_slides_json, form.company_name || 'Mina Net');
          const updateSlides = (next: PromoSlide[]) => {
            setForm((prev) => ({ ...prev, customer_display_slides_json: JSON.stringify(next) }));
          };
          const handlePushDisplayTest = () => {
            publishCustomerDisplayState({
              mode: 'IDLE',
              updatedAt: Date.now(),
              companyName: form.company_name || 'Mina Net',
              companyLogo: form.company_logo || '',
              companyPhone: form.company_phone || '',
              currency: form.currency || 'ج.م.',
              cashierName: 'الكاشير',
              customerName: 'عميل نقدي',
              items: [],
              subtotal: 0,
              discount: 0,
              additions: 0,
              tax: 0,
              netTotal: 0,
              paidAmount: 0,
              remainingAmount: 0,
              changeAmount: 0,
              paymentType: 'CASH',
              welcomeText: form.customer_display_welcome || 'أهلاً وسهلاً بكم — نتمنى لكم تسوقاً ممتعاً',
              tickerText: form.customer_display_ticker || '',
              qrEnabled: form.customer_display_qr_enabled !== '0',
              qrLabel: form.customer_display_qr_label || 'امسح الكود للدفع عبر إنستاباي أو تقييم الخدمة',
              qrValue: form.customer_display_qr_value || '',
              slides,
            });
            setMsg('تم إرسال العروض وبيانات المحل إلى شاشة العميل بنجاح.');
          };

          return (
            <form onSubmit={saveSettings} className="space-y-4 text-xs max-w-5xl">
              {/* 1. Barcode Scanner + Touch Quick Sale */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-3">
                  <h3 className="font-bold text-sm pb-1.5 border-b border-[#aca899] flex items-center gap-1.5 text-blue-950">
                    <ScanBarcode className="w-4 h-4 text-emerald-700" /> قارئ الباركود السريع وشاشة التاتش
                  </h3>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    يعمل أي قارئ باركود USB أو Bluetooth أو Wireless تلقائياً داخل شاشة المبيعات مع قراءة متتالية فورية بدون الضغط بالماوس قبل كل منتج.
                  </p>
                  <div className="space-y-2 font-semibold">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.pos_auto_merge_scan !== '0'}
                        onChange={(e) => setForm({ ...form, pos_auto_merge_scan: e.target.checked ? '1' : '0' })}
                      />
                      تجميع الصنف المكرر وزيادة الكمية (+1) تلقائياً عند تكرار القراءة
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.pos_scan_beep !== '0'}
                        onChange={(e) => setForm({ ...form, pos_scan_beep: e.target.checked ? '1' : '0' })}
                      />
                      إصدار صوت تنبيه فوري عند نجاح أو فشل مسح الباركود
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.pos_touch_panel_default === '1'}
                        onChange={(e) => setForm({ ...form, pos_touch_panel_default: e.target.checked ? '1' : '0' })}
                      />
                      فتح لوحة البيع السريع (التاتش للأصناف المصورة بدون باركود) تلقائياً في المبيعات
                    </label>
                  </div>
                  <div className="pt-2 border-t border-slate-300 flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setError('');
                        setMsg('');
                        const res = await connectSerialBarcodeScanner((code) => {
                          setLastSerialScan(code);
                          playPosBeep('ok', form.pos_scan_beep !== '0');
                          setMsg(`تمت قراءة باركود عبر COM: ${code}`);
                        });
                        if (res.ok) {
                          setMsg('تم ربط قارئ الباركود السيريال (COM/RS232) وجاهز للقراءة.');
                        } else if (res.error) {
                          setError(res.error);
                        }
                      }}
                      className="win-btn px-3 py-1.5 font-bold flex items-center gap-1.5 text-slate-900"
                    >
                      <Usb className="w-3.5 h-3.5 text-blue-800" /> ربط قارئ باركود COM/Serial
                    </button>
                    {lastSerialScan && (
                      <span className="px-2 py-1 bg-emerald-100 border border-emerald-400 text-emerald-950 font-mono-num font-bold">
                        آخر قراءة: {lastSerialScan}
                      </span>
                    )}
                  </div>
                </div>

                {/* 2. Thermal Printer & Cash Drawer */}
                <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-3">
                  <h3 className="font-bold text-sm pb-1.5 border-b border-[#aca899] flex items-center gap-1.5 text-blue-950">
                    <Printer className="w-4 h-4 text-blue-800" /> طابعة الكاشير ودرج النقدية (Cash Drawer)
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block font-bold mb-1">مقاس الطباعة الافتراضي</label>
                      <select
                        value={form.default_print_format || '80MM'}
                        onChange={(e) => setForm({ ...form, default_print_format: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-semibold"
                      >
                        <option value="80MM">طابعة ريسيت حرارية 80mm</option>
                        <option value="58MM">طابعة ريسيت حرارية 58mm</option>
                        <option value="A4">طابعة كمبيوتر عادية A4</option>
                      </select>
                    </div>
                    <div>
                      <label className="block font-bold mb-1">منفذ / اسم طابعة الكاشير لفتح الدرج</label>
                      <input
                        value={form.pos_printer_target || ''}
                        onChange={(e) => setForm({ ...form, pos_printer_target: e.target.value })}
                        placeholder="مثال: XP-80C أو 192.168.1.50:9100"
                        dir="ltr"
                        className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num text-left"
                      />
                    </div>
                  </div>

                  {winPrinters.length > 0 && (
                    <div>
                      <label className="block font-bold mb-1 text-slate-700">
                        طابعات الويندوز المكتشفة ({winPrinters.length}) — اختر لملء اسم الطابعة:
                      </label>
                      <select
                        value={form.pos_printer_target || ''}
                        onChange={(e) => setForm({ ...form, pos_printer_target: e.target.value })}
                        className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num"
                      >
                        <option value="">-- اختر طابعة مثبّتة على الجهاز أو اتركه فارغاً للطابعة الافتراضية --</option>
                        {winPrinters.map((p) => (
                          <option key={p.Name} value={p.Name}>
                            {p.Name} {p.PortName ? `(${p.PortName})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {loadingPrinters && <div className="text-[11px] text-slate-500">جاري فحص الطابعات المثبتة على الويندوز...</div>}

                  <div className="space-y-1.5 font-semibold">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.pos_auto_print_on_save === '1'}
                        onChange={(e) => setForm({ ...form, pos_auto_print_on_save: e.target.checked ? '1' : '0' })}
                      />
                      طباعة الفاتورة تلقائياً بمجرد الحفظ في شاشة المبيعات
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={form.pos_cash_drawer_auto !== '0'}
                        onChange={(e) => setForm({ ...form, pos_cash_drawer_auto: e.target.checked ? '1' : '0' })}
                      />
                      إرسال أمر فتح درج النقدية تلقائياً عند إتمام البيع النقدي (كاش)
                    </label>
                  </div>

                  <div className="pt-2 border-t border-slate-300 flex flex-wrap gap-2">
                    <button
                      type="button"
                      disabled={hardwareBusy}
                      onClick={async () => {
                        setError('');
                        setMsg('');
                        setHardwareBusy(true);
                        try {
                          const res = await triggerCashDrawer(form);
                          if (res.ok) {
                            setMsg(`تم إرسال أمر فتح الدرج بنجاح عبر (${res.channel}).`);
                          } else {
                            setError(res.error || 'تعذر إرسال أمر فتح الدرج');
                          }
                        } finally {
                          setHardwareBusy(false);
                        }
                      }}
                      className="win-btn px-3 py-1.5 font-bold flex items-center gap-1.5 text-amber-950"
                    >
                      <Coins className="w-3.5 h-3.5 text-amber-700" /> اختبار فتح الدرج الآن
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setError('');
                        setMsg('');
                        const res = await connectUsbPrinter();
                        if (res.ok) setMsg(res.label || 'تم ربط طابعة USB بنجاح');
                        else setError(res.error || 'تعذر ربط طابعة USB');
                      }}
                      className="win-btn px-3 py-1.5 font-bold flex items-center gap-1.5 text-blue-950"
                    >
                      <Usb className="w-3.5 h-3.5 text-blue-800" /> ربط طابعة USB مباشرة
                    </button>
                    <button
                      type="button"
                      onClick={async () => {
                        setError('');
                        setMsg('');
                        const res = await connectSerialPrinter();
                        if (res.ok) setMsg(res.label || 'تم ربط طابعة Serial بنجاح');
                        else setError(res.error || 'تعذر ربط طابعة Serial');
                      }}
                      className="win-btn px-3 py-1.5 font-bold flex items-center gap-1.5 text-slate-900"
                    >
                      <Printer className="w-3.5 h-3.5 text-slate-700" /> ربط طابعة Serial/COM
                    </button>
                  </div>
                </div>
              </div>

              {/* 3. Dual Customer Display & QR & Promo Media */}
              <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#aca899]">
                  <div>
                    <h3 className="font-bold text-sm flex items-center gap-1.5 text-[#0f3d5e]">
                      <Monitor className="w-4 h-4 text-teal-700" /> الشاشة الثانية للعميل (Dual Customer Display)
                    </h3>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      حالة الشاشة الثانية الآن:{' '}
                      <strong className={secondScreenDetected ? 'text-emerald-800' : 'text-amber-800'}>
                        {secondScreenDetected === null
                          ? 'جاري الفحص...'
                          : secondScreenDetected
                          ? 'تم رصد شاشة ثانية متصلة بالويندوز ✓'
                          : 'لم يتم رصد شاشة ممتدة بعد (يمكنك فتحها في نافذة مستقلة أو سحبها للشاشة الثانية)'}
                      </strong>
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={async () => {
                        setError('');
                        handlePushDisplayTest();
                        const res = await openCustomerDisplayWindow(false);
                        if (!res.opened) {
                          setError('المتصفح منع فتح النافذة المنبثقة — اسمح بالنوافذ المنبثقة لهذا الموقع لفتح شاشة العميل تلقائياً.');
                        } else {
                          setMsg(
                            res.onSecondMonitor
                              ? 'تم فتح شاشة العميل على الشاشة الثانية بنجاح!'
                              : 'تم فتح نافذة شاشة العميل (اسحبها إلى شاشة العميل واضغط F11 أو زر ملء الشاشة).'
                          );
                        }
                      }}
                      className="px-3.5 py-1.5 font-bold bg-[#0f3d5e] text-white border border-[#0a2940] flex items-center gap-1.5 hover:brightness-110"
                    >
                      <ExternalLink className="w-3.5 h-3.5" /> فتح / اختبار شاشة العميل الآن
                    </button>
                    <button
                      type="button"
                      onClick={handlePushDisplayTest}
                      className="win-btn px-3 py-1.5 font-bold text-emerald-950"
                    >
                      مزامنة العروض للشاشة
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <label className="md:col-span-2 flex items-center gap-2 font-bold cursor-pointer bg-white border border-slate-300 px-3 py-2">
                    <input
                      type="checkbox"
                      checked={form.customer_display_auto !== '0'}
                      onChange={(e) => setForm({ ...form, customer_display_auto: e.target.checked ? '1' : '0' })}
                    />
                    اكتشاف الشاشة الثانية تلقائياً عند دخول شاشة المبيعات وفتح نافذة العميل عليها بوضع ملء الشاشة
                  </label>
                  <div>
                    <label className="block font-bold mb-1">رسالة الترحيب الرئيسية على شاشة العميل</label>
                    <input
                      value={form.customer_display_welcome || ''}
                      onChange={(e) => setForm({ ...form, customer_display_welcome: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">الشريط المتحرك أسفل شاشة العميل</label>
                    <input
                      value={form.customer_display_ticker || ''}
                      onChange={(e) => setForm({ ...form, customer_display_ticker: e.target.value })}
                      className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
                    />
                  </div>
                </div>

                {/* QR Code settings */}
                <div className="bg-white border border-[#aca899] p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
                  <div className="md:col-span-9 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-[#0f3d5e]" /> باركود الدفع الإلكتروني / إنستاباي / تقييم الخدمة (QR Code)
                      </div>
                      <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
                        <input
                          type="checkbox"
                          checked={form.customer_display_qr_enabled !== '0'}
                          onChange={(e) => setForm({ ...form, customer_display_qr_enabled: e.target.checked ? '1' : '0' })}
                        />
                        تفعيل العرض
                      </label>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block font-semibold mb-0.5 text-[11px]">العنوان الظاهر بجانب الـ QR</label>
                        <input
                          value={form.customer_display_qr_label || ''}
                          onChange={(e) => setForm({ ...form, customer_display_qr_label: e.target.value })}
                          placeholder="امسح الكود للدفع عبر إنستاباي أو تقييم الخدمة"
                          className="w-full px-2 py-1 border border-[#7f9db9] bg-white"
                        />
                      </div>
                      <div>
                        <label className="block font-semibold mb-0.5 text-[11px]">رابط الدفع (إنستاباي / محفظة / تقييم)</label>
                        <input
                          value={form.customer_display_qr_value || ''}
                          onChange={(e) => setForm({ ...form, customer_display_qr_value: e.target.value })}
                          placeholder="https://ipn.eg/S/..."
                          dir="ltr"
                          className="w-full px-2 py-1 border border-[#7f9db9] bg-white font-mono-num text-left"
                        />
                      </div>
                    </div>
                  </div>
                  <div className="md:col-span-3 flex flex-col items-center justify-center border-r border-slate-200 pr-2">
                    {qrPreviewUrl ? (
                      <img src={qrPreviewUrl} alt="معاينة QR" className="w-20 h-20 border border-slate-200 p-1 bg-white" />
                    ) : (
                      <div className="w-20 h-20 border border-dashed border-slate-300 flex items-center justify-center text-[10px] text-slate-400">
                        أدخل الرابط للمعاينة
                      </div>
                    )}
                  </div>
                </div>

                {/* Promo Images & Short Videos Slides */}
                <div className="bg-white border border-[#aca899] p-3 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-bold text-slate-900 flex items-center gap-1.5">
                      <ImageIcon className="w-4 h-4 text-teal-700" /> صور وفيديوهات العروض والدعاية على نصف شاشة العميل
                    </div>
                    <button
                      type="button"
                      onClick={() => updateSlides(getDefaultPromoSlides(form.company_name || 'Mina Net'))}
                      className="text-[11px] font-bold text-blue-800 hover:underline"
                    >
                      استعادة الشرائح الافتراضية
                    </button>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                    {slides.map((s) => (
                      <div key={s.id} className="border border-slate-300 bg-[#fafaf8] p-2 flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          {s.mediaUrl ? (
                            s.mediaType === 'video' ? (
                              <div className="w-12 h-12 bg-slate-900 text-white flex items-center justify-center rounded shrink-0">
                                <Video className="w-5 h-5 text-emerald-400" />
                              </div>
                            ) : (
                              <img src={s.mediaUrl} alt={s.title} className="w-12 h-12 object-cover rounded border border-slate-300 shrink-0" />
                            )
                          ) : (
                            <div className="w-12 h-12 bg-[#0f3d5e] text-white flex items-center justify-center rounded shrink-0 text-[10px] font-bold text-center px-1">
                              عرض نصي
                            </div>
                          )}
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 truncate">{s.title}</div>
                            <div className="text-[11px] text-slate-600 truncate">{s.subtitle}</div>
                            {s.badge && <span className="inline-block text-[10px] font-bold text-teal-800 bg-teal-50 px-1.5 border border-teal-200 mt-0.5">{s.badge}</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => updateSlides(slides.filter((item) => item.id !== s.id))}
                          className="p-1.5 text-red-700 hover:bg-red-50 rounded shrink-0"
                          title="حذف العرض"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="border-t border-slate-200 pt-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                    <div className="md:col-span-3">
                      <label className="block font-semibold mb-0.5 text-[11px]">عنوان العرض</label>
                      <input
                        value={newSlideTitle}
                        onChange={(e) => setNewSlideTitle(e.target.value)}
                        placeholder="مثال: خصم 20% نهاية الأسبوع"
                        className="w-full px-2 py-1 border border-[#7f9db9] bg-white"
                      />
                    </div>
                    <div className="md:col-span-3">
                      <label className="block font-semibold mb-0.5 text-[11px]">وصف قصير</label>
                      <input
                        value={newSlideSubtitle}
                        onChange={(e) => setNewSlideSubtitle(e.target.value)}
                        placeholder="على جميع الأصناف المختارة"
                        className="w-full px-2 py-1 border border-[#7f9db9] bg-white"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block font-semibold mb-0.5 text-[11px]">النوع</label>
                      <select
                        value={newSlideMediaType}
                        onChange={(e) => setNewSlideMediaType(e.target.value as 'image' | 'video')}
                        className="w-full px-2 py-1 border border-[#7f9db9] bg-white"
                      >
                        <option value="image">صورة عرض</option>
                        <option value="video">فيديو قصير (MP4)</option>
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="win-btn w-full py-1 px-2 font-bold cursor-pointer flex items-center justify-center gap-1 text-blue-950">
                        <Upload className="w-3.5 h-3.5" /> رفع ملف
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            e.target.value = '';
                            if (!file) return;
                            const isVid = file.type.startsWith('video/');
                            setNewSlideMediaType(isVid ? 'video' : 'image');
                            const reader = new FileReader();
                            reader.onload = () => setNewSlideMediaUrl(String(reader.result || ''));
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                    </div>
                    <div className="md:col-span-2">
                      <button
                        type="button"
                        onClick={() => {
                          if (!newSlideTitle.trim() && !newSlideMediaUrl.trim()) return;
                          const added: PromoSlide = {
                            id: `slide-${Date.now()}`,
                            title: newSlideTitle.trim() || 'عرض خاص لعملائنا',
                            subtitle: newSlideSubtitle.trim(),
                            badge: newSlideBadge.trim() || 'عرض اليوم',
                            mediaType: newSlideMediaType,
                            mediaUrl: newSlideMediaUrl.trim(),
                          };
                          updateSlides([...slides, added]);
                          setNewSlideTitle('');
                          setNewSlideSubtitle('');
                          setNewSlideMediaUrl('');
                        }}
                        className="w-full py-1 px-2 font-bold bg-emerald-700 text-white border border-emerald-900 flex items-center justify-center gap-1 hover:brightness-110"
                      >
                        <Plus className="w-3.5 h-3.5" /> إضافة العرض
                      </button>
                    </div>
                    <div className="md:col-span-12">
                      <input
                        value={newSlideMediaUrl}
                        onChange={(e) => setNewSlideMediaUrl(e.target.value)}
                        placeholder="أو الصق رابط مباشر للصورة / الفيديو (اختياري)..."
                        dir="ltr"
                        className="w-full px-2 py-1 border border-[#7f9db9] bg-white font-mono-num text-[11px] text-left"
                      />
                    </div>
                  </div>
                </div>
              </div>

              <button type="submit" className="win-btn flex items-center gap-2 px-6 py-2.5 font-bold text-blue-950">
                <Save className="w-4 h-4 text-emerald-800" /> حفظ إعدادات الأجهزة وشاشة العميل
              </button>
            </form>
          );
        })()}

        {/* BACKUP & RESTORE */}
        {tab === 'backup' && (
          <div className="space-y-4">
            {/* Automatic Daily Backup Schedule & Folder Configuration */}
            <form onSubmit={saveBackupSchedule} className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-3 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 pb-1.5 border-b border-[#aca899]">
                <h3 className="font-bold text-sm flex items-center gap-1.5 text-blue-950">
                  <Clock className="w-4 h-4 text-blue-800" />
                  إعدادات النسخ الاحتياطي التلقائي اليومي (بدون تأكيد)
                </h3>
                <span className="text-[11px] font-mono-num text-slate-600">
                  صيغة اسم الملف: YYYY-MM-DD_HH-mm-ss.db (التاريخ والوقت)
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-3">
                  <label className="flex items-center gap-2 font-bold cursor-pointer py-1.5">
                    <input
                      type="checkbox"
                      checked={form.auto_backup_enabled === '1'}
                      onChange={(e) => setForm({ ...form, auto_backup_enabled: e.target.checked ? '1' : '0' })}
                    />
                    تفعيل البيكب اليومي التلقائي
                  </label>
                  <div className="text-[11px] text-slate-600">
                    آخر نسخ تلقائي:{' '}
                    <strong className="font-mono-num text-slate-900">
                      {settings.auto_backup_last_date || 'لم يُنفّذ بعد اليوم'}
                    </strong>
                  </div>
                </div>

                <div className="md:col-span-3">
                  <label className="block font-bold mb-1">ميعاد البيكب اليومي</label>
                  <input
                    type="time"
                    value={form.auto_backup_time || '23:00'}
                    onChange={(e) => setForm({ ...form, auto_backup_time: e.target.value })}
                    className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num font-bold"
                  />
                </div>

                <div className="md:col-span-6">
                  <label className="block font-bold mb-1">
                    فولدر حفظ البيكب اليومي {!isDirectDesktopMode() ? '(مسار المجلد على الجهاز/الخادم)' : '(اختياري لمسار الويندوز)'}
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="text"
                      dir="ltr"
                      value={form.auto_backup_dir || ''}
                      onChange={(e) => setForm({ ...form, auto_backup_dir: e.target.value })}
                      placeholder={effectiveBackupDir || 'D:\\MinaNet_Backups'}
                      className="flex-1 px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num text-left"
                    />
                    {isDirectoryPickerSupported() && (
                      <button
                        type="button"
                        onClick={handlePickLocalFolder}
                        className="win-btn flex items-center gap-1 px-2.5 py-1.5 font-bold text-blue-950 shrink-0"
                        title="اختيار مجلد من جهازك لحفظ النسخة الاحتياطية بداخله تلقائيًا"
                      >
                        <FolderOpen className="w-3.5 h-3.5 text-amber-700" /> اختيار فولدر...
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                <div className="text-[11px] text-slate-700 space-y-0.5">
                  {effectiveBackupDir && !isDirectDesktopMode() && (
                    <div>
                      المسار الفعلي الحالي: <span className="font-mono-num font-bold text-blue-950" dir="ltr">{effectiveBackupDir}</span>
                    </div>
                  )}
                  {localFolderName && (
                    <div className="flex flex-wrap items-center gap-1.5 text-emerald-900 font-bold">
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>مجلد الجهاز المحدد للحفظ المباشر: {localFolderName}</span>
                      {localFolderNeedsPermission && (
                        <button
                          type="button"
                          onClick={handleGrantLocalFolderPermission}
                          className="win-btn px-2 py-0.5 text-[11px] text-amber-950 font-bold"
                        >
                          تفعيل صلاحية المجلد
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleClearLocalFolder}
                        className="text-red-700 hover:underline inline-flex items-center"
                        title="إلغاء ربط المجلد"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
                <button type="submit" className="win-btn flex items-center gap-1.5 px-4 py-1.5 font-bold text-blue-950">
                  <Save className="w-3.5 h-3.5 text-emerald-800" /> حفظ الفولدر وميعاد البيكب
                </button>
              </div>
            </form>

            <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 flex flex-wrap items-center justify-between gap-4 text-xs">
              <div>
                <h3 className="font-bold text-sm">النسخ الاحتياطي واستعادة قاعدة البيانات (SQLite)</h3>
                <p className="text-slate-600 mt-1">يتم تسمية كل نسخة تلقائيًا بالتاريخ والوقت، مع إنشاء نسخة أمان قبل أي استعادة.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={createBackup} className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-blue-950">
                  <DatabaseBackup className="w-3.5 h-3.5 text-blue-800" /> إنشاء نسخة احتياطية الآن
                </button>
                <label className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold cursor-pointer">
                  <Upload className="w-3.5 h-3.5 text-slate-800" /> استعادة من ملف خارجي (.db)
                  <input type="file" accept=".db" onChange={restoreFromUpload} className="hidden" />
                </label>
                <button
                  type="button"
                  onClick={async () => {
                    setMsg('');
                    setError('');
                    try {
                      await downloadApiFile('/api/backup/export-json', 'MINA_NET_BACKUP.json');
                    } catch (err: unknown) {
                      setError((err as Error).message);
                    }
                  }}
                  className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-emerald-900"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-800" /> تصدير بيانات المنشأة (JSON)
                </button>
                {!hideDesktopDownloadUi && !isDirectDesktopMode() && (
                  <>
                    <a
                      href="/api/desktop/download-setup-exe"
                      download="MINA_NET_SETUP.exe"
                      className="flex items-center gap-1.5 px-3 py-1.5 font-bold text-white bg-[#214283] border border-[#12264d] hover:brightness-110"
                    >
                      <Download className="w-3.5 h-3.5 text-amber-300" /> ملف التثبيت لويندوز (Setup .exe)
                    </a>
                    <a
                      href="/api/desktop/download-zip"
                      download="MINA_NET_ERP_PC.zip"
                      className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-blue-950"
                    >
                      <Download className="w-3.5 h-3.5 text-blue-800" /> تحميل نسخة الكمبيوتر مضغوطة (.zip)
                    </a>
                  </>
                )}
                <button
                  type="button"
                  onClick={async () => {
                    setMsg('');
                    setError('');
                    try {
                      await apiFetch('/api/system/reset-demo', { method: 'POST' });
                      setMsg('تم تصفير البيانات التجريبية وتجهيز قاعدة بيانات نظيفة للعمل الفعلي');
                      onRefreshBootstrap();
                      await loadBackups();
                    } catch (err: unknown) {
                      setError((err as Error).message);
                    }
                  }}
                  className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-red-800"
                >
                  <Trash2 className="w-3.5 h-3.5 text-red-700" /> تصفير البيانات والبدء نظيفًا
                </button>
              </div>
            </div>

            <div className="bg-white border border-[#8c8c8c] overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#214283] text-white">
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">اسم الملف</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">تاريخ الإنشاء</th>
                    <th className="py-2 px-3 text-center border-l border-[#375da3]">الحجم</th>
                    <th className="py-2 px-3 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {backups.map((b, idx) => (
                    <tr key={b.filename} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                      <td className="py-1.5 px-3 font-mono-num font-bold">{b.filename}</td>
                      <td className="py-1.5 px-3 font-mono-num">{b.createdAt.slice(0, 19).replace('T', ' ')}</td>
                      <td className="py-1.5 px-3 text-center font-mono-num">{(b.sizeBytes / 1024).toFixed(1)} KB</td>
                      <td className="py-1.5 px-3 text-center space-x-3 space-x-reverse">
                        <button type="button" onClick={() => downloadApiFile(`/api/backup/download/${encodeURIComponent(b.filename)}`, b.filename)} className="text-blue-800 font-bold hover:underline">تحميل</button>
                        <button type="button" onClick={() => restoreFromList(b.filename)} className="text-emerald-800 font-bold hover:underline">استعادة</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* LICENSE & ACTIVATION */}
        {tab === 'license' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
            <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-3">
              <h3 className="font-bold text-sm pb-1.5 border-b border-[#aca899]">بطاقة حالة الترخيص والتجربة</h3>
              <div className="space-y-2">
                <div className="flex justify-between border-b border-slate-200 pb-1">
                  <span className="text-slate-600 font-semibold">حالة الترخيص:</span>
                  <strong className={license.is_operational ? 'text-emerald-800 flex items-center gap-1' : 'text-red-700 flex items-center gap-1'}>
                    {license.is_operational ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                    {license.message}
                  </strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1">
                  <span className="text-slate-600 font-semibold">اسم العميل / المنشأة المرخصة:</span>
                  <strong>{license.customer_name}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1">
                  <span className="text-slate-600 font-semibold">معرف الترخيص:</span>
                  <strong className="font-mono-num">{license.license_id}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1">
                  <span className="text-slate-600 font-semibold">نوع الترخيص:</span>
                  <strong className="font-mono-num">{license.license_type}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1">
                  <span className="text-slate-600 font-semibold">بصمة الجهاز (Device Fingerprint):</span>
                  <strong className="font-mono-num text-blue-900">{license.device_fingerprint}</strong>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1">
                  <span className="text-slate-600 font-semibold">تاريخ الإصدار / البدء:</span>
                  <span className="font-mono-num">{license.issued_at ? license.issued_at.slice(0, 10) : '-'}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-1">
                  <span className="text-slate-600 font-semibold">تاريخ الانتهاء:</span>
                  <span className="font-mono-num">{license.expires_at ? license.expires_at.slice(0, 10) : 'مدى الحياة'}</span>
                </div>
                {license.key_id && (
                  <div className="flex justify-between">
                    <span className="text-slate-600 font-semibold">معرف مفتاح التحقق:</span>
                    <strong className="font-mono-num text-blue-900" dir="ltr">{license.key_id}</strong>
                  </div>
                )}
                {license.clock_tamper && (
                  <div className="p-2 bg-amber-100 text-amber-900 border border-amber-400">
                    تنبيه: تم رصد تغيير في ساعة النظام للخلف. لم يتم حذف أي بيانات، يرجى ضبط تاريخ النظام أو تفعيل الترخيص.
                  </div>
                )}
              </div>
            </div>

            <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-3">
              <h3 className="font-bold text-sm pb-1.5 border-b border-[#aca899]">تفعيل برنامج Mina Net دون إنترنت (توقيع رقمي Ed25519)</h3>
              <p className="text-slate-700">
                أرسل بصمة الجهاز أعلاه لمبرمج ومالك النظام (<strong>اسامه جرجس - <span className="font-mono-num" dir="ltr">01153672084</span></strong>) لاستلام كود التفعيل أو ملف الترخيص الموقع رقميًا (.lic / .json).
              </p>
              <div>
                <a
                  href={`https://wa.me/201153672084?text=${encodeURIComponent(
                    `مرحباً مبرمج اسامه جرجس، أريد طلب تفعيل برنامج Mina Net ERP.\nبصمة الجهاز: ${license.device_fingerprint}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white font-bold border border-emerald-950"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>إرسال بصمة الجهاز وطلب التفعيل عبر واتساب (01153672084)</span>
                </a>
              </div>
              <textarea
                rows={4}
                value={activationInput}
                onChange={(e) => setActivationInput(e.target.value)}
                placeholder="الصق كود التفعيل (MINA1-...) أو محتوى ملف الترخيص الموقع هنا..."
                className="w-full p-2.5 border border-[#7f9db9] font-mono-num bg-white"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => activateLicense(activationInput)}
                  className="win-btn flex-1 py-2 px-4 font-bold text-emerald-950"
                >
                  تفعيل بكود التفعيل
                </button>
                <label className="win-btn flex items-center gap-1.5 py-2 px-4 font-bold cursor-pointer">
                  <Upload className="w-4 h-4 text-blue-900" /> استيراد ملف ترخيص (.lic)
                  <input type="file" accept=".lic,.json,.txt" onChange={handleLicFileUpload} className="hidden" />
                </label>
              </div>
            </div>
          </div>
        )}

        {/* PROGRAM UPDATES */}
        {tab === 'updates' && (
          <div className="space-y-4 text-xs max-w-5xl">
            {restartingAfterUpdate && (
              <div className="p-3 bg-blue-50 border-2 border-[#214283] text-blue-950 font-bold flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin shrink-0" />
                <span>تم تثبيت التحديث بنجاح! جاري إعادة تشغيل البرنامج وتحديث الواجهة تلقائياً...</span>
              </div>
            )}

            {/* DIRECT STANDALONE HTML MODE */}
            {isDirectMode && (
              <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#aca899]">
                  <h3 className="font-bold text-sm flex items-center gap-1.5 text-blue-950">
                    <CloudDownload className="w-4 h-4 text-emerald-700" /> تحديث نسخة التشغيل المباشر (HTML)
                  </h3>
                  <span className="px-2 py-0.5 bg-slate-200 border border-slate-400 font-mono-num font-bold">
                    وضع التشغيل المباشر
                  </span>
                </div>

                <form onSubmit={handleSaveUpdateUrl} className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
                  <div className="md:col-span-9">
                    <label className="block font-bold mb-1">رابط السيرفر الرئيسي المرتبط بالتحديثات</label>
                    <input
                      type="url"
                      dir="ltr"
                      value={updateUrlInput}
                      onChange={(e) => setUpdateUrlInput(e.target.value)}
                      className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num text-left"
                    />
                  </div>
                  <div className="md:col-span-3 flex gap-1.5">
                    <button type="submit" className="win-btn flex-1 py-1.5 px-3 font-bold">
                      حفظ الرابط
                    </button>
                    <button
                      type="button"
                      disabled={checkingUpdate}
                      onClick={() => void loadUpdateStatus(true, updateUrlInput)}
                      className="px-3 py-1.5 font-bold text-white bg-[#214283] border border-[#12264d] hover:brightness-110 disabled:opacity-60 flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${checkingUpdate ? 'animate-spin' : ''}`} /> فحص الآن
                    </button>
                  </div>
                </form>

                {directRemoteManifest && (
                  <div className="bg-white border border-[#7f9db9] p-3 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <div className="font-bold text-sm text-blue-950">
                          أحدث إصدار متاح على السيرفر: <span className="font-mono-num">{directRemoteManifest.version}</span>
                        </div>
                        <div className="text-[11px] text-slate-600 font-mono-num">
                          Build: {directRemoteManifest.buildId} · التاريخ: {directRemoteManifest.releasedAt.slice(0, 10)}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          href={directRemoteManifest.directHtmlUrl}
                          download="MINA_NET_DIRECT.html"
                          className="flex items-center gap-1.5 px-3 py-1.5 font-bold text-white bg-emerald-800 border border-emerald-950 hover:brightness-110"
                        >
                          <Download className="w-3.5 h-3.5" /> تنزيل أحدث نسخة مباشرة (HTML)
                        </a>
                        <a
                          href={directRemoteManifest.setupExeUrl}
                          download="MINA_NET_SETUP.exe"
                          className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-blue-950"
                        >
                          <Download className="w-3.5 h-3.5" /> تنزيل برنامج التثبيت الكامل (Setup .exe)
                        </a>
                      </div>
                    </div>
                    {directRemoteManifest.notes && (
                      <div className="p-2 bg-slate-50 border border-slate-200 text-slate-800">
                        <strong>تفاصيل التحديث:</strong> {directRemoteManifest.notes}
                      </div>
                    )}
                    <p className="text-[11px] text-emerald-900 font-semibold">
                      ملاحظة: بياناتك المحفوظة داخل المتصفح أو قاعدة البيانات لن تتأثر عند تنزيل التحديث.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* CLIENT PC INSTALLED PACKAGE MODE */}
            {!isDirectMode && hideDesktopDownloadUi && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-2.5">
                    <h3 className="font-bold text-sm pb-1.5 border-b border-[#aca899] flex items-center gap-1.5 text-blue-950">
                      <Server className="w-4 h-4 text-blue-800" /> الإصدار المثبت حاليًا على الكمبيوتر
                    </h3>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-600 font-semibold">رقم الإصدار الحالي:</span>
                      <strong className="font-mono-num text-blue-950">{updateStatus?.localState?.version || '1.0.0'}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-600 font-semibold">معرف البناء (Build ID):</span>
                      <strong className="font-mono-num">{updateStatus?.localState?.buildId || '-'}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-600 font-semibold">آخر تحديث على الجهاز:</span>
                      <span className="font-mono-num">
                        {updateStatus?.localState?.updatedAt
                          ? updateStatus.localState.updatedAt.slice(0, 19).replace('T', ' ')
                          : 'نسخة التثبيت الأولى'}
                      </span>
                    </div>
                    {updateStatus?.localState?.notes && (
                      <div className="p-2 bg-white border border-slate-300 text-slate-700">
                        <strong>ملاحظات الإصدار:</strong> {updateStatus.localState.notes}
                      </div>
                    )}
                  </div>

                  <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-3">
                    <h3 className="font-bold text-sm pb-1.5 border-b border-[#aca899] flex items-center gap-1.5 text-blue-950">
                      <CloudDownload className="w-4 h-4 text-emerald-700" /> الربط مع سيرفر التحديثات الرئيسي
                    </h3>
                    <form onSubmit={handleSaveUpdateUrl} className="space-y-2">
                      <label className="block font-bold">رابط السيرفر الرئيسي للتحديثات</label>
                      <div className="flex gap-1.5">
                        <input
                          type="url"
                          dir="ltr"
                          required
                          value={updateUrlInput}
                          onChange={(e) => setUpdateUrlInput(e.target.value)}
                          placeholder="https://..."
                          className="flex-1 px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num text-left"
                        />
                        <button type="submit" className="win-btn px-3 py-1.5 font-bold shrink-0">
                          حفظ الرابط
                        </button>
                      </div>
                    </form>
                    <div className="pt-1 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={checkingUpdate || applyingUpdate || restartingAfterUpdate}
                        onClick={() => void loadUpdateStatus(true, updateUrlInput)}
                        className="flex items-center gap-1.5 px-4 py-2 font-bold text-white bg-[#214283] border border-[#12264d] hover:brightness-110 disabled:opacity-60"
                      >
                        <RefreshCw className={`w-4 h-4 ${checkingUpdate ? 'animate-spin' : ''}`} />
                        {checkingUpdate ? 'جاري فحص التحديثات...' : 'فحص التحديثات المتاحة الآن'}
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-600">
                      عند توفر تحديث أو تعديل من المبرمج، اضغط "فحص التحديثات" ثم "تنزيل وفرد التحديث" ليتم تحديث البرنامج تلقائياً مع الحفاظ الكامل على قاعدة البيانات والترخيص.
                    </p>
                  </div>
                </div>

                {updateStatus?.remoteManifest && (
                  <div
                    className={`p-4 border-2 space-y-3 ${
                      updateStatus.hasUpdate
                        ? 'bg-emerald-50 border-emerald-700'
                        : 'bg-[#f4f3ee] border-emerald-600'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-bold text-sm text-emerald-950 flex items-center gap-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                          {updateStatus.hasUpdate
                            ? `يتوفر تحديث جديد جاهز للفرد: الإصدار ${updateStatus.remoteManifest.version}`
                            : `البرنامج محدّث على أحدث إصدار (${updateStatus.remoteManifest.version})`}
                        </div>
                        <div className="text-[11px] text-slate-700 font-mono-num mt-0.5">
                          Build: {updateStatus.remoteManifest.buildId} · الحجم:{' '}
                          {(updateStatus.remoteManifest.packageSizeBytes / (1024 * 1024)).toFixed(2)} MB · تاريخ الإصدار:{' '}
                          {updateStatus.remoteManifest.releasedAt.slice(0, 10)}
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={applyingUpdate || restartingAfterUpdate}
                        onClick={() => void handleApplyRemoteUpdate()}
                        className="flex items-center gap-2 px-5 py-2 font-bold text-white bg-emerald-800 border border-emerald-950 hover:brightness-110 disabled:opacity-60"
                      >
                        <CloudDownload className="w-4 h-4" />
                        {applyingUpdate
                          ? 'جاري تنزيل وفرد التحديث...'
                          : updateStatus.hasUpdate
                          ? 'تنزيل وفرد التحديث تلقائياً في البرنامج الآن'
                          : 'إعادة تنزيل وفرد النسخة الحالية'}
                      </button>
                    </div>
                    {updateStatus.remoteManifest.notes && (
                      <div className="p-2.5 bg-white border border-emerald-300 text-slate-800">
                        <strong>تفاصيل التعديل / الإضافة:</strong> {updateStatus.remoteManifest.notes}
                      </div>
                    )}
                  </div>
                )}

                <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h4 className="font-bold text-sm">التحديث اليدوي بدون إنترنت (من ملف التحديث .zip)</h4>
                    <p className="text-slate-600 mt-0.5">
                      إذا كان جهاز المحل بدون إنترنت، يمكنك استيراد ملف <span className="font-mono-num">MINA_NET_UPDATE.zip</span> وسيتم التحقق من التوقيع الرقمي وفرده تلقائياً مع أخذ نسخة احتياطية قبل التحديث.
                    </p>
                  </div>
                  <label className="win-btn flex items-center gap-1.5 px-4 py-2 font-bold cursor-pointer text-blue-950">
                    <Upload className="w-4 h-4 text-blue-800" /> اختيار ملف التحديث (.zip) وفرده
                    <input
                      type="file"
                      accept=".zip"
                      disabled={applyingUpdate || restartingAfterUpdate}
                      onChange={handleUploadUpdateZip}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
            )}

            {/* MASTER SERVER PUBLISHER MODE (STUDIO HOST) */}
            {!isDirectMode && !hideDesktopDownloadUi && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-3">
                  <h3 className="font-bold text-sm pb-1.5 border-b border-[#aca899] flex items-center gap-1.5 text-blue-950">
                    <Server className="w-4 h-4 text-blue-800" /> حالة مركز التحديثات الرئيسي للعملاء
                  </h3>
                  <p className="text-slate-700">
                    هذا السيرفر مربوط تلقائيًا مع جميع نسخ الكمبيوتر المثبتة لدى العملاء. أي تعديل أو إضافة تنفذها هنا ثم تنشرها سيصل للعميل فور ضغطه على «فحص التحديثات».
                  </p>
                  <div className="space-y-1.5 bg-white border border-slate-300 p-3">
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-600 font-semibold">الإصدار المنشور حالياً:</span>
                      <strong className="font-mono-num text-emerald-900">
                        {updateStatus?.manifest?.version || '1.0.0'}
                      </strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-600 font-semibold">معرف البناء (Build ID):</span>
                      <strong className="font-mono-num">{updateStatus?.manifest?.buildId || '-'}</strong>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-600 font-semibold">تاريخ النشر:</span>
                      <span className="font-mono-num">
                        {updateStatus?.manifest?.releasedAt
                          ? updateStatus.manifest.releasedAt.slice(0, 19).replace('T', ' ')
                          : '-'}
                      </span>
                    </div>
                    <div className="flex justify-between border-b border-slate-200 pb-1">
                      <span className="text-slate-600 font-semibold">حجم حزمة التحديث:</span>
                      <span className="font-mono-num">
                        {updateStatus?.manifest?.packageSizeBytes
                          ? `${(updateStatus.manifest.packageSizeBytes / (1024 * 1024)).toFixed(2)} MB`
                          : '-'}
                      </span>
                    </div>
                    <div className="pt-1">
                      <span className="text-slate-600 font-semibold block mb-0.5">رابط التحديثات المدمج تلقائياً لدى العملاء:</span>
                      <div className="font-mono-num text-[11px] bg-slate-100 px-2 py-1 border border-slate-300 break-all" dir="ltr">
                        {updateStatus?.manifest?.serverUrl || '-'}
                      </div>
                    </div>
                    {updateStatus?.manifest?.notes && (
                      <div className="pt-1 text-slate-800">
                        <strong>ملاحظات الإصدار الحالي:</strong> {updateStatus.manifest.notes}
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <a
                      href="/api/updates/package.zip"
                      download={`MINA_NET_UPDATE_v${updateStatus?.manifest?.version || '1.0.0'}.zip`}
                      className="win-btn flex items-center gap-1.5 px-3 py-2 font-bold text-blue-950"
                    >
                      <Download className="w-4 h-4 text-blue-800" /> تحميل حزمة التحديث اليدوي (.zip) للأجهزة بدون نت
                    </a>
                  </div>
                </div>

                <form onSubmit={handlePublishUpdate} className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-3">
                  <h3 className="font-bold text-sm pb-1.5 border-b border-[#aca899] flex items-center gap-1.5 text-emerald-950">
                    <CloudDownload className="w-4 h-4 text-emerald-700" /> تجهيز ونشر تحديث جديد لأجهزة العملاء
                  </h3>
                  <p className="text-slate-700">
                    بعد تنفيذ أي تعديل أو إضافة جديدة على البرنامج، اضغط الزر أدناه لإعادة بناء وتوقيع حزمة التحديث وإتاحتها فورًا لعملائك.
                  </p>
                  <div>
                    <label className="block font-bold mb-1">رقم الإصدار الجديد (Version)</label>
                    <input
                      type="text"
                      dir="ltr"
                      required
                      value={publishVersion}
                      onChange={(e) => setPublishVersion(e.target.value)}
                      placeholder="1.0.1"
                      className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num font-bold text-left"
                    />
                  </div>
                  <div>
                    <label className="block font-bold mb-1">تفاصيل التعديل / الإضافة التي ستظهر للعميل</label>
                    <textarea
                      rows={4}
                      value={publishNotes}
                      onChange={(e) => setPublishNotes(e.target.value)}
                      placeholder="مثال: إصلاح طباعة الفاتورة وتحسين شاشة المبيعات وإضافة ميزة جديدة..."
                      className="w-full p-2.5 border border-[#7f9db9] bg-white"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={publishingUpdate}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 font-bold text-white bg-[#214283] border border-[#12264d] hover:brightness-110 disabled:opacity-60"
                  >
                    <RefreshCw className={`w-4 h-4 ${publishingUpdate ? 'animate-spin' : ''}`} />
                    {publishingUpdate ? 'جاري بناء وتوقيع الحزمة (قد يستغرق ثوانٍ)...' : 'بناء وتوقيع ونشر التحديث للعملاء الآن'}
                  </button>
                </form>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
