import React, { useEffect, useState } from 'react';
import { RotateCcw, RotateCw, CheckCircle2 } from 'lucide-react';
import { apiFetch, formatMoney, formatNum, todayDateStr } from '../api.ts';
import type { DefinitionsBundle } from '../types.ts';

interface ReturnsViewProps {
  settings: Record<string, string>;
  initialTab?: 'sales' | 'purchase';
}

export const ReturnsView: React.FC<ReturnsViewProps> = ({ settings, initialTab = 'sales' }) => {
  const [tab, setTab] = useState<'sales' | 'purchase'>(initialTab);
  const [defs, setDefs] = useState<DefinitionsBundle | null>(null);
  const [invoices, setInvoices] = useState<Array<Record<string, unknown>>>([]);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string>('');
  const [invoiceItems, setInvoiceItems] = useState<Array<Record<string, unknown>>>([]);
  const [returnQtys, setReturnQtys] = useState<Record<number, number>>({});
  const [conditions, setConditions] = useState<Record<number, 'VALID' | 'DAMAGED' | 'INSPECTION'>>({});
  const [settlementType, setSettlementType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [cashboxId, setCashboxId] = useState<number>(1);
  const [reason, setReason] = useState('');
  const [returnDate, setReturnDate] = useState(todayDateStr());
  const [returnsHistory, setReturnsHistory] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const currency = settings.currency || 'ج.م.';

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadTab = async (t: 'sales' | 'purchase') => {
    setSelectedInvoiceId('');
    setInvoiceItems([]);
    setReturnQtys({});
    setError('');
    setSuccess('');
    try {
      const [d, invs, hist] = await Promise.all([
        apiFetch<DefinitionsBundle>('/api/definitions/all'),
        apiFetch<Array<Record<string, unknown>>>(t === 'sales' ? '/api/sales' : '/api/purchases'),
        apiFetch<Array<Record<string, unknown>>>(t === 'sales' ? '/api/returns/sales' : '/api/returns/purchases'),
      ]);
      setDefs(d);
      if (d.cashboxes[0]) setCashboxId(d.cashboxes[0].id);
      setInvoices(invs.filter((i) => i.status === 'APPROVED'));
      setReturnsHistory(hist);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadTab(tab);
  }, [tab]);

  const loadInvoiceItems = async (idStr: string) => {
    setSelectedInvoiceId(idStr);
    setError('');
    if (!idStr) {
      setInvoiceItems([]);
      return;
    }
    try {
      const endpoint = tab === 'sales' ? `/api/sales/${idStr}` : `/api/purchases/${idStr}`;
      const data = await apiFetch<{ invoice: Record<string, unknown>; items: Array<Record<string, unknown>> }>(endpoint);
      setInvoiceItems(data.items);
      const qMap: Record<number, number> = {};
      const cMap: Record<number, 'VALID' | 'DAMAGED' | 'INSPECTION'> = {};
      for (const it of data.items) {
        qMap[Number(it.id)] = 0;
        cMap[Number(it.id)] = 'VALID';
      }
      setReturnQtys(qMap);
      setConditions(cMap);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const submitReturn = async () => {
    setError('');
    setSuccess('');
    const itemsPayload = invoiceItems
      .filter((it) => Number(returnQtys[Number(it.id)] || 0) > 0)
      .map((it) => ({
        [tab === 'sales' ? 'sales_item_id' : 'purchase_item_id']: Number(it.id),
        quantity: Number(returnQtys[Number(it.id)]),
        item_condition: conditions[Number(it.id)] || 'VALID',
      }));

    if (!selectedInvoiceId || itemsPayload.length === 0) {
      setError('يرجى اختيار الفاتورة وتحديد الكميات المرتجعة');
      return;
    }

    try {
      const endpoint = tab === 'sales' ? '/api/returns/sales' : '/api/returns/purchases';
      const body =
        tab === 'sales'
          ? { sales_invoice_id: Number(selectedInvoiceId), return_date: returnDate, settlement_type: settlementType, cashbox_id: cashboxId, reason, items: itemsPayload }
          : { purchase_invoice_id: Number(selectedInvoiceId), return_date: returnDate, settlement_type: settlementType, cashbox_id: cashboxId, reason, items: itemsPayload };
      const res = await apiFetch<{ return_number: string; total_amount: number }>(endpoint, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setSuccess(`تم اعتماد المرتجع رقم ${res.return_number} بقيمة ${formatMoney(res.total_amount, currency)}`);
      loadTab(tab);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="bg-[#ece9d8] text-slate-900">
      {/* Classic Sub-Tabs Strip */}
      <div className="bg-[#d6d2c2] border-b border-[#aca899] px-3 py-2 flex flex-wrap items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => setTab('sales')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'sales' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <RotateCw className="w-3.5 h-3.5" /> مرتجع مبيعات
        </button>
        <button
          type="button"
          onClick={() => setTab('purchase')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'purchase' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <RotateCcw className="w-3.5 h-3.5" /> مرتجع مشتريات
        </button>
      </div>

      {error && <div className="m-3 p-2 text-xs bg-red-100 text-red-800 border border-red-400 font-semibold">{error}</div>}
      {success && <div className="m-3 p-2 text-xs bg-emerald-100 text-emerald-900 border border-emerald-500 font-semibold">{success}</div>}

      <div className="p-3 space-y-4">
        <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="md:col-span-2">
              <label className="block font-bold mb-1">
                {tab === 'sales' ? 'اختر فاتورة البيع الأصلية' : 'اختر فاتورة الشراء الأصلية'}
              </label>
              <select
                value={selectedInvoiceId}
                onChange={(e) => loadInvoiceItems(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
              >
                <option value="">-- اختر الفاتورة --</option>
                {invoices.map((inv) => (
                  <option key={String(inv.id)} value={String(inv.id)}>
                    {String(inv.invoice_number)} · {String(tab === 'sales' ? inv.customer_name : inv.supplier_name)} · {formatMoney(Number(inv.net_total), currency)} ({String(inv.invoice_date).slice(0, 10)})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold mb-1">تاريخ المرتجع</label>
              <input
                type="date"
                value={returnDate}
                onChange={(e) => setReturnDate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">تسوية القيمة</label>
              <select
                value={settlementType}
                onChange={(e) => setSettlementType(e.target.value as 'CASH' | 'CREDIT')}
                className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
              >
                <option value="CASH">تسوية نقدية (من/إلى الخزينة)</option>
                <option value="CREDIT">خصم من الحساب الآجل</option>
              </select>
            </div>
          </div>

          {invoiceItems.length > 0 && (
            <>
              <div className="bg-white border border-[#8c8c8c] overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#214283] text-white">
                      <th className="py-2 px-3 text-right border-l border-[#375da3]">الصنف</th>
                      <th className="py-2 px-3 text-center border-l border-[#375da3]">الكمية الأصلية</th>
                      <th className="py-2 px-3 text-center border-l border-[#375da3]">المرتجع سابقًا</th>
                      <th className="py-2 px-3 text-center border-l border-[#375da3]">المتاح للإرجاع</th>
                      <th className="py-2 px-3 text-center border-l border-[#375da3] w-28">الكمية المرتجعة</th>
                      {tab === 'sales' && <th className="py-2 px-3 text-center border-l border-[#375da3]">حالة الصنف</th>}
                      <th className="py-2 px-3 text-left">سعر الوحدة الصافي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoiceItems.map((it, idx) => {
                      const id = Number(it.id);
                      const origQty = Number(it.quantity);
                      const prevRet = Number(it.returned_qty || 0);
                      const avail = Math.max(0, origQty - prevRet);
                      const unitNet = origQty > 0 ? Number(it.line_total) / origQty : 0;
                      return (
                        <tr key={id} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                          <td className="py-1.5 px-3 font-bold">{String(it.product_name)}</td>
                          <td className="py-1.5 px-3 text-center font-mono-num">{formatNum(origQty)}</td>
                          <td className="py-1.5 px-3 text-center font-mono-num text-slate-500">{formatNum(prevRet)}</td>
                          <td className="py-1.5 px-3 text-center font-mono-num font-bold text-blue-800">{formatNum(avail)}</td>
                          <td className="py-1 px-3">
                            <input
                              type="number"
                              min="0"
                              max={avail}
                              step="any"
                              disabled={avail <= 0}
                              value={returnQtys[id] || 0}
                              onChange={(e) => setReturnQtys({ ...returnQtys, [id]: Number(e.target.value) })}
                              className="w-full px-2 py-0.5 border border-[#7f9db9] bg-white text-center font-mono-num"
                            />
                          </td>
                          {tab === 'sales' && (
                            <td className="py-1 px-3 text-center">
                              <select
                                value={conditions[id] || 'VALID'}
                                onChange={(e) => setConditions({ ...conditions, [id]: e.target.value as 'VALID' | 'DAMAGED' | 'INSPECTION' })}
                                className="px-2 py-0.5 border border-[#7f9db9] bg-white"
                              >
                                <option value="VALID">صالح (يُعاد للمخزن)</option>
                                <option value="DAMAGED">تالف (لا يُعاد للمخزن)</option>
                                <option value="INSPECTION">تحت الفحص</option>
                              </select>
                            </td>
                          )}
                          <td className="py-1.5 px-3 text-left font-mono-num font-bold">{formatMoney(unitNet, currency)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end pt-1">
                <div>
                  <label className="block font-bold mb-1">سبب المرتجع</label>
                  <input
                    type="text"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="مثال: عيب صناعة / استبدال..."
                    className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
                  />
                </div>
                {settlementType === 'CASH' && (
                  <div>
                    <label className="block font-bold mb-1">الخزينة</label>
                    <select
                      value={cashboxId}
                      onChange={(e) => setCashboxId(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
                    >
                      {defs?.cashboxes.map((cb) => (
                        <option key={cb.id} value={cb.id}>{cb.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                <button
                  type="button"
                  onClick={submitReturn}
                  className="win-btn flex items-center justify-center gap-1.5 py-2 px-4 font-bold text-blue-950"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-800" />
                  اعتماد مستند المرتجع
                </button>
              </div>
            </>
          )}
        </div>

        {/* History */}
        <div className="bg-white border border-[#8c8c8c] overflow-x-auto">
          <div className="bg-[#f4f3ee] border-b border-[#8c8c8c] px-3 py-2 font-bold text-xs">
            {tab === 'sales' ? 'سجل مرتجعات المبيعات' : 'سجل مرتجعات المشتريات'}
          </div>
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-[#214283] text-white">
                <th className="py-2 px-3 text-right border-l border-[#375da3]">رقم المرتجع</th>
                <th className="py-2 px-3 text-right border-l border-[#375da3]">الفاتورة الأصلية</th>
                <th className="py-2 px-3 text-right border-l border-[#375da3]">التاريخ</th>
                <th className="py-2 px-3 text-right border-l border-[#375da3]">الطرف</th>
                <th className="py-2 px-3 text-left border-l border-[#375da3]">القيمة</th>
                <th className="py-2 px-3 text-right">السبب</th>
              </tr>
            </thead>
            <tbody>
              {returnsHistory.map((r, idx) => (
                <tr key={String(r.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                  <td className="py-1.5 px-3 font-mono-num font-bold">{String(r.return_number)}</td>
                  <td className="py-1.5 px-3 font-mono-num">{String(r.original_invoice_number)}</td>
                  <td className="py-1.5 px-3 font-mono-num">{String(r.return_date)}</td>
                  <td className="py-1.5 px-3">{String(tab === 'sales' ? r.customer_name : r.supplier_name)}</td>
                  <td className="py-1.5 px-3 text-left font-mono-num font-bold">{formatMoney(Number(r.total_amount), currency)}</td>
                  <td className="py-1.5 px-3 text-slate-600">{String(r.reason || '-')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
