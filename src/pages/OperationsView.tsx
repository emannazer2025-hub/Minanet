import React, { useEffect, useState } from 'react';
import { Tag, Barcode, Landmark, Printer, Sparkles } from 'lucide-react';
import { apiFetch, formatMoney, todayDateStr } from '../api.ts';
import type { DefinitionsBundle, Product } from '../types.ts';
import { generateBarcodeDataUrl, generateRandomEan13 } from '../utils/posHardware.ts';

interface OperationsViewProps {
  settings: Record<string, string>;
  initialTab?: 'prices' | 'barcode' | 'checks';
}

export const OperationsView: React.FC<OperationsViewProps> = ({ settings, initialTab = 'prices' }) => {
  const [tab, setTab] = useState<'prices' | 'barcode' | 'checks'>(initialTab);
  const [defs, setDefs] = useState<DefinitionsBundle | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Bulk Price Update
  const [priceForm, setPriceForm] = useState({
    category_id: '',
    target_field: 'sale_price',
    mode: 'PERCENT',
    value: '0',
  });

  // Barcode Printer
  const [barProductId, setBarProductId] = useState('');
  const [barCount, setBarCount] = useState(12);
  const [barLabelSize, setBarLabelSize] = useState<'38x25' | '50x30' | '40x20' | 'A4'>('38x25');
  const [barShowPrice, setBarShowPrice] = useState(true);
  const [barShowCompany, setBarShowCompany] = useState(true);
  const [barCustomCode, setBarCustomCode] = useState('');

  // Checks & Installments
  const [checks, setChecks] = useState<Array<Record<string, unknown>>>([]);
  const [chkForm, setChkForm] = useState({
    record_type: 'CHECK',
    party_type: 'CUSTOMER',
    party_id: '',
    doc_number: '',
    bank_name: '',
    due_date: todayDateStr(),
    amount: '',
    notes: '',
  });

  const currency = settings.currency || 'ج.م.';

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadAll = async () => {
    try {
      const [d, p, c] = await Promise.all([
        apiFetch<DefinitionsBundle>('/api/definitions/all'),
        apiFetch<Product[]>('/api/products'),
        apiFetch<Array<Record<string, unknown>>>('/api/operations/checks'),
      ]);
      setDefs(d);
      setProducts(p);
      setChecks(c);
      if (p[0] && !barProductId) setBarProductId(String(p[0].id));
      const firstCust = d.customers.find((x) => !x.is_walkin) || d.customers[0];
      if (firstCust && !chkForm.party_id) setChkForm((f) => ({ ...f, party_id: String(firstCust.id) }));
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  const applyBulkPrice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch<{ updated: number }>('/api/operations/bulk-price-update', {
        method: 'POST',
        body: JSON.stringify({
          ...priceForm,
          category_id: priceForm.category_id ? Number(priceForm.category_id) : null,
          value: Number(priceForm.value),
        }),
      });
      setSuccess(`تم تحديث أسعار ${res.updated} صنفًا بنجاح مع تسجيل العملية في سجل التدقيق`);
      loadAll();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const addCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      await apiFetch('/api/operations/checks', {
        method: 'POST',
        body: JSON.stringify({ ...chkForm, party_id: Number(chkForm.party_id), amount: Number(chkForm.amount) }),
      });
      setChkForm((f) => ({ ...f, doc_number: '', bank_name: '', amount: '', notes: '' }));
      setSuccess('تم تسجيل الشيك / القسط بنجاح');
      loadAll();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const selectedBarProd = products.find((p) => String(p.id) === barProductId);

  return (
    <div className="bg-[#ece9d8] text-slate-900">
      {/* Classic Sub-Tabs Strip */}
      <div className="no-print bg-[#d6d2c2] border-b border-[#aca899] px-3 py-2 flex flex-wrap gap-2 text-xs">
        <button
          type="button"
          onClick={() => setTab('prices')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'prices' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <Tag className="w-3.5 h-3.5" /> تحديث الأسعار الجماعي
        </button>
        <button
          type="button"
          onClick={() => setTab('barcode')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'barcode' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <Barcode className="w-3.5 h-3.5" /> طباعة ملصقات الباركود
        </button>
        <button
          type="button"
          onClick={() => setTab('checks')}
          className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'checks' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
        >
          <Landmark className="w-3.5 h-3.5" /> الشيكات وأنظمة التقسيط
        </button>
      </div>

      {error && <div className="m-3 p-2 text-xs bg-red-100 text-red-800 border border-red-400 font-semibold">{error}</div>}
      {success && <div className="m-3 p-2 text-xs bg-emerald-100 text-emerald-900 border border-emerald-500 font-semibold">{success}</div>}

      <div className="p-3">
        {/* BULK PRICE UPDATE */}
        {tab === 'prices' && defs && (
          <form onSubmit={applyBulkPrice} className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 max-w-2xl space-y-3 text-xs">
            <h3 className="font-bold text-sm border-b border-[#aca899] pb-1.5">تحديث أسعار البيع الجماعي للأصناف</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold mb-1">نطاق الأصناف (الفئة)</label>
                <select value={priceForm.category_id} onChange={(e) => setPriceForm({ ...priceForm, category_id: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                  <option value="">جميع الأصناف النشطة</option>
                  {defs.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">السعر المستهدف</label>
                <select value={priceForm.target_field} onChange={(e) => setPriceForm({ ...priceForm, target_field: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                  <option value="sale_price">سعر البيع (المستهلك)</option>
                  <option value="wholesale_price">سعر الجملة</option>
                  <option value="special_price">سعر خاص</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">طريقة التعديل</label>
                <select value={priceForm.mode} onChange={(e) => setPriceForm({ ...priceForm, mode: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                  <option value="PERCENT">نسبة مئوية % (موجب للزيادة أو سالب للتخفيض)</option>
                  <option value="FIXED">مبلغ ثابت (موجب للزيادة أو سالب للتخفيض)</option>
                </select>
              </div>
              <div>
                <label className="block font-bold mb-1">القيمة (مثال: 10 أو -5)</label>
                <input type="number" step="0.01" required value={priceForm.value} onChange={(e) => setPriceForm({ ...priceForm, value: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num" />
              </div>
            </div>
            <button type="submit" className="win-btn px-5 py-2 font-bold text-blue-950">تنفيذ تحديث الأسعار</button>
          </form>
        )}

        {/* BARCODE LABELS (Real Scannable JsBarcode) */}
        {tab === 'barcode' && (
          <div className="space-y-3">
            <div className="no-print bg-[#f4f3ee] border border-[#8c8c8c] p-3 grid grid-cols-1 md:grid-cols-12 gap-3 items-end text-xs">
              <div className="md:col-span-4">
                <label className="block font-bold mb-1">الصنف</label>
                <select
                  value={barProductId}
                  onChange={(e) => {
                    setBarProductId(e.target.value);
                    setBarCustomCode('');
                  }}
                  className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} · {p.name} ({p.barcode || p.code})
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-3">
                <label className="block font-bold mb-1">مقاس الملصق / الطابعة</label>
                <select
                  value={barLabelSize}
                  onChange={(e) => setBarLabelSize(e.target.value as typeof barLabelSize)}
                  className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white"
                >
                  <option value="38x25">ملصق حراري 38×25 مم (رول باركود)</option>
                  <option value="50x30">ملصق حراري 50×30 مم</option>
                  <option value="40x20">ملصق حراري 40×20 مم</option>
                  <option value="A4">ورقة ملصقات A4 قياسية</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block font-bold mb-1">عدد الملصقات</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={barCount}
                  onChange={(e) => setBarCount(Math.max(1, Number(e.target.value) || 1))}
                  className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num"
                />
              </div>
              <div className="md:col-span-3 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setBarCustomCode(generateRandomEan13())}
                  className="win-btn flex items-center justify-center gap-1 py-2 px-3 font-bold text-teal-900"
                  title="توليد باركود EAN-13 جديد لصنف بدون باركود"
                >
                  <Sparkles className="w-3.5 h-3.5" /> توليد باركود
                </button>
                <button
                  type="button"
                  onClick={() => window.print()}
                  className="win-btn flex-1 flex items-center justify-center gap-1.5 py-2 px-3 font-bold text-blue-950"
                >
                  <Printer className="w-4 h-4" /> طباعة
                </button>
              </div>
              <div className="md:col-span-12 flex flex-wrap items-center gap-4 pt-1 border-t border-slate-300">
                <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
                  <input type="checkbox" checked={barShowCompany} onChange={(e) => setBarShowCompany(e.target.checked)} />
                  إظهار اسم المحل
                </label>
                <label className="flex items-center gap-1.5 font-semibold cursor-pointer">
                  <input type="checkbox" checked={barShowPrice} onChange={(e) => setBarShowPrice(e.target.checked)} />
                  إظهار السعر
                </label>
                {barCustomCode && (
                  <span className="text-emerald-800 font-bold font-mono-num">
                    تم توليد باركود مؤقت للطباعة: {barCustomCode}
                  </span>
                )}
              </div>
            </div>

            {selectedBarProd && (() => {
              const codeToPrint = (barCustomCode || selectedBarProd.barcode || selectedBarProd.code || String(selectedBarProd.id)).trim();
              const barcodeImg = generateBarcodeDataUrl(codeToPrint, {
                height: barLabelSize === '40x20' ? 28 : barLabelSize === '38x25' ? 36 : 44,
                width: barLabelSize === 'A4' ? 1.7 : 1.5,
              });
              const isThermalLabel = barLabelSize !== 'A4';
              const boxDims =
                barLabelSize === '38x25'
                  ? 'w-[144px] min-h-[95px] p-1.5'
                  : barLabelSize === '50x30'
                  ? 'w-[190px] min-h-[114px] p-2'
                  : barLabelSize === '40x20'
                  ? 'w-[152px] min-h-[76px] p-1'
                  : 'w-full p-2.5';

              return (
                <div
                  className={`bg-white text-slate-900 border border-[#8c8c8c] p-4 ${
                    isThermalLabel
                      ? 'flex flex-wrap gap-3 justify-center'
                      : 'grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3'
                  }`}
                >
                  {Array.from({ length: barCount }).map((_, idx) => (
                    <div
                      key={idx}
                      className={`border border-dashed border-slate-400 text-center flex flex-col justify-between bg-white ${boxDims}`}
                    >
                      {barShowCompany && (
                        <div className="text-[9px] font-bold truncate text-slate-700">
                          {settings.company_name || 'Mina Net'}
                        </div>
                      )}
                      <div className="text-[11px] font-bold truncate text-slate-900">{selectedBarProd.name}</div>
                      {barcodeImg && (
                        <img src={barcodeImg} alt={codeToPrint} className="mx-auto max-w-full h-9 object-contain my-0.5" />
                      )}
                      <div className="font-mono-num text-[10px] font-bold tracking-wider">{codeToPrint}</div>
                      {barShowPrice && (
                        <div className="text-xs font-extrabold font-mono-num text-[#0f3d5e]">
                          {formatMoney(selectedBarProd.sale_price, currency)}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        )}

        {/* CHECKS & INSTALLMENTS */}
        {tab === 'checks' && defs && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <form onSubmit={addCheck} className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-2.5 text-xs">
              <h3 className="font-bold text-sm border-b border-[#aca899] pb-1.5">تسجيل شيك / قسط مستحق</h3>
              <select value={chkForm.record_type} onChange={(e) => setChkForm({ ...chkForm, record_type: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                <option value="CHECK">شيك بنكي</option>
                <option value="INSTALLMENT">قسط عميل / مورد</option>
              </select>
              <select value={chkForm.party_type} onChange={(e) => setChkForm({ ...chkForm, party_type: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                <option value="CUSTOMER">عميل (أوراق قبض)</option>
                <option value="SUPPLIER">مورد (أوراق دفع)</option>
              </select>
              <select value={chkForm.party_id} onChange={(e) => setChkForm({ ...chkForm, party_id: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                {(chkForm.party_type === 'CUSTOMER' ? defs.customers.filter((c) => !c.is_walkin) : defs.suppliers).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <input required placeholder="رقم الشيك / المستند *" value={chkForm.doc_number} onChange={(e) => setChkForm({ ...chkForm, doc_number: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num" />
              <input placeholder="اسم البنك" value={chkForm.bank_name} onChange={(e) => setChkForm({ ...chkForm, bank_name: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white" />
              <div className="grid grid-cols-2 gap-2">
                <input required type="number" step="0.01" placeholder="المبلغ *" value={chkForm.amount} onChange={(e) => setChkForm({ ...chkForm, amount: e.target.value })} className="px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num" />
                <input type="date" value={chkForm.due_date} onChange={(e) => setChkForm({ ...chkForm, due_date: e.target.value })} className="px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num" />
              </div>
              <button type="submit" className="win-btn w-full py-2 font-bold text-blue-950">حفظ الشيك / القسط</button>
            </form>

            <div className="lg:col-span-2 bg-white border border-[#8c8c8c] overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#214283] text-white">
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">النوع</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">الرقم</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">الطرف</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">تاريخ الاستحقاق</th>
                    <th className="py-2 px-3 text-left border-l border-[#375da3]">المبلغ</th>
                    <th className="py-2 px-3 text-center">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {checks.map((c, idx) => (
                    <tr key={String(c.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                      <td className="py-1.5 px-3">{c.record_type === 'CHECK' ? 'شيك' : 'قسط'}</td>
                      <td className="py-1.5 px-3 font-mono-num font-bold">{String(c.doc_number)}</td>
                      <td className="py-1.5 px-3">{String(c.party_name || '-')}</td>
                      <td className="py-1.5 px-3 font-mono-num">{String(c.due_date)}</td>
                      <td className="py-1.5 px-3 text-left font-mono-num font-bold">{formatMoney(Number(c.amount), currency)}</td>
                      <td className="py-1.5 px-3 text-center">
                        <select
                          value={String(c.status)}
                          onChange={async (e) => {
                            setError('');
                            try {
                              await apiFetch(`/api/operations/checks/${c.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: e.target.value }) });
                              loadAll();
                            } catch (err: unknown) {
                              setError((err as Error).message);
                            }
                          }}
                          className="px-2 py-0.5 border border-[#7f9db9] bg-white"
                        >
                          <option value="PENDING">قيد الانتظار</option>
                          <option value="COLLECTED">تم التحصيل</option>
                          <option value="PAID">تم السداد</option>
                          <option value="BOUNCED">مرتد / مرفوض</option>
                        </select>
                      </td>
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
