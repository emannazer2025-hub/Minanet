import React, { useState } from 'react';
import { ShieldAlert, KeyRound, Copy, Check, Upload, DatabaseBackup, Lock, MessageCircle } from 'lucide-react';
import { apiFetch, downloadApiFile } from '../api.ts';
import type { LicenseState } from '../types.ts';

interface ActivationGateModalProps {
  license: LicenseState;
  onActivated: () => Promise<void> | void;
}

export const ActivationGateModal: React.FC<ActivationGateModalProps> = ({ license, onActivated }) => {
  const [activationInput, setActivationInput] = useState('');
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const handleCopyFp = () => {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(license.device_fingerprint).catch(() => {});
    } else {
      const ta = document.createElement('textarea');
      ta.value = license.device_fingerprint;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activate = async (inputStr: string) => {
    if (!inputStr.trim()) {
      setError('يرجى إدخال كود التفعيل أو اختيار ملف الترخيص (.lic / .mnlic)');
      return;
    }
    setBusy(true);
    setError('');
    setMsg('');
    try {
      await apiFetch('/api/license/activate', {
        method: 'POST',
        body: JSON.stringify({ activationInput: inputStr }),
      });
      setMsg('تم التحقق من التوقيع الرقمي وتفعيل برنامج Mina Net بنجاح!');
      setActivationInput('');
      await onActivated();
    } catch (err: unknown) {
      setError((err as Error).message || 'فشل التفعيل');
    } finally {
      setBusy(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      void activate(String(reader.result || ''));
    };
    reader.readAsText(file);
  };

  const handleBackupDownload = async () => {
    setError('');
    setMsg('');
    try {
      const res = await apiFetch<{ filename: string }>('/api/backup/create', { method: 'POST' });
      await downloadApiFile(`/api/backup/download/${encodeURIComponent(res.filename)}`, res.filename);
      setMsg(`تم حفظ نسخة احتياطية كاملة بأمان: ${res.filename}`);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 backdrop-blur-xs p-3 overflow-y-auto">
      <div className="win-window w-full max-w-2xl overflow-hidden text-xs shadow-2xl border-2 border-[#1b2b4b]">
        {/* Locked Window Header */}
        <div className="bg-[#1b2b4b] text-white px-4 py-3 flex items-center justify-between border-b border-[#375da3]">
          <div className="flex items-center gap-2 font-bold text-sm">
            <Lock className="w-4 h-4 text-amber-300" />
            <span>Mina Net — البرنامج مقفول لحين التفعيل الرسمي (Ed25519)</span>
          </div>
          <span className="px-2 py-0.5 bg-red-700 border border-red-400 text-[11px] font-bold">
            {license.tamper_detected ? 'تحذير أمان' : 'يتطلب تفعيل'}
          </span>
        </div>

        <div className="p-4 space-y-4 bg-[#ece9d8] text-slate-900">
          {/* Reason Banner */}
          <div className="p-3 bg-red-100 border border-red-500 text-red-950 flex items-start gap-2.5">
            <ShieldAlert className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="font-bold text-sm">تم إيقاف التشغيل لحماية حقوق الملكية الفكرية</div>
              <p className="font-semibold">{license.message}</p>
              {license.clock_tamper && (
                <p className="text-[11px] text-red-800">
                  تم رصد تلاعب في تاريخ/ساعة الجهاز أو ملفات التحقق. لا يعمل النظام إلا بتوقيع رقمي رسمي.
                </p>
              )}
            </div>
          </div>

          {error && <div className="p-2.5 bg-red-100 border border-red-400 text-red-900 font-bold">{error}</div>}
          {msg && <div className="p-2.5 bg-emerald-100 border border-emerald-500 text-emerald-950 font-bold">{msg}</div>}

          {/* Device Fingerprint Card */}
          <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-3 space-y-2">
            <div className="font-bold text-blue-950">1. أرسل بصمة هذا الجهاز لمبرمج النظام لاستخراج كود التفعيل:</div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex-1 px-3 py-2 bg-white border border-[#7f9db9] font-mono-num font-bold text-sm text-blue-950 select-all" dir="ltr">
                {license.device_fingerprint}
              </div>
              <button
                type="button"
                onClick={handleCopyFp}
                className="win-btn flex items-center gap-1.5 px-3 py-2 font-bold text-slate-900"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-800" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'تم النسخ' : 'نسخ البصمة'}
              </button>
            </div>
            <div className="text-[11px] text-slate-700 flex flex-wrap items-center justify-between gap-2">
              <span>
                المبرمج ومالك النظام: <strong>اسامه جرجس</strong> · هاتف / واتساب:{' '}
                <strong className="font-mono-num" dir="ltr">01153672084</strong>
              </span>
              <div className="flex flex-wrap items-center gap-2">
                {license.key_id && (
                  <span className="font-mono-num bg-blue-100 text-blue-950 px-2 py-0.5 border border-blue-300 font-bold" dir="ltr">
                    معرف المفتاح: {license.key_id}
                  </span>
                )}
                <a
                  href={`https://wa.me/201153672084?text=${encodeURIComponent(
                    `مرحباً مبرمج اسامه جرجس، أريد طلب كود تفعيل برنامج Mina Net ERP.\nبصمة الجهاز: ${license.device_fingerprint}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white font-bold border border-emerald-950"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  <span>طلب التفعيل عبر واتساب</span>
                </a>
              </div>
            </div>
          </div>

          {/* Activation Code Input */}
          <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-3 space-y-2.5">
            <div className="font-bold text-blue-950 flex items-center gap-1.5">
              <KeyRound className="w-4 h-4 text-amber-700" />
              <span>2. أدخل كود التفعيل الموقع أو ارفع ملف الترخيص:</span>
            </div>
            <textarea
              rows={4}
              value={activationInput}
              onChange={(e) => setActivationInput(e.target.value)}
              placeholder="الصق كود التفعيل (MINA1-...) أو محتوى ملف الترخيص (.lic / .mnlic) هنا..."
              className="w-full p-2.5 border border-[#7f9db9] bg-white font-mono-num"
              dir="ltr"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => activate(activationInput)}
                className="win-btn flex-1 py-2 px-4 font-bold text-emerald-950 disabled:opacity-60"
              >
                {busy ? 'جاري التحقق من التوقيع الرقمي...' : 'تفعيل البرنامج الآن'}
              </button>
              <label className="win-btn flex items-center gap-1.5 py-2 px-4 font-bold cursor-pointer">
                <Upload className="w-4 h-4 text-blue-900" /> استيراد ملف ترخيص (.lic / .mnlic)
                <input type="file" accept=".lic,.mnlic,.plzlic,.json,.txt" onChange={handleFileUpload} className="hidden" />
              </label>
            </div>
          </div>

          {/* Safe Data Export Only */}
          <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-slate-700 font-semibold">
              بياناتك محفوظة بأمان: يمكنك سحب نسخة احتياطية كاملة لقاعدة البيانات في أي وقت دون تشغيل المبيعات أو المخازن.
            </span>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={handleBackupDownload} className="win-btn flex items-center gap-1 px-3 py-1.5 font-bold text-blue-950">
                <DatabaseBackup className="w-3.5 h-3.5" /> نسخ احتياطي (.db)
              </button>
              <button
                type="button"
                onClick={() => downloadApiFile('/api/backup/export-json', 'MINA_NET_BACKUP.json')}
                className="win-btn px-3 py-1.5 font-bold text-emerald-950"
              >
                تصدير JSON
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
