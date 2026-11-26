import React, { useEffect, useState } from 'react';
import { Plus, Trash2, Save, Printer, Search, RotateCcw, History, X } from 'lucide-react';
import { apiFetch, formatMoney, nowDateTimeStr } from '../api.ts';
import type { DefinitionsBundle, Product, UserInfo } from '../types.ts';
import { PrintInvoiceModal } from '../components/PrintInvoiceModal.tsx';

interface PurchaseLine {
  product_id: number;
  product_code: string;
  product_name: string;
  unit_id: number;
  unit_name: string;
  conversion_factor: number;
  quantity: number;
  unit_price: number;
  discount_percent: number;
  discount_value: number;
  line_total: number;
}

interface PurchasesViewProps {
  settings: Record<string, string>;
  currentUser: UserInfo;
}

export const PurchasesView: React.FC<PurchasesViewProps> = ({ settings, currentUser }) => {
  const [defs, setDefs] = useState<DefinitionsBundle | null>(null);
  const [invoiceDate, setInvoiceDate] = useState(nowDateTimeStr());
  const [supplierInvoiceNo, setSupplierInvoiceNo] = useState('');
  const [supplierId, setSupplierId] = useState<number>(1);
  const [warehouseId, setWarehouseId] = useState<number>(1);
  const [cashboxId, setCashboxId] = useState<number>(1);
  const [paymentType, setPaymentType] = useState<'CASH' | 'CREDIT'>('CASH');
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0);
  const [extraExpenses, setExtraExpenses] = useState<number>(0);
  const [allocateExpenses, setAllocateExpenses] = useState<boolean>(true);
  const [paidAmount, setPaidAmount] = useState<string>('');
  const [notes, setNotes] = useState('');

  const [itemQuery, setItemQuery] = useState('');
  const [lookupResults, setLookupResults] = useState<Product[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [entryQty, setEntryQty] = useState<number>(1);
  const [entryPrice, setEntryPrice] = useState<number>(0);
  const [entryUnitId, setEntryUnitId] = useState<number>(1);
  const [entryFactor, setEntryFactor] = useState<number>(1);
  const [entryUnitName, setEntryUnitName] = useState<string>('قطعة');

  const [lines, setLines] = useState<PurchaseLine[]>([]);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [lastSavedInvoice, setLastSavedInvoice] = useState<{ invoice_number: string; id: number } | null>(null);

  const [printOpen, setPrintOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyList, setHistoryList] = useState<Array<Record<string, unknown>>>([]);
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickProd, setQuickProd] = useState({ name: '', code: '', barcode: '', purchase_price: '0', sale_price: '0' });

  const currency = settings.currency || 'ج.م.';

  useEffect(() => {
    apiFetch<DefinitionsBundle>('/api/definitions/all')
      .then((d) => {
        setDefs(d);
        if (d.suppliers[0]) setSupplierId(d.suppliers[0].id);
        const defWh = d.warehouses.find((w) => w.is_default === 1) || d.warehouses[0];
        if (defWh) setWarehouseId(defWh.id);
        const defCb = d.cashboxes.find((c) => c.is_default === 1) || d.cashboxes[0];
        if (defCb) setCashboxId(defCb.id);
      })
      .catch((err: unknown) => setError((err as Error).message));
  }, []);

  const searchProduct = async (q: string) => {
    setItemQuery(q);
    if (!q.trim()) {
      setLookupResults([]);
      return;
    }
    try {
      const res = await apiFetch<Product[]>(`/api/products/lookup?q=${encodeURIComponent(q)}&warehouse_id=${warehouseId}`);
      setLookupResults(res);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const pickProduct = (p: Product) => {
    setSelectedProduct(p);
    setEntryUnitId(p.base_unit_id);
    setEntryUnitName(p.unit_name || 'قطعة');
    setEntryFactor(1);
    setEntryPrice(p.purchase_price || p.last_cost || 0);
    setEntryQty(1);
    setLookupResults([]);
  };

  const insertLine = () => {
    if (!selectedProduct || entryQty <= 0) return;
    setLines((prev) => [
      ...prev,
      {
        product_id: selectedProduct.id,
        product_code: selectedProduct.code,
        product_name: selectedProduct.name,
        unit_id: entryUnitId,
        unit_name: entryUnitName,
        conversion_factor: entryFactor,
        quantity: entryQty,
        unit_price: entryPrice,
        discount_percent: 0,
        discount_value: 0,
        line_total: entryQty * entryPrice,
      },
    ]);
    setSelectedProduct(null);
    setItemQuery('');
    setEntryQty(1);
  };

  const updateLine = (idx: number, patch: Partial<PurchaseLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const next = { ...l, ...patch };
        const gross = next.quantity * next.unit_price;
        const disc = next.discount_percent > 0 ? (gross * next.discount_percent) / 100 : next.discount_value;
        next.discount_value = disc;
        next.line_total = Math.max(0, gross - disc);
        return next;
      })
    );
  };

  const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
  const itemsDiscount = lines.reduce((s, l) => s + l.discount_value, 0);
  const taxRate = settings.tax_enabled === '1' ? Number(settings.tax_rate || 0) : 0;
  const linesNet = subtotal - itemsDiscount - invoiceDiscount;
  const taxAmount = Number(((Math.max(0, linesNet) * taxRate) / 100).toFixed(2));
  const netTotal = Number((Math.max(0, linesNet) + taxAmount + extraExpenses).toFixed(2));
  const effectivePaid = paidAmount !== '' ? Number(paidAmount) : paymentType === 'CREDIT' ? 0 : netTotal;
  const remaining = Math.max(0, netTotal - effectivePaid);

  const selectedSupplier = defs?.suppliers.find((s) => s.id === supplierId);
  const selectedWarehouse = defs?.warehouses.find((w) => w.id === warehouseId);

  const resetForm = () => {
    setLines([]);
    setSupplierInvoiceNo('');
    setInvoiceDiscount(0);
    setExtraExpenses(0);
    setPaidAmount('');
    setNotes('');
    setError('');
    setSuccessMsg('');
    setLastSavedInvoice(null);
    setInvoiceDate(nowDateTimeStr());
  };

  const handleSave = async () => {
    if (lines.length === 0) {
      setError('يرجى إضافة صنف واحد على الأقل');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await apiFetch<{ id: number; invoice_number: string }>('/api/purchases', {
        method: 'POST',
        body: JSON.stringify({
          invoice_date: invoiceDate,
          supplier_invoice_no: supplierInvoiceNo,
          supplier_id: supplierId,
          warehouse_id: warehouseId,
          cashbox_id: cashboxId,
          payment_type: paymentType,
          invoice_discount: invoiceDiscount,
          tax_amount: taxAmount,
          extra_expenses: extraExpenses,
          allocate_expenses: allocateExpenses,
          paid_amount: effectivePaid,
          notes,
          items: lines,
        }),
      });
      setLastSavedInvoice(res);
      setSuccessMsg(`تم حفظ فاتورة المشتريات رقم ${res.invoice_number} وتحديث المخزون ومتوسط التكلفة`);
      apiFetch<DefinitionsBundle>('/api/definitions/all').then(setDefs);
    } catch (err: unknown) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const loadHistory = async () => {
    setError('');
    try {
      const list = await apiFetch<Array<Record<string, unknown>>>('/api/purchases');
      setHistoryList(list);
      setHistoryOpen(true);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const cancelInvoice = async (id: number) => {
    try {
      await apiFetch(`/api/purchases/${id}/cancel`, { method: 'POST' });
      await loadHistory();
      apiFetch<DefinitionsBundle>('/api/definitions/all')
        .then(setDefs)
        .catch((err: unknown) => setError((err as Error).message));
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const saveQuickProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const created = await apiFetch<{ id: number }>('/api/products', {
        method: 'POST',
        body: JSON.stringify({
          ...quickProd,
          base_unit_id: defs?.units[0]?.id || 1,
          purchase_price: Number(quickProd.purchase_price),
          sale_price: Number(quickProd.sale_price),
        }),
      });
      const [newDefs, matches] = await Promise.all([
        apiFetch<DefinitionsBundle>('/api/definitions/all'),
        apiFetch<Product[]>(`/api/products/lookup?q=${encodeURIComponent(quickProd.name)}&warehouse_id=${warehouseId}`),
      ]);
      setDefs(newDefs);
      const added = matches.find((m) => m.id === created.id) || matches[0];
      if (added) pickProduct(added);
      setQuickAddOpen(false);
      setQuickProd({ name: '', code: '', barcode: '', purchase_price: '0', sale_price: '0' });
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="bg-amber-50/70 text-slate-900 border border-amber-200/90 rounded-xl p-3.5 space-y-3 text-xs shadow-xs">
      {/* Purchase Invoice Header */}
      <div className="border-b border-amber-200 pb-3 space-y-2">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div className="md:col-span-3 flex items-center gap-2">
            <span className="font-bold text-slate-700 whitespace-nowrap">المستخدم</span>
            <div className="flex-1 bg-white border border-slate-300 rounded-md px-2.5 py-1.5 font-bold">{currentUser.username}</div>
          </div>
          <div className="md:col-span-3 flex justify-center">
            <div className="bg-amber-700 text-white border border-amber-700 rounded-lg px-6 py-1.5 font-display font-extrabold text-sm shadow-xs">
              فاتورة شراء
            </div>
          </div>
          <div className="md:col-span-3 flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">التاريخ</span>
            <div className="flex-1 bg-white border border-slate-500 px-2 py-1 text-center font-mono-num font-semibold">{invoiceDate}</div>
          </div>
          <div className="md:col-span-3 flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">رقم الفاتورة</span>
            <div className="flex-1 bg-white border border-slate-500 px-2 py-1 text-center font-mono-num font-bold text-red-900">
              {lastSavedInvoice ? lastSavedInvoice.invoice_number : 'تلقائي'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-center">
          <div className="md:col-span-4 flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">المورد</span>
            <select value={supplierId} onChange={(e) => setSupplierId(Number(e.target.value))} className="flex-1 px-2 py-1 border border-slate-500 bg-white font-bold">
              {defs?.suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3 flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">رصيد المورد</span>
            <div className="flex-1 bg-white border border-slate-500 px-2 py-1 text-center font-mono-num font-extrabold">
              {formatMoney(selectedSupplier?.current_balance || 0, currency)}
            </div>
          </div>
          <div className="md:col-span-2 flex items-center gap-1.5">
            <span className="font-bold whitespace-nowrap">المخزن</span>
            <select value={warehouseId} onChange={(e) => setWarehouseId(Number(e.target.value))} className="flex-1 px-1.5 py-1 border border-slate-500 bg-white font-semibold">
              {defs?.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div className="md:col-span-3 flex items-center gap-1.5">
            <span className="font-bold whitespace-nowrap">فاتورة المورد</span>
            <input type="text" value={supplierInvoiceNo} onChange={(e) => setSupplierInvoiceNo(e.target.value)} placeholder="اختياري..." className="flex-1 px-2 py-1 border border-slate-500 bg-white font-mono-num" />
          </div>
        </div>
      </div>

      {/* Item Entry Band */}
      <div className="border border-amber-200 bg-white/95 rounded-lg p-3 grid grid-cols-1 md:grid-cols-12 gap-2 items-center shadow-2xs">
        <div className="md:col-span-4 relative flex items-center gap-1.5">
          <span className="font-bold whitespace-nowrap">بحث الصنف</span>
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute right-2 top-1.5" />
            <input
              type="text"
              value={itemQuery}
              onChange={(e) => searchProduct(e.target.value)}
              placeholder="الكود أو الباركود أو الاسم..."
              className="w-full pr-7 pl-2 py-1 border border-slate-500 bg-white font-semibold"
            />
            {lookupResults.length > 0 && (
              <div className="absolute z-30 w-full mt-0.5 bg-white border border-slate-500 shadow-lg max-h-52 overflow-y-auto">
                {lookupResults.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => pickProduct(p)}
                    className="w-full px-2.5 py-1.5 text-right hover:bg-[#fae2da] flex justify-between border-b border-slate-200"
                  >
                    <span className="font-bold">{p.name} ({p.code})</span>
                    <span className="font-mono-num text-slate-600">{formatMoney(p.purchase_price, currency)}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="md:col-span-3 flex items-center gap-1.5">
          <span className="font-bold whitespace-nowrap">الصنف</span>
          <div className="flex-1 px-2 py-1 border border-slate-500 bg-white font-bold truncate">
            {selectedProduct ? selectedProduct.name : 'اختر صنفًا...'}
          </div>
        </div>
        <div className="md:col-span-1 flex items-center gap-1">
          <span className="font-bold">كمية</span>
          <input type="number" min="0.01" step="any" value={entryQty} onChange={(e) => setEntryQty(Number(e.target.value))} className="w-full px-1 py-1 border border-slate-500 bg-white text-center font-mono-num font-bold" />
        </div>
        <div className="md:col-span-2 flex items-center gap-1.5">
          <span className="font-bold whitespace-nowrap">السعر</span>
          <input type="number" min="0" step="0.01" value={entryPrice} onChange={(e) => setEntryPrice(Number(e.target.value))} className="w-full px-2 py-1 border border-slate-500 bg-white text-center font-mono-num font-bold" />
        </div>
        <div className="md:col-span-2 flex gap-1.5">
          <button type="button" disabled={!selectedProduct} onClick={insertLine} className="win-btn flex-1 py-1 px-2 font-bold rounded-xs flex items-center justify-center gap-1">
            <Plus className="w-3.5 h-3.5" /> إدراج
          </button>
          <button type="button" onClick={() => setQuickAddOpen(true)} className="win-btn py-1 px-2 font-bold rounded-xs whitespace-nowrap">
            صنف سريع
          </button>
        </div>
      </div>

      {error && <div className="p-2.5 bg-red-50 text-red-900 border border-red-300 rounded-lg font-semibold">{error}</div>}
      {successMsg && <div className="p-2.5 bg-emerald-50 text-emerald-900 border border-emerald-300 rounded-lg font-semibold">{successMsg}</div>}

      {/* Items Data Grid */}
      <div className="bg-white border border-slate-300 rounded-lg min-h-[210px] overflow-x-auto shadow-2xs">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className="bg-gradient-to-b from-slate-100 to-amber-100/70 border-b border-slate-300 text-slate-900">
              <th className="py-1.5 px-2.5 border-l border-slate-400 text-right">رقم الصنف</th>
              <th className="py-1.5 px-2.5 border-l border-slate-400 text-right">الصنـــــــف</th>
              <th className="py-1.5 px-2.5 border-l border-slate-400 text-center w-20">الكمية</th>
              <th className="py-1.5 px-2.5 border-l border-slate-400 text-center">الوحدة</th>
              <th className="py-1.5 px-2.5 border-l border-slate-400 text-center w-24">سعر الوحدة</th>
              <th className="py-1.5 px-2.5 border-l border-slate-400 text-center w-20">خصم %</th>
              <th className="py-1.5 px-2.5 border-l border-slate-400 text-center">الإجمالي</th>
              <th className="py-1.5 px-2.5 text-center w-12">حذف</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-12 text-center text-slate-400">لا توجد أصناف مضافة بعد</td>
              </tr>
            ) : (
              lines.map((l, idx) => (
                <tr key={idx} className="border-b border-slate-300 hover:bg-[#fdf2ee]">
                  <td className="py-1.5 px-2.5 border-l border-slate-300 font-mono-num">{l.product_code}</td>
                  <td className="py-1.5 px-2.5 border-l border-slate-300 font-bold">{l.product_name}</td>
                  <td className="py-1 px-1.5 border-l border-slate-300">
                    <input type="number" min="0.01" step="any" value={l.quantity} onChange={(e) => updateLine(idx, { quantity: Number(e.target.value) })} className="w-full px-1 py-0.5 border border-slate-300 text-center font-mono-num bg-white" />
                  </td>
                  <td className="py-1.5 px-2.5 border-l border-slate-300 text-center">{l.unit_name}</td>
                  <td className="py-1 px-1.5 border-l border-slate-300">
                    <input type="number" min="0" step="0.01" value={l.unit_price} onChange={(e) => updateLine(idx, { unit_price: Number(e.target.value) })} className="w-full px-1 py-0.5 border border-slate-300 text-center font-mono-num bg-white" />
                  </td>
                  <td className="py-1 px-1.5 border-l border-slate-300">
                    <input type="number" min="0" max="100" value={l.discount_percent} onChange={(e) => updateLine(idx, { discount_percent: Number(e.target.value) })} className="w-full px-1 py-0.5 border border-slate-300 text-center font-mono-num bg-white" />
                  </td>
                  <td className="py-1.5 px-2.5 border-l border-slate-300 text-center font-mono-num font-bold">{formatMoney(l.line_total, currency)}</td>
                  <td className="py-1 px-1.5 text-center">
                    <button type="button" onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))} className="win-btn p-1 rounded-xs text-red-700">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Bottom Peach Bar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start pt-1">
        <div className="lg:col-span-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block font-bold mb-0.5">خصم الفاتورة</label>
              <input type="number" min="0" value={invoiceDiscount} onChange={(e) => setInvoiceDiscount(Number(e.target.value))} className="w-full px-2 py-1 bg-white border border-slate-600 font-mono-num font-bold text-red-700 text-center" />
            </div>
            <div>
              <label className="block font-bold mb-0.5">مصاريف نقل وشحن</label>
              <input type="number" min="0" value={extraExpenses} onChange={(e) => setExtraExpenses(Number(e.target.value))} className="w-full px-2 py-1 bg-white border border-slate-600 font-mono-num font-bold text-center" />
            </div>
          </div>
          <label className="flex items-center gap-1.5 text-[11px] font-bold">
            <input type="checkbox" checked={allocateExpenses} onChange={(e) => setAllocateExpenses(e.target.checked)} />
            توزيع المصاريف نسبيًا على تكلفة الأصناف
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="flex gap-1">
              {(['CASH', 'CREDIT'] as const).map((pt) => (
                <button key={pt} type="button" onClick={() => setPaymentType(pt)} className={`flex-1 py-1.5 font-bold rounded-md border transition-colors ${paymentType === pt ? 'bg-amber-700 text-white border-amber-700 shadow-xs' : 'win-btn'}`}>
                  {pt === 'CASH' ? 'نقدي' : 'آجل'}
                </button>
              ))}
            </div>
            <select value={cashboxId} onChange={(e) => setCashboxId(Number(e.target.value))} className="px-2 py-1 border border-slate-300 rounded-md bg-white font-semibold">
              {defs?.cashboxes.map((cb) => <option key={cb.id} value={cb.id}>{cb.name}</option>)}
            </select>
          </div>
        </div>

        <div className="lg:col-span-5 space-y-2.5">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-sm text-slate-800 whitespace-nowrap">الإجمالي</span>
            <div className="w-16 bg-white border border-slate-300 rounded-md py-1.5 text-center font-mono-num font-extrabold text-base">
              {lines.reduce((s, l) => s + l.quantity, 0)}
            </div>
            <div className="flex-1 bg-white border border-slate-300 rounded-md py-1.5 px-3 text-center font-mono-num font-extrabold text-lg text-amber-800">
              {formatMoney(netTotal, currency)}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-bold whitespace-nowrap">المدفوع:</span>
            <input type="number" min="0" value={paidAmount} placeholder={paymentType === 'CREDIT' ? '0.00' : netTotal.toFixed(2)} onChange={(e) => setPaidAmount(e.target.value)} className="flex-1 px-2 py-1 bg-white border border-slate-300 rounded-md font-mono-num text-center" />
            <span className="font-mono-num font-bold text-red-800 whitespace-nowrap">المتبقي: {remaining.toFixed(2)}</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5 bg-white/90 border border-amber-200 rounded-lg p-2">
            <button type="button" onClick={resetForm} className="win-btn px-3 py-1.5 font-bold rounded-xs flex items-center gap-1">
              <RotateCcw className="w-3.5 h-3.5" /> جديد
            </button>
            <button type="button" onClick={loadHistory} className="win-btn px-3 py-1.5 font-bold rounded-xs flex items-center gap-1">
              <History className="w-3.5 h-3.5" /> بحث
            </button>
            <button type="button" disabled={saving || !!lastSavedInvoice} onClick={handleSave} className="win-btn flex-1 px-3 py-1.5 font-extrabold rounded-xs flex items-center justify-center gap-1 text-emerald-900">
              <Save className="w-3.5 h-3.5 text-emerald-700" /> {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
            <button type="button" disabled={lines.length === 0} onClick={() => setPrintOpen(true)} className="win-btn px-3 py-1.5 font-bold rounded-xs flex items-center gap-1">
              <Printer className="w-3.5 h-3.5" /> طباعة
            </button>
          </div>
        </div>

        <div className="lg:col-span-3">
          <label className="block font-bold mb-0.5">ملاحظات:</label>
          <textarea rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full p-2 bg-white border border-slate-600" />
        </div>
      </div>

      {/* Quick Add Product Modal */}
      {quickAddOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <form onSubmit={saveQuickProduct} className="win-window w-full max-w-md rounded-xs overflow-hidden">
            <div className="h-8 bg-white border-b border-slate-300 px-3 flex items-center justify-between font-bold">
              <span>إضافة صنف سريع</span>
              <button type="button" onClick={() => setQuickAddOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 space-y-2.5">
              <input required placeholder="اسم الصنف *" value={quickProd.name} onChange={(e) => setQuickProd({ ...quickProd, name: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
              <div className="grid grid-cols-2 gap-2">
                <input placeholder="الكود" value={quickProd.code} onChange={(e) => setQuickProd({ ...quickProd, code: e.target.value })} className="px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
                <input placeholder="الباركود" value={quickProd.barcode} onChange={(e) => setQuickProd({ ...quickProd, barcode: e.target.value })} className="px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input type="number" step="0.01" placeholder="سعر الشراء" value={quickProd.purchase_price} onChange={(e) => setQuickProd({ ...quickProd, purchase_price: e.target.value })} className="px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
                <input type="number" step="0.01" placeholder="سعر البيع" value={quickProd.sale_price} onChange={(e) => setQuickProd({ ...quickProd, sale_price: e.target.value })} className="px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
              </div>
              <button type="submit" className="win-btn w-full py-2 font-bold rounded-xs">حفظ وإغلاق</button>
            </div>
          </form>
        </div>
      )}

      {/* History Modal */}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
          <div className="win-window w-full max-w-4xl rounded-xs overflow-hidden max-h-[85vh] flex flex-col">
            <div className="h-8 bg-white border-b border-slate-300 px-3 flex items-center justify-between font-bold">
              <span>سجل فواتير المشتريات</span>
              <button type="button" onClick={() => setHistoryOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 overflow-y-auto flex-1 bg-white">
              <table className="w-full text-xs border-collapse border border-slate-400">
                <thead>
                  <tr className="bg-[#214283] text-white">
                    <th className="py-2 px-3 border border-slate-500 text-right">رقم الفاتورة</th>
                    <th className="py-2 px-3 border border-slate-500 text-right">التاريخ</th>
                    <th className="py-2 px-3 border border-slate-500 text-right">المورد</th>
                    <th className="py-2 px-3 border border-slate-500 text-left">الصافي</th>
                    <th className="py-2 px-3 border border-slate-500 text-center">الحالة</th>
                    <th className="py-2 px-3 border border-slate-500 text-center">إلغاء</th>
                  </tr>
                </thead>
                <tbody>
                  {historyList.map((inv) => (
                    <tr key={String(inv.id)} className="border-b border-slate-300 hover:bg-slate-50">
                      <td className="py-1.5 px-3 font-mono-num font-bold">{String(inv.invoice_number)}</td>
                      <td className="py-1.5 px-3 font-mono-num">{String(inv.invoice_date)}</td>
                      <td className="py-1.5 px-3">{String(inv.supplier_name)}</td>
                      <td className="py-1.5 px-3 text-left font-mono-num font-bold">{formatMoney(Number(inv.net_total), currency)}</td>
                      <td className="py-1.5 px-3 text-center">{inv.status === 'APPROVED' ? 'معتمدة' : 'ملغاة'}</td>
                      <td className="py-1.5 px-3 text-center">
                        {inv.status === 'APPROVED' && (
                          <button type="button" onClick={() => cancelInvoice(Number(inv.id))} className="text-red-700 font-bold hover:underline">
                            إلغاء وعكس
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
      )}

      <PrintInvoiceModal
        open={printOpen}
        onClose={() => setPrintOpen(false)}
        title="فاتورة مشتريات"
        invoiceNumber={lastSavedInvoice?.invoice_number || 'مسودة'}
        invoiceDate={invoiceDate}
        partyLabel="المورد"
        partyName={selectedSupplier?.name || ''}
        partyPhone={selectedSupplier?.phone}
        warehouseName={selectedWarehouse?.name || ''}
        paymentType={paymentType}
        cashierName={currentUser.username}
        subtotal={subtotal}
        discount={itemsDiscount + invoiceDiscount}
        additions={extraExpenses}
        tax={taxAmount}
        netTotal={netTotal}
        paidAmount={effectivePaid}
        remainingAmount={remaining}
        notes={notes}
        items={lines}
        settings={settings}
      />
    </div>
  );
};
