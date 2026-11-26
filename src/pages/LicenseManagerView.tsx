import React, { useEffect, useState } from 'react';
import { KeyRound, ShieldAlert, Download, Printer, FileSpreadsheet, Ban, Copy, Check } from 'lucide-react';
import { apiFetch } from '../api.ts';

export const LicenseManagerView: React.FC = () => {
  const [vaultInfo, setVaultInfo] = useState<{ publicKeyPem: string; createdAt: string; currentDeviceFingerprint: string; keyId?: string } | null>(null);
  const [records, setRecords] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({
    customer_name: '',
    customer_phone: '',
    device_fingerprint: 'MULTI_DEVICE',
    license_type: 'YEARLY' as 'TRIAL' | 'MONTHLY' | 'YEARLY' | 'LIFETIME',
    duration_days: '365',
    max_devices: '1',
    notes: '',
  });
  const [issuedResult, setIssuedResult] = useState<{
    license_id: string;
    activation_code: string;
    signed_json: string;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [search, setSearch] = useState('');
  const [certRecord, setCertRecord] = useState<Record<string, unknown> | null>(null);
  const [strictActivation, setStrictActivation] = useState(false);
  const [policySaving, setPolicySaving] = useState(false);

  const loadAll = async () => {
    const [v, r, pol] = await Promise.all([
      apiFetch<{ publicKeyPem: string; createdAt: string; currentDeviceFingerprint: string; keyId?: string }>('/api/license-manager/vault'),
      apiFetch<Array<Record<string, unknown>>>('/api/license-manager/records'),
      apiFetch<{ strictActivation: boolean }>('/api/license-manager/policy').catch(() => ({ strictActivation: false })),
    ]);
    setVaultInfo(v);
    setRecords(r);
    setStrictActivation(pol.strictActivation === true);
  };

  useEffect(() => {
    loadAll();
  }, []);

  const toggleDistributionPolicy = async (nextStrict: boolean) => {
    setPolicySaving(true);
    try {
      const updated = await apiFetch<{ strictActivation: boolean }>('/api/license-manager/policy', {
        method: 'PUT',
        body: JSON.stringify({ strictActivation: nextStrict, rebuildNow: false }),
      });
      setStrictActivation(updated.strictActivation);
    } finally {
      setPolicySaving(false);
    }
  };

  const issueLicense = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await apiFetch<{ license_id: string; activation_code: string; signed_json: string }>('/api/license-manager/issue', {
      method: 'POST',
      body: JSON.stringify(form),
    });
    setIssuedResult(res);
    setForm((f) => ({ ...f, customer_name: '', customer_phone: '', notes: '' }));
    loadAll();
  };

  const downloadLicFile = (licenseId: string, jsonStr: string) => {
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${licenseId}.lic`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadVaultBackup = async () => {
    const vault = await apiFetch<Record<string, unknown>>('/api/license-manager/vault/backup', { method: 'POST' });
    const blob = new Blob([JSON.stringify(vault, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `MINA_NET_OWNER_ED25519_PRIVATE_KEY_BACKUP.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportRegistryExcel = async () => {
    const res = await fetch('/api/license-manager/export-excel', { method: 'POST' });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'MINA_NET_LICENSES_REGISTRY.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = records.filter(
    (r) =>
      !search.trim() ||
      String(r.customer_name).includes(search) ||
      String(r.license_id).includes(search) ||
      String(r.device_fingerprint).includes(search)
  );

  return (
    <div className="bg-[#ece9d8] text-slate-900">
      {/* Owner Console Header */}
      <div className="no-print bg-[#4a4847] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#232221]">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-amber-300" />
            Mina Net License Manager — وحدة تحكم المالك لإصدار التراخيص (Ed25519)
            {vaultInfo?.keyId && (
              <span className="px-2 py-0.5 bg-[#214283] text-amber-300 border border-blue-400 text-[11px] font-mono-num" dir="ltr">
                {vaultInfo.keyId}
              </span>
            )}
          </h2>
          <p className="text-[11px] text-slate-200 mt-0.5">
            أداة مستقلة للمبرمج (اسامه جرجس · 01153672084) لتوليد تراخيص العملاء الموقعة رقميًا دون الحاجة للإنترنت.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <a href="/api/license-manager/download-package" className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-blue-950">
            <Download className="w-3.5 h-3.5 text-blue-800" /> أداة التراخيص بواجهة EXE (.zip)
          </a>
          <a href="/api/license-manager/download-direct-html" className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-emerald-950">
            <Download className="w-3.5 h-3.5 text-emerald-800" /> أداة التراخيص مباشر (.html)
          </a>
          <a href="/api/license-manager/download-client-setup" download="MINA_NET_SETUP.exe" className="flex items-center gap-1.5 px-3 py-1.5 font-bold text-white bg-[#214283] border border-[#12264d] hover:brightness-110">
            <Download className="w-3.5 h-3.5 text-amber-300" /> ملف التثبيت للعميل (MINA_NET_SETUP.exe)
          </a>
          <a href="/api/license-manager/download-client-erp" className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-slate-900">
            <Download className="w-3.5 h-3.5 text-slate-700" /> نسخة العميل (.zip + MINA_NET.exe)
          </a>
          <a href="/api/license-manager/download-direct-erp-html" className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-emerald-950">
            <Download className="w-3.5 h-3.5 text-emerald-800" /> البرنامج نفسو مباشر (.html)
          </a>
          <a href="/api/license-manager/vault/public-key" className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-blue-950">
            <Download className="w-3.5 h-3.5 text-blue-800" /> المفتاح العام (.pem)
          </a>
          <button type="button" onClick={downloadVaultBackup} className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold">
            <Download className="w-3.5 h-3.5 text-amber-700" /> نسخ احتياطي للمفتاح الخاص
          </button>
          <button type="button" onClick={exportRegistryExcel} className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-emerald-950">
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-800" /> تصدير Excel
          </button>
        </div>
      </div>

      <div className="p-3 space-y-3">
        <div className="no-print p-2.5 bg-amber-100 border border-amber-500 text-xs text-amber-950 flex flex-wrap items-center justify-between gap-2 font-semibold">
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 shrink-0 text-amber-800" />
            <span>
              نسخ العملاء المصدرة محصّنة بدون كود مصدري (تشويش كامل + شهادة تكامل Ed25519 + ربط المفتاح العام بالهاش لمنع التلاعب بالذكاء الصناعي).
            </span>
          </div>
          <div className="flex items-center gap-2 bg-white px-2.5 py-1 border border-amber-400">
            <span>حماية التشغيل عند التصدير:</span>
            <button
              type="button"
              disabled={policySaving}
              onClick={() => toggleDistributionPolicy(true)}
              className={`px-2 py-0.5 font-bold border ${strictActivation ? 'bg-red-700 text-white border-red-900' : 'win-btn text-slate-800'}`}
            >
              قفل فوري بدون تجربة (تفعيل إلزامي)
            </button>
            <button
              type="button"
              disabled={policySaving}
              onClick={() => toggleDistributionPolicy(false)}
              className={`px-2 py-0.5 font-bold border ${!strictActivation ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-800'}`}
            >
              تجربة محمية 30 يوم
            </button>
          </div>
        </div>

        <div className="no-print grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Issue Form */}
          <form onSubmit={issueLicense} className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-2.5 text-xs">
            <h3 className="font-bold text-sm border-b border-[#aca899] pb-1.5">إصدار ترخيص جديد موقع رقميًا</h3>
            <input required placeholder="اسم العميل / المنشأة *" value={form.customer_name} onChange={(e) => setForm({ ...form, customer_name: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white" />
            <input placeholder="رقم الهاتف" value={form.customer_phone} onChange={(e) => setForm({ ...form, customer_phone: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] font-mono-num bg-white" />
            <div>
              <div className="flex justify-between items-center mb-1">
                <label className="font-bold">بصمة جهاز العميل (أو MULTI_DEVICE)</label>
                {vaultInfo && (
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, device_fingerprint: vaultInfo.currentDeviceFingerprint })}
                    className="text-[11px] text-blue-900 font-bold hover:underline"
                  >
                    استخدم بصمة هذا الجهاز
                  </button>
                )}
              </div>
              <input required value={form.device_fingerprint} onChange={(e) => setForm({ ...form, device_fingerprint: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] font-mono-num bg-white" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block font-bold mb-1">نوع الترخيص</label>
                <select
                  value={form.license_type}
                  onChange={(e) => {
                    const lt = e.target.value as typeof form.license_type;
                    setForm({ ...form, license_type: lt, duration_days: lt === 'MONTHLY' ? '30' : lt === 'YEARLY' ? '365' : '30' });
                  }}
                  className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
                >
                  <option value="TRIAL">تجريبي 30 يومًا</option>
                  <option value="MONTHLY">شهري</option>
                  <option value="YEARLY">سنوي</option>
                  <option value="LIFETIME">مدى الحياة</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">عدد الأجهزة المسموح بها</label>
                <input type="number" min="1" value={form.max_devices} onChange={(e) => setForm({ ...form, max_devices: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] font-mono-num bg-white" />
              </div>
            </div>
            {form.license_type !== 'LIFETIME' && (
              <div>
                <label className="block font-bold mb-1">المدة بالأيام</label>
                <input type="number" min="1" value={form.duration_days} onChange={(e) => setForm({ ...form, duration_days: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] font-mono-num bg-white" />
              </div>
            )}
            <input placeholder="ملاحظات" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white" />
            <button type="submit" className="win-btn w-full py-2 font-bold text-blue-950">
              توقيع وإصدار ملف الترخيص
            </button>

            {issuedResult && (
              <div className="p-2.5 bg-emerald-50 border border-emerald-500 space-y-2">
                <div className="font-bold text-emerald-900">تم الإصدار: {issuedResult.license_id}</div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(issuedResult.activation_code);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="win-btn flex-1 flex items-center justify-center gap-1 py-1 font-bold"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-800" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'تم النسخ' : 'نسخ كود التفعيل'}
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadLicFile(issuedResult.license_id, issuedResult.signed_json)}
                    className="win-btn flex-1 flex items-center justify-center gap-1 py-1 font-bold text-emerald-950"
                  >
                    <Download className="w-3.5 h-3.5" /> تحميل .lic
                  </button>
                </div>
              </div>
            )}
          </form>

          {/* Licenses Registry */}
          <div className="lg:col-span-2 bg-white border border-[#8c8c8c] space-y-2">
            <div className="bg-[#f4f3ee] border-b border-[#8c8c8c] p-2.5 flex items-center justify-between gap-3">
              <h3 className="font-bold text-sm">سجل التراخيص المصدرة</h3>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="بحث باسم العميل أو رقم الترخيص..."
                className="px-2.5 py-1 text-xs border border-[#7f9db9] bg-white w-64"
              />
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#214283] text-white">
                    <th className="py-2 px-2 text-right border-l border-[#375da3]">رقم الترخيص</th>
                    <th className="py-2 px-2 text-right border-l border-[#375da3]">العميل</th>
                    <th className="py-2 px-2 text-right border-l border-[#375da3]">النوع</th>
                    <th className="py-2 px-2 text-right border-l border-[#375da3]">البصمة</th>
                    <th className="py-2 px-2 text-right border-l border-[#375da3]">الانتهاء</th>
                    <th className="py-2 px-2 text-center border-l border-[#375da3]">الحالة</th>
                    <th className="py-2 px-2 text-center">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((r, idx) => (
                    <tr key={String(r.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                      <td className="py-1.5 px-2 font-mono-num font-bold">{String(r.license_id)}</td>
                      <td className="py-1.5 px-2 font-semibold">{String(r.customer_name)}</td>
                      <td className="py-1.5 px-2 font-mono-num">{String(r.license_type)}</td>
                      <td className="py-1.5 px-2 font-mono-num text-[11px]">{String(r.device_fingerprint)}</td>
                      <td className="py-1.5 px-2 font-mono-num">{r.expires_at ? String(r.expires_at).slice(0, 10) : 'دائم'}</td>
                      <td className="py-1.5 px-2 text-center font-bold">
                        <span className={r.status === 'ACTIVE' ? 'text-emerald-800' : 'text-red-700'}>{String(r.status)}</span>
                      </td>
                      <td className="py-1.5 px-2 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={() => downloadLicFile(String(r.license_id), String(r.signed_json))}
                            className="text-blue-800 hover:underline"
                            title="تحميل .lic"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCertRecord(r);
                              setTimeout(() => window.print(), 150);
                            }}
                            className="text-slate-700 hover:text-blue-800"
                            title="طباعة شهادة ترخيص"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          {r.status === 'ACTIVE' && (
                            <button
                              type="button"
                              onClick={async () => {
                                await apiFetch('/api/license-manager/revoke', {
                                  method: 'POST',
                                  body: JSON.stringify({ license_id: r.license_id }),
                                });
                                loadAll();
                              }}
                              className="text-red-700 hover:text-red-900"
                              title="إيقاف الترخيص"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      {/* Printable License Certificate */}
      {certRecord && (
        <div className="hidden print:block bg-white text-black border-4 border-double border-slate-800 p-10 text-center space-y-4">
          <h1 className="text-2xl font-bold">شهادة ترخيص استخدام برنامج Mina Net</h1>
          <p className="text-sm">تشهد إدارة Mina Net (المبرمج: اسامه جرجس - 01153672084) بمنح الترخيص الرسمي الموقّع رقميًا (Ed25519) لصالح:</p>
          <div className="text-xl font-bold text-blue-900">{String(certRecord.customer_name)}</div>
          <div className="grid grid-cols-2 gap-3 text-right max-w-lg mx-auto border p-4 text-sm">
            <div>رقم الترخيص: <strong className="font-mono-num">{String(certRecord.license_id)}</strong></div>
            <div>نوع الترخيص: <strong className="font-mono-num">{String(certRecord.license_type)}</strong></div>
            <div>بصمة الجهاز: <strong className="font-mono-num">{String(certRecord.device_fingerprint)}</strong></div>
            <div>تاريخ الانتهاء: <strong className="font-mono-num">{certRecord.expires_at ? String(certRecord.expires_at).slice(0, 10) : 'مدى الحياة'}</strong></div>
          </div>
        </div>
      )}
    </div>
  );
};
