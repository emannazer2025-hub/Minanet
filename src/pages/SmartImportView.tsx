import React, { useEffect, useState } from 'react';
import { Upload, Download, CheckCircle2, AlertTriangle, RotateCcw, FileSpreadsheet } from 'lucide-react';
import { apiFetch, downloadApiFile, formatNum } from '../api.ts';
import type { DefinitionsBundle } from '../types.ts';

interface AnalyzeResponse {
  fileType: string;
  sheets: Array<{ index: number; name: string; rowCount: number }>;
  activeSheetIndex: number;
  headerRowIndex: number;
  headers: string[];
  mapping: Record<string, number | null>;
  totalRows: number;
  previewRows: string[][];
}

interface ValidationResponse {
  totalRows: number;
  existingMatchCount: number;
  newCount: number;
  errorCount: number;
  warningCount: number;
  issues: Array<{ rowNumber: number; type: 'ERROR' | 'WARNING'; message: string; name: string }>;
}

const TARGET_FIELDS: Array<{ key: string; label: string; required?: boolean }> = [
  { key: 'name', label: 'اسم الصنف', required: true },
  { key: 'code', label: 'كود الصنف' },
  { key: 'barcode', label: 'الباركود' },
  { key: 'category', label: 'الفئة / التصنيف' },
  { key: 'unit', label: 'الوحدة' },
  { key: 'purchase_price', label: 'سعر الشراء / التكلفة' },
  { key: 'sale_price', label: 'سعر البيع (المستهلك)' },
  { key: 'wholesale_price', label: 'سعر الجملة' },
  { key: 'special_price', label: 'سعر خاص' },
  { key: 'quantity', label: 'الكمية / الرصيد الافتتاحي' },
  { key: 'min_stock', label: 'الحد الأدنى' },
  { key: 'reorder_level', label: 'حد إعادة الطلب' },
  { key: 'alt_name', label: 'الاسم البديل' },
  { key: 'notes', label: 'ملاحظات' },
];

export const SmartImportView: React.FC = () => {
  const [defs, setDefs] = useState<DefinitionsBundle | null>(null);
  const [fileName, setFileName] = useState('');
  const [base64Content, setBase64Content] = useState('');
  const [analysis, setAnalysis] = useState<AnalyzeResponse | null>(null);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [headerRowIndex, setHeaderRowIndex] = useState(0);
  const [mapping, setMapping] = useState<Record<string, number | null>>({});
  const [validation, setValidation] = useState<ValidationResponse | null>(null);

  const [duplicatePolicy, setDuplicatePolicy] = useState<'skip' | 'update' | 'create_new'>('update');
  const [updateScope, setUpdateScope] = useState<'master' | 'prices_only' | 'opening_stock'>('opening_stock');
  const [warehouseId, setWarehouseId] = useState<number>(1);

  const [execResult, setExecResult] = useState<{
    jobId: number;
    insertedCount: number;
    updatedCount: number;
    skippedCount: number;
    errorCount: number;
    openingDocNum: string;
    errors: Array<{ row_number: number; raw_data: string; error_message: string }>;
  } | null>(null);

  const [jobs, setJobs] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const loadJobsAndDefs = async () => {
    try {
      const [d, j] = await Promise.all([
        apiFetch<DefinitionsBundle>('/api/definitions/all'),
        apiFetch<Array<Record<string, unknown>>>('/api/import/jobs'),
      ]);
      setDefs(d);
      setJobs(j);
      if (d.warehouses[0]) setWarehouseId(d.warehouses[0].id);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadJobsAndDefs();
  }, []);

  const analyzeFile = async (fName: string, b64: string, sIdx?: number, hIdx?: number) => {
    setError('');
    setBusy(true);
    setExecResult(null);
    setValidation(null);
    try {
      const res = await apiFetch<AnalyzeResponse>('/api/import/analyze', {
        method: 'POST',
        body: JSON.stringify({ fileName: fName, base64Content: b64, sheetIndex: sIdx, headerRowIndex: hIdx }),
      });
      setAnalysis(res);
      setSheetIndex(res.activeSheetIndex);
      setHeaderRowIndex(res.headerRowIndex);
      setMapping(res.mapping);
    } catch (err: unknown) {
      setError((err as Error).message);
      setAnalysis(null);
    } finally {
      setBusy(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const resStr = String(reader.result || '');
      const b64 = resStr.includes(',') ? resStr.split(',')[1] : resStr;
      setBase64Content(b64);
      analyzeFile(file.name, b64);
    };
    reader.readAsDataURL(file);
  };

  const runValidation = async () => {
    if (!analysis) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<ValidationResponse>('/api/import/validate', {
        method: 'POST',
        body: JSON.stringify({ fileName, base64Content, sheetIndex, headerRowIndex, mapping }),
      });
      setValidation(res);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const executeImport = async () => {
    if (!analysis) return;
    setBusy(true);
    setError('');
    try {
      const res = await apiFetch<typeof execResult>('/api/import/execute', {
        method: 'POST',
        body: JSON.stringify({
          fileName,
          base64Content,
          sheetIndex,
          headerRowIndex,
          mapping,
          duplicatePolicy,
          updateScope,
          warehouseId,
        }),
      });
      setExecResult(res);
      loadJobsAndDefs();
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const downloadErrorsCsv = () => {
    if (!execResult || execResult.errors.length === 0) return;
    const csvRows = ['Row,Error,RawData'];
    for (const err of execResult.errors) {
      csvRows.push(`${err.row_number},"${err.error_message.replace(/"/g, '""')}","${err.raw_data.replace(/"/g, '""')}"`);
    }
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IMPORT_ERRORS_${execResult.jobId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rollbackJob = async (jobId: number) => {
    setError('');
    try {
      await apiFetch(`/api/import/jobs/${jobId}/rollback`, { method: 'POST' });
      loadJobsAndDefs();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="bg-[#ece9d8] text-slate-900">
      {/* Classic Header & Templates Bar */}
      <div className="bg-[#4a4847] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-4 border-b-2 border-[#232221]">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-amber-300" />
            مساعد استيراد البيانات الذكي
          </h2>
          <p className="text-[11px] text-slate-200 mt-0.5">
            يدعم ملفات Excel (XLSX/XLS) وCSV وTXT وDBF وXML وJSON مع اكتشاف تلقائي للأعمدة العربية والإنجليزية
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <button type="button" onClick={() => downloadApiFile('/api/import/template', 'MINA_NET_IMPORT_TEMPLATE.xlsx')} className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold">
            <Download className="w-3.5 h-3.5 text-blue-900" /> تحميل قالب Excel فارغ
          </button>
          <button type="button" onClick={() => downloadApiFile('/api/import/export-products', 'MINA_NET_PRODUCTS_EXPORT.xlsx')} className="win-btn flex items-center gap-1.5 px-3 py-1.5 font-bold text-emerald-950">
            <Download className="w-3.5 h-3.5 text-emerald-800" /> تصدير الأصناف الحالية إلى Excel
          </button>
        </div>
      </div>

      {error && (
        <div className="m-3 p-2.5 text-xs bg-red-100 text-red-800 border border-red-400 font-semibold">
          {error}
        </div>
      )}

      <div className="p-3 space-y-4">
        {/* Step 1: Upload */}
        <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4">
          <label className="flex flex-col items-center justify-center border-2 border-dashed border-[#7f9db9] bg-white p-5 cursor-pointer hover:bg-blue-50/40 transition-colors">
            <Upload className="w-7 h-7 text-[#214283] mb-1.5" />
            <span className="text-sm font-bold text-slate-900">{fileName ? `الملف المحدد: ${fileName}` : 'اضغط لاختيار ملف الأصناف والأسعار من جهازك'}</span>
            <span className="text-xs text-slate-500 mt-1">XLSX, XLS, CSV, TXT, DBF, XML, JSON</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt,.dbf,.xml,.json,.mdb,.accdb"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>

        {/* Step 2 & 3: Sheet, Header Row & Column Mapping */}
        {analysis && (
          <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-4 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-[#aca899]">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <span className="text-slate-600 font-semibold">نوع الملف: </span>
                  <strong className="font-mono-num">{analysis.fileType}</strong>
                </div>
                <div>
                  <span className="text-slate-600 font-semibold">إجمالي السجلات المكتشفة: </span>
                  <strong className="font-mono-num text-blue-900">{formatNum(analysis.totalRows)}</strong>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                {analysis.sheets.length > 1 && (
                  <div className="flex items-center gap-1.5">
                    <label className="font-bold">ورقة العمل:</label>
                    <select
                      value={sheetIndex}
                      onChange={(e) => analyzeFile(fileName, base64Content, Number(e.target.value))}
                      className="px-2 py-1 border border-[#7f9db9] bg-white"
                    >
                      {analysis.sheets.map((s) => (
                        <option key={s.index} value={s.index}>{s.name} ({s.rowCount})</option>
                      ))}
                    </select>
                  </div>
                )}
                <div className="flex items-center gap-1.5">
                  <label className="font-bold">صف العناوين (رقم):</label>
                  <input
                    type="number"
                    min="1"
                    value={headerRowIndex + 1}
                    onChange={(e) => analyzeFile(fileName, base64Content, sheetIndex, Math.max(0, Number(e.target.value) - 1))}
                    className="w-16 px-2 py-1 border border-[#7f9db9] text-center font-mono-num bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Column Mapping Grid */}
            <div>
              <h3 className="font-bold text-sm mb-2">مطابقة الأعمدة (تم الربط التلقائي — يمكنك التعديل يدويًا)</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
                {TARGET_FIELDS.map((tf) => (
                  <div key={tf.key} className="p-2 border border-[#aca899] bg-white">
                    <label className="block font-bold mb-1">
                      {tf.label} {tf.required && <span className="text-red-700">*</span>}
                    </label>
                    <select
                      value={mapping[tf.key] !== null && mapping[tf.key] !== undefined ? String(mapping[tf.key]) : ''}
                      onChange={(e) =>
                        setMapping({ ...mapping, [tf.key]: e.target.value === '' ? null : Number(e.target.value) })
                      }
                      className="w-full px-2 py-1 border border-[#7f9db9] bg-[#fdfdfd]"
                    >
                      <option value="">-- تجاهل --</option>
                      {analysis.headers.map((h, i) => (
                        <option key={i} value={i}>
                          [{i + 1}] {h || `عمود ${i + 1}`}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>

            {/* Import Policy & Scope */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-[#aca899]">
              <div>
                <label className="block font-bold mb-1">سياسة التكرار (عند تطابق الكود أو الباركود)</label>
                <select
                  value={duplicatePolicy}
                  onChange={(e) => setDuplicatePolicy(e.target.value as typeof duplicatePolicy)}
                  className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
                >
                  <option value="update">تحديث بيانات الصنف الموجود</option>
                  <option value="skip">تجاهل المكرر وعدم تغييره</option>
                  <option value="create_new">إنشاء صنف جديد بكود تلقائي</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">نطاق التحديث والاستيراد</label>
                <select
                  value={updateScope}
                  onChange={(e) => setUpdateScope(e.target.value as typeof updateScope)}
                  className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
                >
                  <option value="opening_stock">بيانات أساسية + أسعار + أرصدة افتتاحية بمستند مستقل</option>
                  <option value="master">بيانات أساسية وأسعار فقط (دون تغيير الأرصدة)</option>
                  <option value="prices_only">تحديث الأسعار فقط (دون تغيير الأرصدة)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">مخزن الأرصدة الافتتاحية</label>
                <select
                  value={warehouseId}
                  disabled={updateScope !== 'opening_stock'}
                  onChange={(e) => setWarehouseId(Number(e.target.value))}
                  className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white disabled:opacity-50"
                >
                  {defs?.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Preview Table */}
            <div>
              <h3 className="font-bold text-sm mb-2">معاينة البيانات (أول {analysis.previewRows.length} سجل من أصل {analysis.totalRows})</h3>
              <div className="overflow-x-auto max-h-60 border border-[#8c8c8c] bg-white">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#214283] text-white sticky top-0">
                      <th className="py-1.5 px-2 text-right border-l border-[#375da3]">#</th>
                      {analysis.headers.map((h, i) => (
                        <th key={i} className="py-1.5 px-2 text-right border-l border-[#375da3] whitespace-nowrap">{h || `عمود ${i + 1}`}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {analysis.previewRows.map((row, rIdx) => (
                      <tr key={rIdx} className={rIdx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                        <td className="py-1 px-2 font-mono-num text-slate-500">{rIdx + 1}</td>
                        {analysis.headers.map((_, cIdx) => (
                          <td key={cIdx} className="py-1 px-2 whitespace-nowrap">{row[cIdx] || ''}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Validation & Execute Actions */}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <button type="button" disabled={busy} onClick={runValidation} className="win-btn px-4 py-2 font-bold">
                فحص البيانات واكتشاف الأخطاء قبل الاستيراد
              </button>
              <button type="button" disabled={busy} onClick={executeImport} className="win-btn px-6 py-2 font-bold text-emerald-950">
                {busy ? 'جاري التنفيذ...' : 'اعتماد وتنفيذ الاستيراد الآن'}
              </button>
            </div>

            {validation && (
              <div className="p-3 bg-white border border-[#8c8c8c] space-y-2">
                <div className="flex flex-wrap gap-6 font-bold">
                  <span>إجمالي الصفوف: <strong className="font-mono-num">{validation.totalRows}</strong></span>
                  <span className="text-emerald-800">أصناف جديدة: <strong className="font-mono-num">{validation.newCount}</strong></span>
                  <span className="text-blue-900">مطابقة لموجود: <strong className="font-mono-num">{validation.existingMatchCount}</strong></span>
                  <span className="text-amber-700">تحذيرات تكرار: <strong className="font-mono-num">{validation.warningCount}</strong></span>
                  <span className="text-red-700">أخطاء: <strong className="font-mono-num">{validation.errorCount}</strong></span>
                </div>
                {validation.issues.length > 0 && (
                  <div className="max-h-36 overflow-y-auto border-t pt-2 space-y-1">
                    {validation.issues.map((iss, i) => (
                      <div key={i} className={`flex items-center gap-2 ${iss.type === 'ERROR' ? 'text-red-700' : 'text-amber-700'}`}>
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>سطر {iss.rowNumber} ({iss.name}): {iss.message}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {execResult && (
              <div className="p-3 bg-emerald-50 border border-emerald-500 space-y-2">
                <div className="flex items-center gap-2 font-bold text-emerald-900">
                  <CheckCircle2 className="w-5 h-5" />
                  تم تنفيذ عملية الاستيراد بنجاح (رقم العملية #{execResult.jobId})
                </div>
                <div className="flex flex-wrap gap-6 font-semibold">
                  <span>مضاف جديد: <strong className="font-mono-num">{execResult.insertedCount}</strong></span>
                  <span>محدّث: <strong className="font-mono-num">{execResult.updatedCount}</strong></span>
                  <span>متجاهل: <strong className="font-mono-num">{execResult.skippedCount}</strong></span>
                  <span>أخطاء: <strong className="font-mono-num text-red-700">{execResult.errorCount}</strong></span>
                  {execResult.openingDocNum && <span>مستند الأرصدة: <strong className="font-mono-num">{execResult.openingDocNum}</strong></span>}
                </div>
                {execResult.errors.length > 0 && (
                  <button type="button" onClick={downloadErrorsCsv} className="win-btn px-3 py-1 font-bold text-red-800">
                    تنزيل ملف الأخطاء (CSV)
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Import History & Safe Rollback */}
        <div className="bg-white border border-[#8c8c8c] overflow-x-auto">
          <div className="bg-[#f4f3ee] border-b border-[#8c8c8c] px-3 py-2 font-bold text-xs">
            سجل عمليات الاستيراد السابقة والتراجع الآمن
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#214283] text-white">
                <th className="py-2 px-3 text-right border-l border-[#375da3]">#</th>
                <th className="py-2 px-3 text-right border-l border-[#375da3]">اسم الملف</th>
                <th className="py-2 px-3 text-right border-l border-[#375da3]">النوع</th>
                <th className="py-2 px-3 text-center border-l border-[#375da3]">مضاف</th>
                <th className="py-2 px-3 text-center border-l border-[#375da3]">محدّث</th>
                <th className="py-2 px-3 text-center border-l border-[#375da3]">أخطاء</th>
                <th className="py-2 px-3 text-right border-l border-[#375da3]">التاريخ</th>
                <th className="py-2 px-3 text-center">التراجع</th>
              </tr>
            </thead>
            <tbody>
              {jobs.map((j, idx) => (
                <tr key={String(j.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                  <td className="py-1.5 px-3 font-mono-num">{String(j.id)}</td>
                  <td className="py-1.5 px-3 font-bold">{String(j.file_name)}</td>
                  <td className="py-1.5 px-3 font-mono-num">{String(j.file_type)}</td>
                  <td className="py-1.5 px-3 text-center font-mono-num text-emerald-700 font-bold">{String(j.inserted_count)}</td>
                  <td className="py-1.5 px-3 text-center font-mono-num text-blue-800 font-bold">{String(j.updated_count)}</td>
                  <td className="py-1.5 px-3 text-center font-mono-num text-red-700 font-bold">{String(j.error_count)}</td>
                  <td className="py-1.5 px-3 font-mono-num">{String(j.created_at)}</td>
                  <td className="py-1.5 px-3 text-center">
                    {Number(j.is_rolled_back) === 1 ? (
                      <span className="text-slate-400">تم التراجع</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => rollbackJob(Number(j.id))}
                        className="inline-flex items-center gap-1 text-red-700 font-bold hover:underline"
                      >
                        <RotateCcw className="w-3.5 h-3.5" /> تراجع آمن
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
