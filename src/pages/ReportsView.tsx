import React, { useEffect, useState } from 'react';
import { FileSpreadsheet, Printer, BarChart3, ClipboardList } from 'lucide-react';
import { apiFetch, downloadApiFile, todayDateStr } from '../api.ts';
import type { DefinitionsBundle } from '../types.ts';

interface ReportsViewProps {
  settings: Record<string, string>;
  canViewCost: boolean;
}

const REPORT_TYPES: Array<{ id: string; shortLabel: string; label: string; requiresCost?: boolean }> = [
  { id: 'SALES_SUMMARY', shortLabel: 'مبيعات', label: 'تقرير المبيعات التفصيلي' },
  { id: 'PURCHASES_SUMMARY', shortLabel: 'مشتريات', label: 'تقرير المشتريات التفصيلي' },
  { id: 'CASHBOX_MOVEMENT', shortLabel: 'الخزينة والبنوك', label: 'تقرير حركة الخزائن والبنوك' },
  { id: 'RETURNS', shortLabel: 'مرتجعات بيع وشراء', label: 'تقرير مرتجعات البيع والشراء' },
  { id: 'INVENTORY_BALANCES', shortLabel: 'أرصدة المخازن', label: 'تقرير أرصدة وتقييم المخزون' },
  { id: 'LOW_STOCK', shortLabel: 'النواقص وحد الطلب', label: 'الأصناف تحت حد الطلب' },
  { id: 'EXPENSES_REVENUES', shortLabel: 'مصروفات وإيرادات', label: 'تقرير المصروفات والإيرادات' },
  { id: 'TOP_SELLING', shortLabel: 'الأكثر مبيعاً', label: 'الأصناف الأكثر مبيعًا وربحية', requiresCost: true },
  { id: 'PROFIT_LOSS', shortLabel: 'صافي الربح والتكلفة', label: 'تقرير الأرباح والخسائر وتكلفة البضاعة المباعة', requiresCost: true },
];

export const ReportsView: React.FC<ReportsViewProps> = ({ settings, canViewCost }) => {
  const [defs, setDefs] = useState<DefinitionsBundle | null>(null);
  const [reportType, setReportType] = useState('SALES_SUMMARY');
  const [detailMode, setDetailMode] = useState<'DETAIL' | 'SUMMARY'>('DETAIL');
  const [fromDate, setFromDate] = useState('2020-01-01');
  const [toDate, setToDate] = useState(todayDateStr());
  const [warehouseId, setWarehouseId] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [supplierId, setSupplierId] = useState('');
  const [reportData, setReportData] = useState<{ title: string; rows: Array<Record<string, unknown>> }>({ title: '', rows: [] });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    apiFetch<DefinitionsBundle>('/api/definitions/all')
      .then(setDefs)
      .catch((err: unknown) => setError((err as Error).message));
  }, []);

  const generateReport = async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({
        type: reportType,
        from: fromDate,
        to: toDate,
        warehouse_id: warehouseId,
        customer_id: customerId,
        supplier_id: supplierId,
      });
      const res = await apiFetch<{ title: string; rows: Array<Record<string, unknown>> }>(`/api/reports/generate?${qs.toString()}`);
      setReportData(res);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void generateReport();
  }, [reportType, fromDate, toDate, warehouseId, customerId, supplierId]);

  const exportExcel = async () => {
    setError('');
    try {
      await downloadApiFile('/api/reports/export-excel', `MINA_NET_${reportType}_${todayDateStr()}.xlsx`, {
        method: 'POST',
        body: JSON.stringify(reportData),
      });
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const visibleTypes = REPORT_TYPES.filter((r) => !r.requiresCost || canViewCost);
  const columns = reportData.rows.length > 0 ? Object.keys(reportData.rows[0]) : [];

  return (
    <div className="bg-[#ece9d8] text-slate-900">
      {error && <div className="m-3 p-2 text-xs bg-red-100 text-red-800 border border-red-400 font-semibold">{error}</div>}
      {/* Upper Classic Reports Selector Matrix (matching screenshot 1140) */}
      <div className="no-print p-3 border-b border-[#aca899] space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded bg-[#214283] text-white flex items-center justify-center border border-slate-700 shadow-xs">
              <BarChart3 className="w-5 h-5" />
            </div>
            <h2 className="font-display font-black text-xl text-slate-900">التقارير</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={generateReport}
              className="win-btn px-3 py-1.5 font-bold flex items-center gap-1.5"
            >
              <ClipboardList className="w-3.5 h-3.5 text-amber-700" /> تحديث المعاينة
            </button>
            <button
              type="button"
              onClick={exportExcel}
              disabled={reportData.rows.length === 0}
              className="win-btn px-3 py-1.5 font-bold flex items-center gap-1.5 text-emerald-900"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-700" /> تصدير Excel
            </button>
            <button
              type="button"
              onClick={() => window.print()}
              className="win-btn px-3 py-1.5 font-bold flex items-center gap-1.5 text-blue-950"
            >
              <Printer className="w-3.5 h-3.5 text-blue-800" /> طباعة / PDF
            </button>
          </div>
        </div>

        {/* Classic Access Framed Group Boxes Row */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
          {/* Right Framed Box: نوع التقرير (3-Column Radio Matrix) */}
          <fieldset className="lg:col-span-6 border-2 border-[#7f7f7f] bg-[#f4f3ee] p-2.5 rounded-xs">
            <legend className="px-2 font-bold text-slate-900 bg-[#ece9d8] border border-[#aca899] text-[11px]">
              نوع التقرير
            </legend>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-2 pt-1">
              {visibleTypes.map((r) => (
                <label
                  key={r.id}
                  className={`flex items-center gap-1.5 cursor-pointer px-1.5 py-0.5 rounded-xs ${
                    reportType === r.id ? 'bg-[#214283] text-white font-bold' : 'hover:bg-[#e1ded1] text-slate-900'
                  }`}
                >
                  <input
                    type="radio"
                    name="mina_report_type"
                    checked={reportType === r.id}
                    onChange={() => setReportType(r.id)}
                    className="accent-[#214283]"
                  />
                  <span className="truncate">{r.shortLabel}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Center Framed Box: البيان + الفترة */}
          <div className="lg:col-span-4 flex flex-col justify-between gap-2">
            <fieldset className="border-2 border-[#7f7f7f] bg-[#f4f3ee] px-3 py-2 rounded-xs">
              <legend className="px-2 font-bold text-slate-900 bg-[#ece9d8] border border-[#aca899] text-[11px]">
                البيان والفلاتر
              </legend>
              <div className="flex flex-wrap items-center gap-4 mb-2">
                <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                  <input
                    type="radio"
                    checked={detailMode === 'DETAIL'}
                    onChange={() => setDetailMode('DETAIL')}
                    className="accent-[#214283]"
                  />
                  تفصيلي
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer font-semibold">
                  <input
                    type="radio"
                    checked={detailMode === 'SUMMARY'}
                    onChange={() => setDetailMode('SUMMARY')}
                    className="accent-[#214283]"
                  />
                  إجمالي
                </label>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="px-2 py-1 border border-[#7f9db9] bg-white text-slate-900"
                >
                  <option value="">&lt;كل المخازن&gt;</option>
                  {defs?.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
                {reportType === 'PURCHASES_SUMMARY' ? (
                  <select
                    value={supplierId}
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="px-2 py-1 border border-[#7f9db9] bg-white text-slate-900"
                  >
                    <option value="">&lt;كل الموردين&gt;</option>
                    {defs?.suppliers.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                ) : (
                  <select
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className="px-2 py-1 border border-[#7f9db9] bg-white text-slate-900"
                  >
                    <option value="">&lt;كل العملاء&gt;</option>
                    {defs?.customers.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                )}
              </div>
            </fieldset>

            <div className="flex items-center gap-2 bg-[#f4f3ee] border border-[#aca899] px-2.5 py-1.5">
              <span className="font-bold whitespace-nowrap">الفترة من</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="flex-1 px-1.5 py-0.5 border border-[#7f9db9] bg-white font-mono-num text-center"
              />
              <span className="font-bold">إلى</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="flex-1 px-1.5 py-0.5 border border-[#7f9db9] bg-white font-mono-num text-center"
              />
            </div>
          </div>

          {/* Left Framed Box: عرض */}
          <fieldset className="lg:col-span-2 border-2 border-[#7f7f7f] bg-[#f4f3ee] p-2.5 rounded-xs flex flex-col justify-between">
            <legend className="px-2 font-bold text-slate-900 bg-[#ece9d8] border border-[#aca899] text-[11px]">
              عرض وإخراج
            </legend>
            <div className="grid grid-cols-2 gap-1.5 pt-1">
              <button type="button" onClick={generateReport} className="win-btn py-1.5 font-bold">
                معاينة
              </button>
              <button type="button" onClick={() => window.print()} className="win-btn py-1.5 font-bold">
                PDF
              </button>
              <button type="button" onClick={() => window.print()} className="win-btn py-1.5 font-bold">
                طباعة
              </button>
              <button
                type="button"
                onClick={exportExcel}
                disabled={reportData.rows.length === 0}
                className="win-btn py-1.5 font-bold text-emerald-900"
              >
                Excel
              </button>
            </div>
            <div className="text-[11px] text-center text-slate-600 font-mono-num pt-1">
              السجلات: {reportData.rows.length}
            </div>
          </fieldset>
        </div>
      </div>

      {/* Classic Blue Print-Preview Canvas framing the White A4 Report Sheet (matching screenshot 900) */}
      <div
        className="p-4 sm:p-6 min-h-[420px]"
        style={{ background: 'linear-gradient(135deg, #6e92be 0%, #8aa9cf 50%, #a7c2e2 100%)' }}
      >
        <div className="max-w-5xl mx-auto bg-white border border-slate-700 shadow-2xl p-6 text-slate-900">
          {/* Paper Header */}
          <div className="flex flex-wrap justify-between items-start pb-3 mb-4 border-b-2 border-slate-900 gap-4">
            <div>
              <div className="text-lg font-display font-black text-blue-950">
                {reportData.title || 'معاينة التقرير'}
              </div>
              <div className="text-xs font-bold text-blue-900 mt-1 font-mono-num">
                عن الفترة من {fromDate} إلى {toDate}
              </div>
            </div>
            <div className="text-left">
              <div className="font-display font-black text-base text-slate-900">
                {settings.company_name || 'Mina Net'}
              </div>
              <div className="text-[11px] text-slate-600 font-mono-num">
                تاريخ الطباعة: {todayDateStr()}
              </div>
            </div>
          </div>

          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500 font-bold">جاري إعداد التقرير...</div>
          ) : reportData.rows.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 font-bold">
              لا توجد بيانات مطابقة للفترة والفلاتر المحددة
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse border border-slate-700">
                <thead>
                  <tr className="bg-slate-100 border-b-2 border-slate-900">
                    {columns.map((col) => (
                      <th key={col} className="py-2 px-2.5 text-right font-bold border border-slate-400 whitespace-nowrap">
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {reportData.rows.map((row, idx) => (
                    <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                      {columns.map((col) => {
                        const val = row[col];
                        const isNum = typeof val === 'number';
                        return (
                          <td key={col} className={`py-1.5 px-2.5 border border-slate-300 ${isNum ? 'font-mono-num font-semibold' : ''}`}>
                            {isNum ? val.toLocaleString('en-US', { maximumFractionDigits: 2 }) : String(val ?? '-')}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Classic Print Preview Footer Status Bar (matching bottom of screenshot 900) */}
      <div className="no-print h-7 bg-[#d8e4f2] border-t border-[#8ea4bd] px-3 flex items-center justify-between text-[11px] text-slate-800 font-mono-num">
        <span>Page: 1 | السجلات: {reportData.rows.length}</span>
        <span>{detailMode === 'DETAIL' ? 'وضع العرض: تفصيلي' : 'وضع العرض: إجمالي'}</span>
      </div>
    </div>
  );
};
