import React, { useEffect, useState } from 'react';
import { Search, ArrowLeftRight, ClipboardCheck, FileText, Plus, Trash2 } from 'lucide-react';
import { apiFetch, formatMoney, formatNum, todayDateStr } from '../api.ts';
import type { DefinitionsBundle, Product } from '../types.ts';

interface InventoryViewProps {
  settings: Record<string, string>;
  canViewCost: boolean;
  initialTab?: 'balances' | 'card' | 'transfer' | 'stocktake';
}

export const InventoryView: React.FC<InventoryViewProps> = ({ settings, canViewCost, initialTab = 'balances' }) => {
  const [tab, setTab] = useState<'balances' | 'card' | 'transfer' | 'stocktake'>(initialTab);
  const [defs, setDefs] = useState<DefinitionsBundle | null>(null);
  const [warehouseId, setWarehouseId] = useState<string>('');
  const [search, setSearch] = useState('');
  const [filterMode, setFilterMode] = useState<'ALL' | 'LOW' | 'ZERO' | 'STAGNANT'>('ALL');
  const [balances, setBalances] = useState<Array<Record<string, unknown>>>([]);
  const [products, setProducts] = useState<Product[]>([]);

  // Stock Card
  const [cardProductId, setCardProductId] = useState<string>('');
  const [cardData, setCardData] = useState<{ product: Product; movements: Array<Record<string, unknown>> } | null>(null);

  // Transfer Form
  const [fromWh, setFromWh] = useState<number>(1);
  const [toWh, setToWh] = useState<number>(2);
  const [trDate, setTrDate] = useState(todayDateStr());
  const [trNotes, setTrNotes] = useState('');
  const [trItems, setTrItems] = useState<Array<{ product_id: number; name: string; quantity: number }>>([]);
  const [trProdId, setTrProdId] = useState<number>(0);
  const [trQty, setTrQty] = useState<number>(1);
  const [transfersList, setTransfersList] = useState<Array<Record<string, unknown>>>([]);

  // Stocktake / Adjustment Form
  const [adjType, setAdjType] = useState<'STOCKTAKE' | 'ADJUSTMENT' | 'OPENING'>('STOCKTAKE');
  const [adjWhId, setAdjWhId] = useState<number>(1);
  const [adjReason, setAdjReason] = useState('');
  const [adjCounts, setAdjCounts] = useState<Record<number, string>>({});
  const [adjHistory, setAdjHistory] = useState<Array<Record<string, unknown>>>([]);

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const currency = settings.currency || 'ج.م.';

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadBalances = async () => {
    try {
      const url = `/api/inventory/balances?warehouse_id=${warehouseId}&q=${encodeURIComponent(search)}&filter=${filterMode === 'ALL' ? '' : filterMode}`;
      const rows = await apiFetch<Array<Record<string, unknown>>>(url);
      setBalances(rows);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    Promise.all([
      apiFetch<DefinitionsBundle>('/api/definitions/all'),
      apiFetch<Product[]>('/api/products'),
    ])
      .then(([d, p]) => {
        setDefs(d);
        setProducts(p);
        if (d.warehouses[0]) {
          setFromWh(d.warehouses[0].id);
          setAdjWhId(d.warehouses[0].id);
        }
        if (d.warehouses[1]) setToWh(d.warehouses[1].id);
        if (p[0]) {
          setTrProdId(p[0].id);
          setCardProductId(String(p[0].id));
        }
      })
      .catch((err: unknown) => setError((err as Error).message));
  }, []);

  useEffect(() => {
    void loadBalances();
  }, [warehouseId, search, filterMode]);

  useEffect(() => {
    if (tab === 'balances') {
      void loadBalances();
    } else if (tab === 'card' && cardProductId) {
      apiFetch<{ product: Product; movements: Array<Record<string, unknown>> }>(
        `/api/inventory/card/${cardProductId}?warehouse_id=${warehouseId}`
      )
        .then(setCardData)
        .catch((err: unknown) => setError((err as Error).message));
    } else if (tab === 'transfer') {
      apiFetch<Array<Record<string, unknown>>>('/api/inventory/transfers')
        .then(setTransfersList)
        .catch((err: unknown) => setError((err as Error).message));
    } else if (tab === 'stocktake') {
      apiFetch<Array<Record<string, unknown>>>('/api/inventory/adjustments')
        .then(setAdjHistory)
        .catch((err: unknown) => setError((err as Error).message));
      apiFetch<Array<Record<string, unknown>>>(`/api/inventory/balances?warehouse_id=${adjWhId}`)
        .then((rows) => {
          setBalances(rows);
          const init: Record<number, string> = {};
          for (const r of rows) init[Number(r.id)] = String(r.total_qty);
          setAdjCounts(init);
        })
        .catch((err: unknown) => setError((err as Error).message));
    }
  }, [tab, cardProductId, warehouseId, adjWhId]);

  const submitTransfer = async () => {
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch<{ transfer_number: string }>('/api/inventory/transfers', {
        method: 'POST',
        body: JSON.stringify({
          from_warehouse_id: fromWh,
          to_warehouse_id: toWh,
          transfer_date: trDate,
          notes: trNotes,
          items: trItems,
        }),
      });
      setSuccess(`تم اعتماد التحويل المخزني رقم ${res.transfer_number}`);
      setTrItems([]);
      setTrNotes('');
      apiFetch<Array<Record<string, unknown>>>('/api/inventory/transfers').then(setTransfersList);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const submitAdjustment = async () => {
    setError('');
    setSuccess('');
    try {
      const items = balances
        .filter((b) => adjCounts[Number(b.id)] !== undefined && adjCounts[Number(b.id)] !== '')
        .map((b) => ({
          product_id: Number(b.id),
          actual_qty: Number(adjCounts[Number(b.id)]),
        }));
      const res = await apiFetch<{ doc_number: string }>('/api/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify({
          warehouse_id: adjWhId,
          doc_type: adjType,
          doc_date: todayDateStr(),
          reason: adjReason || (adjType === 'STOCKTAKE' ? 'جرد فعلي للمخزن' : 'تسوية مخزنية'),
          items,
        }),
      });
      setSuccess(`تم اعتماد مستند ${res.doc_number} وتسوية الفروق بنجاح`);
      apiFetch<Array<Record<string, unknown>>>('/api/inventory/adjustments').then(setAdjHistory);
      loadBalances();
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
          onClick={() => setTab('balances')}
          className={`px-3 py-1.5 font-bold border ${tab === 'balances' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          أرصدة المخازن والناقص والراكد
        </button>
        <button
          type="button"
          onClick={() => setTab('card')}
          className={`px-3 py-1.5 font-bold border flex items-center gap-1.5 ${tab === 'card' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <FileText className="w-3.5 h-3.5" /> كارت الصنف
        </button>
        <button
          type="button"
          onClick={() => setTab('transfer')}
          className={`px-3 py-1.5 font-bold border flex items-center gap-1.5 ${tab === 'transfer' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <ArrowLeftRight className="w-3.5 h-3.5" /> تحويل بين المخازن
        </button>
        <button
          type="button"
          onClick={() => setTab('stocktake')}
          className={`px-3 py-1.5 font-bold border flex items-center gap-1.5 ${tab === 'stocktake' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <ClipboardCheck className="w-3.5 h-3.5" /> الجرد الفعلي والتسويات
        </button>
      </div>

      {error && <div className="m-3 p-2 text-xs bg-red-100 text-red-800 border border-red-400 font-semibold">{error}</div>}
      {success && <div className="m-3 p-2 text-xs bg-emerald-100 text-emerald-900 border border-emerald-500 font-semibold">{success}</div>}

      <div className="p-3 space-y-3">
        {/* BALANCES TAB */}
        {tab === 'balances' && (
          <div className="space-y-3">
            <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-xs">
              <div className="md:col-span-2 relative">
                <Search className="w-4 h-4 text-slate-500 absolute right-2.5 top-2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث بالكود أو الاسم أو الباركود..."
                  className="w-full pr-8 pl-2.5 py-1.5 border border-[#7f9db9] bg-white"
                />
              </div>
              <select
                value={warehouseId}
                onChange={(e) => setWarehouseId(e.target.value)}
                className="px-2.5 py-1.5 border border-[#7f9db9] bg-white"
              >
                <option value="">إجمالي كل المخازن</option>
                {defs?.warehouses.map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as typeof filterMode)}
                className="px-2.5 py-1.5 border border-[#7f9db9] bg-white"
              >
                <option value="ALL">كل الأصناف</option>
                <option value="LOW">تحت حد إعادة الطلب (النواقص)</option>
                <option value="ZERO">أرصدة صفرية</option>
                <option value="STAGNANT">الأصناف الراكدة (لم تُبع منذ 30 يومًا)</option>
              </select>
            </div>

            <div className="bg-white border border-[#8c8c8c] overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#214283] text-white">
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">الكود</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">الصنف</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">الفئة</th>
                    <th className="py-2 px-3 text-center border-l border-[#375da3]">الرصيد المتاح</th>
                    <th className="py-2 px-3 text-center border-l border-[#375da3]">حد الطلب</th>
                    {canViewCost && <th className="py-2 px-3 text-left border-l border-[#375da3]">متوسط التكلفة</th>}
                    {canViewCost && <th className="py-2 px-3 text-left border-l border-[#375da3]">إجمالي القيمة</th>}
                    <th className="py-2 px-3 text-center">كارت الصنف</th>
                  </tr>
                </thead>
                <tbody>
                  {balances.map((b, idx) => {
                    const qty = Number(b.total_qty);
                    const val = qty * Number(b.avg_cost);
                    return (
                      <tr key={String(b.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                        <td className="py-1.5 px-3 font-mono-num">{String(b.code)}</td>
                        <td className="py-1.5 px-3 font-bold">{String(b.name)}</td>
                        <td className="py-1.5 px-3 text-slate-600">{String(b.category_name || 'عام')}</td>
                        <td className={`py-1.5 px-3 text-center font-mono-num font-bold ${qty <= Number(b.reorder_level) ? 'text-red-700 bg-red-50' : ''}`}>
                          {formatNum(qty)} {String(b.unit_name || '')}
                        </td>
                        <td className="py-1.5 px-3 text-center font-mono-num text-slate-600">{formatNum(Number(b.reorder_level))}</td>
                        {canViewCost && <td className="py-1.5 px-3 text-left font-mono-num">{formatMoney(Number(b.avg_cost), currency)}</td>}
                        {canViewCost && <td className="py-1.5 px-3 text-left font-mono-num font-bold">{formatMoney(val, currency)}</td>}
                        <td className="py-1.5 px-3 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              setCardProductId(String(b.id));
                              setTab('card');
                            }}
                            className="win-btn px-2.5 py-0.5 text-[11px] font-bold"
                          >
                            عرض الحركة
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STOCK CARD TAB */}
        {tab === 'card' && (
          <div className="space-y-3">
            <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-3 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div className="md:col-span-2">
                <label className="block font-bold mb-1">اختر الصنف</label>
                <select
                  value={cardProductId}
                  onChange={(e) => setCardProductId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>{p.code} · {p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">تصفية بالمخزن</label>
                <select
                  value={warehouseId}
                  onChange={(e) => setWarehouseId(e.target.value)}
                  className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
                >
                  <option value="">كل المخازن</option>
                  {defs?.warehouses.map((w) => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {cardData && (
              <div className="bg-white border border-[#8c8c8c] overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#214283] text-white">
                      <th className="py-2 px-3 text-right border-l border-[#375da3]">التاريخ</th>
                      <th className="py-2 px-3 text-right border-l border-[#375da3]">المخزن</th>
                      <th className="py-2 px-3 text-right border-l border-[#375da3]">نوع الحركة</th>
                      <th className="py-2 px-3 text-right border-l border-[#375da3]">المرجع</th>
                      <th className="py-2 px-3 text-center border-l border-[#375da3]">وارد</th>
                      <th className="py-2 px-3 text-center border-l border-[#375da3]">منصرف</th>
                      <th className="py-2 px-3 text-center border-l border-[#375da3]">الرصيد بعد</th>
                      <th className="py-2 px-3 text-right">البيان</th>
                    </tr>
                  </thead>
                  <tbody>
                    {cardData.movements.map((m, idx) => (
                      <tr key={String(m.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                        <td className="py-1.5 px-3 font-mono-num">{String(m.movement_date)}</td>
                        <td className="py-1.5 px-3">{String(m.warehouse_name)}</td>
                        <td className="py-1.5 px-3 font-bold">{String(m.movement_type)}</td>
                        <td className="py-1.5 px-3 font-mono-num">{String(m.reference_number)}</td>
                        <td className="py-1.5 px-3 text-center font-mono-num text-emerald-700 font-bold">{Number(m.qty_in) > 0 ? formatNum(Number(m.qty_in)) : '-'}</td>
                        <td className="py-1.5 px-3 text-center font-mono-num text-red-700 font-bold">{Number(m.qty_out) > 0 ? formatNum(Number(m.qty_out)) : '-'}</td>
                        <td className="py-1.5 px-3 text-center font-mono-num font-bold">{formatNum(Number(m.balance_after))}</td>
                        <td className="py-1.5 px-3 text-slate-600">{String(m.notes || '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TRANSFER TAB */}
        {tab === 'transfer' && defs && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-3 text-xs">
              <h3 className="font-bold text-sm border-b border-[#aca899] pb-1.5">مستند تحويل بضاعة بين المخازن</h3>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block mb-1 font-bold">من مخزن</label>
                  <select value={fromWh} onChange={(e) => setFromWh(Number(e.target.value))} className="w-full px-2 py-1.5 border border-[#7f9db9] bg-white">
                    {defs.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-bold">إلى مخزن</label>
                  <select value={toWh} onChange={(e) => setToWh(Number(e.target.value))} className="w-full px-2 py-1.5 border border-[#7f9db9] bg-white">
                    {defs.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block mb-1 font-bold">التاريخ</label>
                  <input type="date" value={trDate} onChange={(e) => setTrDate(e.target.value)} className="w-full px-2 py-1.5 border border-[#7f9db9] font-mono-num bg-white" />
                </div>
              </div>

              <div className="flex gap-2 items-end">
                <div className="flex-1">
                  <label className="block mb-1 font-bold">الصنف</label>
                  <select value={trProdId} onChange={(e) => setTrProdId(Number(e.target.value))} className="w-full px-2 py-1.5 border border-[#7f9db9] bg-white">
                    {products.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                  </select>
                </div>
                <div className="w-24">
                  <label className="block mb-1 font-bold">الكمية</label>
                  <input type="number" min="0.01" step="any" value={trQty} onChange={(e) => setTrQty(Number(e.target.value))} className="w-full px-2 py-1.5 border border-[#7f9db9] bg-white font-mono-num text-center" />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const p = products.find((x) => x.id === trProdId);
                    if (!p || trQty <= 0) return;
                    setTrItems((prev) => [...prev, { product_id: p.id, name: p.name, quantity: trQty }]);
                  }}
                  className="win-btn px-3 py-1.5 font-bold"
                >
                  <Plus className="w-4 h-4 text-blue-900" />
                </button>
              </div>

              <div className="border border-[#8c8c8c] bg-white divide-y divide-slate-200">
                {trItems.map((it, idx) => (
                  <div key={idx} className="px-3 py-1.5 flex justify-between items-center">
                    <span className="font-semibold">{it.name}</span>
                    <div className="flex items-center gap-3">
                      <span className="font-mono-num font-bold">{it.quantity}</span>
                      <button type="button" onClick={() => setTrItems((prev) => prev.filter((_, i) => i !== idx))} className="text-red-700"><Trash2 className="w-3.5 h-3.5" /></button>
                    </div>
                  </div>
                ))}
              </div>

              <input placeholder="ملاحظات التحويل..." value={trNotes} onChange={(e) => setTrNotes(e.target.value)} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white" />
              <button type="button" onClick={submitTransfer} className="win-btn w-full py-2 font-bold text-blue-950">اعتماد التحويل المخزني</button>
            </div>

            <div className="bg-white border border-[#8c8c8c] overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#214283] text-white">
                    <th className="py-2 px-2 text-right border-l border-[#375da3]">المستند</th>
                    <th className="py-2 px-2 text-right border-l border-[#375da3]">التاريخ</th>
                    <th className="py-2 px-2 text-right border-l border-[#375da3]">من</th>
                    <th className="py-2 px-2 text-right border-l border-[#375da3]">إلى</th>
                    <th className="py-2 px-2 text-center">الأصناف</th>
                  </tr>
                </thead>
                <tbody>
                  {transfersList.map((t, idx) => (
                    <tr key={String(t.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                      <td className="py-1.5 px-2 font-mono-num font-bold">{String(t.transfer_number)}</td>
                      <td className="py-1.5 px-2 font-mono-num">{String(t.transfer_date)}</td>
                      <td className="py-1.5 px-2">{String(t.from_warehouse_name)}</td>
                      <td className="py-1.5 px-2">{String(t.to_warehouse_name)}</td>
                      <td className="py-1.5 px-2 text-center font-mono-num">{String(t.items_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* STOCKTAKE & ADJUSTMENTS TAB */}
        {tab === 'stocktake' && defs && (
          <div className="space-y-4">
            <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-3 space-y-3 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div>
                  <label className="block font-bold mb-1">نوع المستند</label>
                  <select value={adjType} onChange={(e) => setAdjType(e.target.value as typeof adjType)} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                    <option value="STOCKTAKE">جرد فعلي (مقارنة بالرصيد الدفتري)</option>
                    <option value="ADJUSTMENT">تسوية مخزنية (عجز / زيادة)</option>
                    <option value="OPENING">إضافة أرصدة أول المدة</option>
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">المخزن</label>
                  <select value={adjWhId} onChange={(e) => setAdjWhId(Number(e.target.value))} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                    {defs.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block font-bold mb-1">السبب / البيان</label>
                  <input type="text" value={adjReason} onChange={(e) => setAdjReason(e.target.value)} placeholder="سبب التسوية أو رقم محضر الجرد..." className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white" />
                </div>
                <button type="button" onClick={submitAdjustment} className="win-btn py-2 px-4 font-bold text-blue-950">
                  اعتماد التسوية / الجرد
                </button>
              </div>

              <div className="bg-white border border-[#8c8c8c] overflow-x-auto max-h-72">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#214283] text-white sticky top-0">
                      <th className="py-2 px-3 text-right border-l border-[#375da3]">الكود</th>
                      <th className="py-2 px-3 text-right border-l border-[#375da3]">الصنف</th>
                      <th className="py-2 px-3 text-center border-l border-[#375da3]">الرصيد الدفتري</th>
                      <th className="py-2 px-3 text-center border-l border-[#375da3] w-32">{adjType === 'OPENING' ? 'رصيد البداية المضاف' : 'الرصيد الفعلي'}</th>
                      <th className="py-2 px-3 text-center">العجز / الزيادة</th>
                    </tr>
                  </thead>
                  <tbody>
                    {balances.map((b, idx) => {
                      const book = Number(b.total_qty);
                      const actual = Number(adjCounts[Number(b.id)] ?? book);
                      const diff = adjType === 'OPENING' ? actual : actual - book;
                      return (
                        <tr key={String(b.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                          <td className="py-1.5 px-3 font-mono-num">{String(b.code)}</td>
                          <td className="py-1.5 px-3 font-bold">{String(b.name)}</td>
                          <td className="py-1.5 px-3 text-center font-mono-num">{formatNum(book)}</td>
                          <td className="py-1 px-3">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={adjCounts[Number(b.id)] ?? ''}
                              onChange={(e) => setAdjCounts({ ...adjCounts, [Number(b.id)]: e.target.value })}
                              className="w-full px-2 py-0.5 border border-[#7f9db9] text-center font-mono-num bg-white"
                            />
                          </td>
                          <td className={`py-1.5 px-3 text-center font-mono-num font-bold ${diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-red-700' : 'text-slate-500'}`}>
                            {diff > 0 ? `+${formatNum(diff)} (زيادة)` : diff < 0 ? `${formatNum(diff)} (عجز)` : 'مطابق'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border border-[#8c8c8c] overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#214283] text-white">
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">المستند</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">النوع</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">التاريخ</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">المخزن</th>
                    <th className="py-2 px-3 text-right">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {adjHistory.map((h, idx) => (
                    <tr key={String(h.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                      <td className="py-1.5 px-3 font-mono-num font-bold">{String(h.doc_number)}</td>
                      <td className="py-1.5 px-3">{String(h.doc_type)}</td>
                      <td className="py-1.5 px-3 font-mono-num">{String(h.doc_date)}</td>
                      <td className="py-1.5 px-3">{String(h.warehouse_name)}</td>
                      <td className="py-1.5 px-3 text-slate-600">{String(h.reason)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
