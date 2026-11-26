import React, { useEffect, useState } from 'react';
import { Plus, Search, Edit2, Power, Trash2, Save, X, Sparkles, ImagePlus } from 'lucide-react';
import { apiFetch, formatMoney, formatNum } from '../api.ts';
import type { DefinitionsBundle, Product } from '../types.ts';
import { generateRandomEan13 } from '../utils/posHardware.ts';

interface DefinitionsViewProps {
  settings: Record<string, string>;
  canViewCost: boolean;
  initialTab?: 'products' | 'categories' | 'warehouses' | 'customers' | 'suppliers' | 'cashboxes';
}

export const DefinitionsView: React.FC<DefinitionsViewProps> = ({ settings, canViewCost, initialTab = 'products' }) => {
  const [tab, setTab] = useState<'products' | 'categories' | 'warehouses' | 'customers' | 'suppliers' | 'cashboxes'>(initialTab);
  const [defs, setDefs] = useState<DefinitionsBundle | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState('');
  const [catFilter, setCatFilter] = useState('');
  const [showInactive, setShowInactive] = useState(false);
  const [error, setError] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const currency = settings.currency || 'ج.م.';

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const [pForm, setPForm] = useState({
    code: '',
    name: '',
    alt_name: '',
    barcode: '',
    category_id: '',
    brand: '',
    base_unit_id: '1',
    purchase_price: '0',
    sale_price: '0',
    wholesale_price: '0',
    special_price: '0',
    min_stock: '0',
    reorder_level: '5',
    opening_qty: '0',
    opening_warehouse_id: '1',
    notes: '',
    image_url: '',
    extra_barcodes: '',
  });

  const [catName, setCatName] = useState('');
  const [unitName, setUnitName] = useState('');
  const [expName, setExpName] = useState('');
  const [expKind, setExpKind] = useState<'EXPENSE' | 'REVENUE'>('EXPENSE');
  const [whForm, setWhForm] = useState({ name: '', location: '' });
  const [custForm, setCustForm] = useState({ id: 0, name: '', phone: '', address: '', tax_number: '', opening_balance: '0', credit_limit: '0', notes: '' });
  const [supForm, setSupForm] = useState({ id: 0, name: '', phone: '', address: '', tax_number: '', opening_balance: '0', notes: '' });
  const [cbForm, setCbForm] = useState({ name: '', type: 'CASH', account_number: '', opening_balance: '0' });

  const loadAll = async () => {
    try {
      const [d, p] = await Promise.all([
        apiFetch<DefinitionsBundle>('/api/definitions/all'),
        apiFetch<Product[]>(
          `/api/products?q=${encodeURIComponent(search)}&category_id=${catFilter}&include_inactive=${showInactive ? '1' : ''}`
        ),
      ]);
      setDefs(d);
      setProducts(p);
    } catch (e: unknown) {
      setError((e as Error).message);
    }
  };

  useEffect(() => {
    loadAll();
  }, [search, catFilter, showInactive]);

  const openNewProduct = () => {
    setEditingProduct(null);
    setPForm({
      code: '',
      name: '',
      alt_name: '',
      barcode: '',
      category_id: defs?.categories[0]?.id ? String(defs.categories[0].id) : '',
      brand: '',
      base_unit_id: defs?.units[0]?.id ? String(defs.units[0].id) : '1',
      purchase_price: '0',
      sale_price: '0',
      wholesale_price: '0',
      special_price: '0',
      min_stock: '0',
      reorder_level: '5',
      opening_qty: '0',
      opening_warehouse_id: defs?.warehouses[0]?.id ? String(defs.warehouses[0].id) : '1',
      notes: '',
      image_url: '',
      extra_barcodes: '',
    });
    setModalOpen(true);
  };

  const openEditProduct = (p: Product) => {
    setEditingProduct(p);
    setPForm({
      code: p.code,
      name: p.name,
      alt_name: p.alt_name || '',
      barcode: p.barcode || '',
      category_id: p.category_id ? String(p.category_id) : '',
      brand: p.brand || '',
      base_unit_id: String(p.base_unit_id),
      purchase_price: String(p.purchase_price),
      sale_price: String(p.sale_price),
      wholesale_price: String(p.wholesale_price),
      special_price: String(p.special_price),
      min_stock: String(p.min_stock),
      reorder_level: String(p.reorder_level),
      opening_qty: '0',
      opening_warehouse_id: '1',
      notes: p.notes || '',
      image_url: p.image_url || '',
      extra_barcodes: (p.extra_barcodes || []).map((b) => b.barcode).join(', '),
    });
    setModalOpen(true);
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        ...pForm,
        category_id: pForm.category_id ? Number(pForm.category_id) : null,
        base_unit_id: Number(pForm.base_unit_id),
        purchase_price: Number(pForm.purchase_price),
        sale_price: Number(pForm.sale_price),
        wholesale_price: Number(pForm.wholesale_price),
        special_price: Number(pForm.special_price),
        min_stock: Number(pForm.min_stock),
        reorder_level: Number(pForm.reorder_level),
        opening_qty: Number(pForm.opening_qty),
        opening_warehouse_id: Number(pForm.opening_warehouse_id),
        extra_barcodes: pForm.extra_barcodes
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      };
      if (editingProduct) {
        await apiFetch(`/api/products/${editingProduct.id}`, { method: 'PUT', body: JSON.stringify(payload) });
      } else {
        await apiFetch('/api/products', { method: 'POST', body: JSON.stringify(payload) });
      }
      setModalOpen(false);
      loadAll();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const toggleProduct = async (id: number) => {
    try {
      await apiFetch(`/api/products/${id}/toggle`, { method: 'PATCH' });
      loadAll();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const tabs: Array<{ id: typeof tab; label: string }> = [
    { id: 'products', label: 'الأصناف والأسعار' },
    { id: 'categories', label: 'الفئات والوحدات والبنود' },
    { id: 'warehouses', label: 'المخازن' },
    { id: 'customers', label: 'بيانات العملاء' },
    { id: 'suppliers', label: 'بيانات الموردين' },
    { id: 'cashboxes', label: 'البنوك والخزائن' },
  ];

  const activeTitle = tabs.find((t) => t.id === tab)?.label || 'أكواد وتعريفات';

  return (
    <div className="mina-panel-surface border border-slate-300 rounded-md overflow-hidden text-xs text-slate-900">
      {/* Dark Charcoal Header Band (matching screenshot 300) */}
      <div className="bg-gradient-to-b from-[#595655] to-[#3f3d3c] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-black">
        <h2 className="font-display font-bold text-base tracking-wide">{activeTitle}</h2>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`px-3 py-1 text-xs font-bold rounded-xs border transition-colors ${
                tab === t.id
                  ? 'bg-[#ece9d8] text-slate-950 border-white shadow-inner'
                  : 'bg-[#2c2b2a] text-slate-200 border-slate-600 hover:bg-[#3a3837]'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Black Filter Strip for Products (matching screenshot 300) */}
      {tab === 'products' && (
        <div className="bg-[#232221] text-white px-4 py-2 flex flex-wrap items-center justify-between gap-3 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <span className="font-bold">الفئة</span>
            <div className="bg-white text-slate-900 px-2 py-0.5 font-mono-num font-bold min-w-[36px] text-center">
              {catFilter || '*'}
            </div>
            <select
              value={catFilter}
              onChange={(e) => setCatFilter(e.target.value)}
              className="px-3 py-1 bg-white text-slate-900 border border-slate-500 font-semibold min-w-[180px]"
            >
              <option value="">كل الفئات</option>
              {defs?.categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={openNewProduct}
              className="win-btn px-3.5 py-1 rounded-xs font-bold flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-700" />
              تعريف صنف جديد
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="m-3 p-2.5 bg-red-100 text-red-900 border border-red-400 font-semibold">{error}</div>
      )}

      {/* PRODUCTS TAB */}
      {tab === 'products' && (
        <div className="p-3 space-y-3">
          <div className="bg-white border border-slate-500 overflow-x-auto min-h-[300px]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#214283] text-white">
                  <th className="py-2 px-3 border-l border-slate-500 text-right">الكود</th>
                  <th className="py-2 px-3 border-l border-slate-500 text-right">اسم الصنف</th>
                  <th className="py-2 px-3 border-l border-slate-500 text-right">الباركود</th>
                  <th className="py-2 px-3 border-l border-slate-500 text-right">الفئة / الوحدة</th>
                  {canViewCost && <th className="py-2 px-3 border-l border-slate-500 text-left">متوسط التكلفة</th>}
                  <th className="py-2 px-3 border-l border-slate-500 text-left">سعر البيع</th>
                  <th className="py-2 px-3 border-l border-slate-500 text-left">سعر الجملة</th>
                  <th className="py-2 px-3 border-l border-slate-500 text-center">الرصيد</th>
                  <th className="py-2 px-3 border-l border-slate-500 text-center">الحالة</th>
                  <th className="py-2 px-3 text-center">إجراء</th>
                </tr>
              </thead>
              <tbody>
                {products.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-slate-500">لا توجد أصناف مطابقة للبحث</td>
                  </tr>
                ) : (
                  products.map((p) => (
                    <tr key={p.id} className="border-b border-slate-300 hover:bg-[#eef4fb]">
                      <td className="py-1.5 px-3 border-l border-slate-300 font-mono-num font-bold">{p.code}</td>
                      <td className="py-1.5 px-3 border-l border-slate-300 font-bold">{p.name}</td>
                      <td className="py-1.5 px-3 border-l border-slate-300 font-mono-num text-slate-600">{p.barcode || '-'}</td>
                      <td className="py-1.5 px-3 border-l border-slate-300">{p.category_name || 'عام'} · {p.unit_name}</td>
                      {canViewCost && (
                        <td className="py-1.5 px-3 border-l border-slate-300 text-left font-mono-num">{formatMoney(p.avg_cost, currency)}</td>
                      )}
                      <td className="py-1.5 px-3 border-l border-slate-300 text-left font-mono-num font-bold text-blue-900">
                        {formatMoney(p.sale_price, currency)}
                      </td>
                      <td className="py-1.5 px-3 border-l border-slate-300 text-left font-mono-num">{formatMoney(p.wholesale_price, currency)}</td>
                      <td className="py-1.5 px-3 border-l border-slate-300 text-center font-mono-num font-extrabold">
                        <span className={Number(p.stock_qty) <= p.reorder_level ? 'text-red-700' : 'text-slate-900'}>
                          {formatNum(p.stock_qty)}
                        </span>
                      </td>
                      <td className="py-1.5 px-3 border-l border-slate-300 text-center font-bold">
                        {p.is_active ? <span className="text-emerald-700">نشط</span> : <span className="text-red-700">موقوف</span>}
                      </td>
                      <td className="py-1 px-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <button type="button" onClick={() => openEditProduct(p)} className="win-btn p-1 rounded-xs text-blue-800" title="تعديل">
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button type="button" onClick={() => toggleProduct(p.id)} className="win-btn p-1 rounded-xs text-slate-700" title={p.is_active ? 'إيقاف' : 'تفعيل'}>
                            <Power className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {/* Bottom Search Bar */}
          <div className="border-t border-slate-400 pt-2.5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-1 min-w-[240px]">
              <span className="font-bold whitespace-nowrap">بحث</span>
              <div className="relative flex-1 max-w-md">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute right-2.5 top-2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="بحث بالكود أو الباركود أو اسم الصنف..."
                  className="w-full pr-8 pl-3 py-1.5 border border-slate-600 bg-white"
                />
              </div>
              <label className="flex items-center gap-1.5 font-semibold whitespace-nowrap">
                <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
                إظهار الموقوفة
              </label>
            </div>
            <div className="flex items-center gap-2">
              <button type="button" onClick={loadAll} className="win-btn px-4 py-1.5 font-bold rounded-xs">
                استعلام
              </button>
              <button type="button" onClick={openNewProduct} className="win-btn px-4 py-1.5 font-bold rounded-xs">
                تعريف صنف جديد
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CATEGORIES, UNITS & EXPENSE TYPES */}
      {tab === 'categories' && defs && (
        <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-500 p-3 space-y-2.5">
            <h3 className="font-bold text-sm border-b border-slate-300 pb-1">الفئات والتصنيفات</h3>
            <div className="flex gap-1.5">
              <input type="text" value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="اسم الفئة الجديدة..." className="flex-1 px-2.5 py-1 border border-slate-500 bg-white" />
              <button
                type="button"
                onClick={async () => {
                  if (!catName.trim()) return;
                  setError('');
                  try {
                    await apiFetch('/api/categories', { method: 'POST', body: JSON.stringify({ name: catName }) });
                    setCatName('');
                    loadAll();
                  } catch (err: unknown) {
                    setError((err as Error).message);
                  }
                }}
                className="win-btn px-3 py-1 font-bold rounded-xs"
              >
                إضافة
              </button>
            </div>
            <div className="divide-y divide-slate-200 max-h-72 overflow-y-auto">
              {defs.categories.map((c) => (
                <div key={c.id} className="py-1.5 flex items-center justify-between">
                  <span className="font-semibold">{c.name}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      setError('');
                      try {
                        await apiFetch(`/api/categories/${c.id}`, { method: 'DELETE' });
                        loadAll();
                      } catch (err: unknown) {
                        setError((err as Error).message);
                      }
                    }}
                    className="win-btn p-1 rounded-xs text-red-700"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-500 p-3 space-y-2.5">
            <h3 className="font-bold text-sm border-b border-slate-300 pb-1">وحدات القياس</h3>
            <div className="flex gap-1.5">
              <input type="text" value={unitName} onChange={(e) => setUnitName(e.target.value)} placeholder="قطعة / علبة / كرتونة..." className="flex-1 px-2.5 py-1 border border-slate-500 bg-white" />
              <button
                type="button"
                onClick={async () => {
                  if (!unitName.trim()) return;
                  setError('');
                  try {
                    await apiFetch('/api/units', { method: 'POST', body: JSON.stringify({ name: unitName }) });
                    setUnitName('');
                    loadAll();
                  } catch (err: unknown) {
                    setError((err as Error).message);
                  }
                }}
                className="win-btn px-3 py-1 font-bold rounded-xs"
              >
                إضافة
              </button>
            </div>
            <div className="divide-y divide-slate-200 max-h-72 overflow-y-auto">
              {defs.units.map((u) => (
                <div key={u.id} className="py-1.5 font-semibold">{u.name}</div>
              ))}
            </div>
          </div>

          <div className="bg-white border border-slate-500 p-3 space-y-2.5">
            <h3 className="font-bold text-sm border-b border-slate-300 pb-1">بنود المصروفات والإيرادات</h3>
            <div className="flex gap-1.5">
              <input type="text" value={expName} onChange={(e) => setExpName(e.target.value)} placeholder="اسم البند..." className="flex-1 px-2 py-1 border border-slate-500 bg-white" />
              <select value={expKind} onChange={(e) => setExpKind(e.target.value as 'EXPENSE' | 'REVENUE')} className="px-2 py-1 border border-slate-500 bg-white">
                <option value="EXPENSE">مصروف</option>
                <option value="REVENUE">إيراد</option>
              </select>
              <button
                type="button"
                onClick={async () => {
                  if (!expName.trim()) return;
                  setError('');
                  try {
                    await apiFetch('/api/expense-types', { method: 'POST', body: JSON.stringify({ name: expName, kind: expKind }) });
                    setExpName('');
                    loadAll();
                  } catch (err: unknown) {
                    setError((err as Error).message);
                  }
                }}
                className="win-btn px-3 py-1 font-bold rounded-xs"
              >
                إضافة
              </button>
            </div>
            <div className="divide-y divide-slate-200 max-h-72 overflow-y-auto">
              {defs.expense_revenue_types.map((t) => (
                <div key={t.id} className="py-1.5 flex justify-between font-semibold">
                  <span>{t.name}</span>
                  <span className={t.kind === 'EXPENSE' ? 'text-red-700' : 'text-emerald-700'}>
                    {t.kind === 'EXPENSE' ? 'مصروف' : 'إيراد'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* WAREHOUSES */}
      {tab === 'warehouses' && defs && (
        <div className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-500 p-3 space-y-2.5">
            <h3 className="font-bold text-sm border-b border-slate-300 pb-1">إضافة مخزن جديد</h3>
            <input type="text" value={whForm.name} onChange={(e) => setWhForm({ ...whForm, name: e.target.value })} placeholder="اسم المخزن *" className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
            <input type="text" value={whForm.location} onChange={(e) => setWhForm({ ...whForm, location: e.target.value })} placeholder="العنوان / الموقع" className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
            <button
              type="button"
              onClick={async () => {
                if (!whForm.name.trim()) return;
                setError('');
                try {
                  await apiFetch('/api/warehouses', { method: 'POST', body: JSON.stringify(whForm) });
                  setWhForm({ name: '', location: '' });
                  loadAll();
                } catch (err: unknown) {
                  setError((err as Error).message);
                }
              }}
              className="win-btn w-full py-1.5 font-bold rounded-xs"
            >
              حفظ المخزن
            </button>
          </div>
          <div className="md:col-span-2 bg-white border border-slate-500 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#214283] text-white">
                  <th className="py-2 px-3 text-right">اسم المخزن</th>
                  <th className="py-2 px-3 text-right">الموقع</th>
                  <th className="py-2 px-3 text-center">افتراضي</th>
                </tr>
              </thead>
              <tbody>
                {defs.warehouses.map((w) => (
                  <tr key={w.id} className="border-b border-slate-300">
                    <td className="py-1.5 px-3 font-bold">{w.name}</td>
                    <td className="py-1.5 px-3 text-slate-600">{w.location || '-'}</td>
                    <td className="py-1.5 px-3 text-center">{w.is_default ? 'نعم' : '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CUSTOMERS */}
      {tab === 'customers' && defs && (
        <div className="p-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-500 p-3 space-y-2">
            <h3 className="font-bold text-sm border-b border-slate-300 pb-1">{custForm.id ? 'تعديل بيانات عميل' : 'إضافة عميل جديد'}</h3>
            <input type="text" value={custForm.name} onChange={(e) => setCustForm({ ...custForm, name: e.target.value })} placeholder="اسم العميل *" className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
            <input type="text" value={custForm.phone} onChange={(e) => setCustForm({ ...custForm, phone: e.target.value })} placeholder="رقم الهاتف" className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
            <input type="text" value={custForm.address} onChange={(e) => setCustForm({ ...custForm, address: e.target.value })} placeholder="العنوان" className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
            <div className="grid grid-cols-2 gap-2">
              {!custForm.id && (
                <div>
                  <label className="text-[11px] font-bold">رصيد بداية المدة</label>
                  <input type="number" value={custForm.opening_balance} onChange={(e) => setCustForm({ ...custForm, opening_balance: e.target.value })} className="w-full px-2 py-1 border border-slate-500 font-mono-num bg-white" />
                </div>
              )}
              <div>
                <label className="text-[11px] font-bold">الحد الائتماني</label>
                <input type="number" value={custForm.credit_limit} onChange={(e) => setCustForm({ ...custForm, credit_limit: e.target.value })} className="w-full px-2 py-1 border border-slate-500 font-mono-num bg-white" />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={async () => {
                  if (!custForm.name.trim()) return;
                  setError('');
                  try {
                    if (custForm.id) await apiFetch(`/api/customers/${custForm.id}`, { method: 'PUT', body: JSON.stringify(custForm) });
                    else await apiFetch('/api/customers', { method: 'POST', body: JSON.stringify(custForm) });
                    setCustForm({ id: 0, name: '', phone: '', address: '', tax_number: '', opening_balance: '0', credit_limit: '0', notes: '' });
                    loadAll();
                  } catch (err: unknown) {
                    setError((err as Error).message);
                  }
                }}
                className="win-btn flex-1 py-1.5 font-bold rounded-xs"
              >
                {custForm.id ? 'تحديث' : 'حفظ العميل'}
              </button>
              {custForm.id > 0 && (
                <button type="button" onClick={() => setCustForm({ id: 0, name: '', phone: '', address: '', tax_number: '', opening_balance: '0', credit_limit: '0', notes: '' })} className="win-btn px-3 py-1.5 rounded-xs">
                  إلغاء
                </button>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 bg-white border border-slate-500 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#214283] text-white">
                  <th className="py-2 px-3 text-right">الكود</th>
                  <th className="py-2 px-3 text-right">اسم العميل</th>
                  <th className="py-2 px-3 text-right">الهاتف</th>
                  <th className="py-2 px-3 text-left">الحد الائتماني</th>
                  <th className="py-2 px-3 text-left">الرصيد الحالي</th>
                  <th className="py-2 px-3 text-center">تعديل</th>
                </tr>
              </thead>
              <tbody>
                {defs.customers.map((c) => (
                  <tr key={c.id} className="border-b border-slate-300">
                    <td className="py-1.5 px-3 font-mono-num">{c.code}</td>
                    <td className="py-1.5 px-3 font-bold">{c.name}</td>
                    <td className="py-1.5 px-3 font-mono-num">{c.phone || '-'}</td>
                    <td className="py-1.5 px-3 text-left font-mono-num">{formatMoney(c.credit_limit, currency)}</td>
                    <td className="py-1.5 px-3 text-left font-mono-num font-extrabold">{formatMoney(c.current_balance, currency)}</td>
                    <td className="py-1 px-3 text-center">
                      {!c.is_walkin && (
                        <button
                          type="button"
                          onClick={() =>
                            setCustForm({
                              id: c.id,
                              name: c.name,
                              phone: c.phone,
                              address: c.address,
                              tax_number: c.tax_number,
                              opening_balance: String(c.opening_balance),
                              credit_limit: String(c.credit_limit),
                              notes: c.notes,
                            })
                          }
                          className="win-btn p-1 rounded-xs text-blue-800"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUPPLIERS */}
      {tab === 'suppliers' && defs && (
        <div className="p-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-500 p-3 space-y-2">
            <h3 className="font-bold text-sm border-b border-slate-300 pb-1">{supForm.id ? 'تعديل مورد' : 'إضافة مورد جديد'}</h3>
            <input type="text" value={supForm.name} onChange={(e) => setSupForm({ ...supForm, name: e.target.value })} placeholder="اسم المورد *" className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
            <input type="text" value={supForm.phone} onChange={(e) => setSupForm({ ...supForm, phone: e.target.value })} placeholder="رقم الهاتف" className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
            <input type="text" value={supForm.address} onChange={(e) => setSupForm({ ...supForm, address: e.target.value })} placeholder="العنوان" className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
            {!supForm.id && (
              <div>
                <label className="text-[11px] font-bold">رصيد افتتاحي للمورد</label>
                <input type="number" value={supForm.opening_balance} onChange={(e) => setSupForm({ ...supForm, opening_balance: e.target.value })} className="w-full px-2 py-1 border border-slate-500 font-mono-num bg-white" />
              </div>
            )}
            <button
              type="button"
              onClick={async () => {
                if (!supForm.name.trim()) return;
                setError('');
                try {
                  if (supForm.id) await apiFetch(`/api/suppliers/${supForm.id}`, { method: 'PUT', body: JSON.stringify(supForm) });
                  else await apiFetch('/api/suppliers', { method: 'POST', body: JSON.stringify(supForm) });
                  setSupForm({ id: 0, name: '', phone: '', address: '', tax_number: '', opening_balance: '0', notes: '' });
                  loadAll();
                } catch (err: unknown) {
                  setError((err as Error).message);
                }
              }}
              className="win-btn w-full py-1.5 font-bold rounded-xs"
            >
              {supForm.id ? 'تحديث' : 'حفظ المورد'}
            </button>
          </div>
          <div className="lg:col-span-2 bg-white border border-slate-500 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#214283] text-white">
                  <th className="py-2 px-3 text-right">الكود</th>
                  <th className="py-2 px-3 text-right">المورد</th>
                  <th className="py-2 px-3 text-right">الهاتف</th>
                  <th className="py-2 px-3 text-left">الرصيد المستحق له</th>
                  <th className="py-2 px-3 text-center">تعديل</th>
                </tr>
              </thead>
              <tbody>
                {defs.suppliers.map((s) => (
                  <tr key={s.id} className="border-b border-slate-300">
                    <td className="py-1.5 px-3 font-mono-num">{s.code}</td>
                    <td className="py-1.5 px-3 font-bold">{s.name}</td>
                    <td className="py-1.5 px-3 font-mono-num">{s.phone || '-'}</td>
                    <td className="py-1.5 px-3 text-left font-mono-num font-extrabold">{formatMoney(s.current_balance, currency)}</td>
                    <td className="py-1 px-3 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          setSupForm({
                            id: s.id,
                            name: s.name,
                            phone: s.phone,
                            address: s.address,
                            tax_number: s.tax_number,
                            opening_balance: String(s.opening_balance),
                            notes: s.notes,
                          })
                        }
                        className="win-btn p-1 rounded-xs text-blue-800"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* CASHBOXES */}
      {tab === 'cashboxes' && defs && (
        <div className="p-3 grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="bg-white border border-slate-500 p-3 space-y-2">
            <h3 className="font-bold text-sm border-b border-slate-300 pb-1">إضافة خزينة / حساب بنكي</h3>
            <input type="text" value={cbForm.name} onChange={(e) => setCbForm({ ...cbForm, name: e.target.value })} placeholder="الاسم *" className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
            <select value={cbForm.type} onChange={(e) => setCbForm({ ...cbForm, type: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white">
              <option value="CASH">خزينة نقدية</option>
              <option value="BANK">حساب بنكي</option>
            </select>
            <input type="text" value={cbForm.account_number} onChange={(e) => setCbForm({ ...cbForm, account_number: e.target.value })} placeholder="رقم الحساب" className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
            <div>
              <label className="text-[11px] font-bold">الرصيد الافتتاحي</label>
              <input type="number" value={cbForm.opening_balance} onChange={(e) => setCbForm({ ...cbForm, opening_balance: e.target.value })} className="w-full px-2 py-1 border border-slate-500 font-mono-num bg-white" />
            </div>
            <button
              type="button"
              onClick={async () => {
                if (!cbForm.name.trim()) return;
                setError('');
                try {
                  await apiFetch('/api/cashboxes', { method: 'POST', body: JSON.stringify(cbForm) });
                  setCbForm({ name: '', type: 'CASH', account_number: '', opening_balance: '0' });
                  loadAll();
                } catch (err: unknown) {
                  setError((err as Error).message);
                }
              }}
              className="win-btn w-full py-1.5 font-bold rounded-xs"
            >
              حفظ الخزينة / البنك
            </button>
          </div>
          <div className="lg:col-span-2 bg-white border border-slate-500 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#214283] text-white">
                  <th className="py-2 px-3 text-right">الاسم</th>
                  <th className="py-2 px-3 text-right">النوع</th>
                  <th className="py-2 px-3 text-right">رقم الحساب</th>
                  <th className="py-2 px-3 text-left">الرصيد الحالي</th>
                </tr>
              </thead>
              <tbody>
                {defs.cashboxes.map((cb) => (
                  <tr key={cb.id} className="border-b border-slate-300">
                    <td className="py-1.5 px-3 font-bold">{cb.name}</td>
                    <td className="py-1.5 px-3">{cb.type === 'BANK' ? 'حساب بنكي' : 'خزينة نقدية'}</td>
                    <td className="py-1.5 px-3 font-mono-num">{cb.account_number || '-'}</td>
                    <td className="py-1.5 px-3 text-left font-mono-num font-extrabold text-emerald-800">{formatMoney(cb.current_balance, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PRODUCT MODAL */}
      {modalOpen && defs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 overflow-y-auto">
          <form onSubmit={saveProduct} className="win-window w-full max-w-3xl rounded-xs overflow-hidden">
            <div className="h-8 bg-white border-b border-slate-300 px-3 flex items-center justify-between font-bold">
              <span>{editingProduct ? 'تعديل بيانات الصنف' : 'تعريف صنف جديد'}</span>
              <button type="button" onClick={() => setModalOpen(false)}><X className="w-4 h-4" /></button>
            </div>
            <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
              <div>
                <label className="block mb-1 font-bold">كود الصنف</label>
                <input type="text" value={pForm.code} onChange={(e) => setPForm({ ...pForm, code: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
              </div>
              <div className="md:col-span-2">
                <label className="block mb-1 font-bold">اسم الصنف *</label>
                <input type="text" required value={pForm.name} onChange={(e) => setPForm({ ...pForm, name: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white" />
              </div>
              <div>
                <label className="block mb-1 font-bold">الباركود الأساسي</label>
                <div className="flex gap-1">
                  <input type="text" value={pForm.barcode} onChange={(e) => setPForm({ ...pForm, barcode: e.target.value })} className="flex-1 px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
                  <button
                    type="button"
                    onClick={() => setPForm((prev) => ({ ...prev, barcode: generateRandomEan13() }))}
                    className="win-btn px-2 py-1 font-bold text-teal-800 shrink-0"
                    title="توليد باركود تلقائي"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
              <div>
                <label className="block mb-1 font-bold">الفئة</label>
                <select value={pForm.category_id} onChange={(e) => setPForm({ ...pForm, category_id: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white">
                  <option value="">عام</option>
                  {defs.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block mb-1 font-bold">الوحدة الأساسية</label>
                <select value={pForm.base_unit_id} onChange={(e) => setPForm({ ...pForm, base_unit_id: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white">
                  {defs.units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block mb-1 font-bold">سعر الشراء</label>
                <input type="number" step="0.01" min="0" value={pForm.purchase_price} onChange={(e) => setPForm({ ...pForm, purchase_price: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
              </div>
              <div>
                <label className="block mb-1 font-bold">سعر البيع (المستهلك)</label>
                <input type="number" step="0.01" min="0" value={pForm.sale_price} onChange={(e) => setPForm({ ...pForm, sale_price: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
              </div>
              <div>
                <label className="block mb-1 font-bold">سعر الجملة</label>
                <input type="number" step="0.01" min="0" value={pForm.wholesale_price} onChange={(e) => setPForm({ ...pForm, wholesale_price: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
              </div>
              <div>
                <label className="block mb-1 font-bold">سعر خاص</label>
                <input type="number" step="0.01" min="0" value={pForm.special_price} onChange={(e) => setPForm({ ...pForm, special_price: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
              </div>
              <div>
                <label className="block mb-1 font-bold">الحد الأدنى</label>
                <input type="number" value={pForm.min_stock} onChange={(e) => setPForm({ ...pForm, min_stock: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
              </div>
              <div>
                <label className="block mb-1 font-bold">حد إعادة الطلب</label>
                <input type="number" value={pForm.reorder_level} onChange={(e) => setPForm({ ...pForm, reorder_level: e.target.value })} className="w-full px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
              </div>
              {!editingProduct && (
                <>
                  <div>
                    <label className="block mb-1 font-bold text-blue-900">رصيد افتتاحي</label>
                    <input type="number" min="0" value={pForm.opening_qty} onChange={(e) => setPForm({ ...pForm, opening_qty: e.target.value })} className="w-full px-2.5 py-1.5 border border-blue-600 bg-white font-mono-num" />
                  </div>
                  <div>
                    <label className="block mb-1 font-bold text-blue-900">مخزن الرصيد الافتتاحي</label>
                    <select value={pForm.opening_warehouse_id} onChange={(e) => setPForm({ ...pForm, opening_warehouse_id: e.target.value })} className="w-full px-2.5 py-1.5 border border-blue-600 bg-white">
                      {defs.warehouses.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                    </select>
                  </div>
                </>
              )}
              <div className="md:col-span-3">
                <label className="block mb-1 font-bold">صورة الصنف (لأزرار شاشة البيع السريع Touch Screen)</label>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={pForm.image_url}
                    onChange={(e) => setPForm({ ...pForm, image_url: e.target.value })}
                    placeholder="رابط صورة أو اختر صورة من جهازك..."
                    className="flex-1 px-2.5 py-1.5 border border-slate-500 bg-white"
                  />
                  <label className="win-btn px-3 py-1.5 font-bold cursor-pointer flex items-center gap-1.5">
                    <ImagePlus className="w-3.5 h-3.5 text-teal-700" /> رفع صورة
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = '';
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = () => setPForm((prev) => ({ ...prev, image_url: String(reader.result || '') }));
                        reader.readAsDataURL(file);
                      }}
                    />
                  </label>
                  {pForm.image_url && (
                    <img src={pForm.image_url} alt="معاينة" className="w-9 h-9 object-cover rounded border border-slate-300 bg-white" />
                  )}
                </div>
              </div>
              <div className="md:col-span-3">
                <label className="block mb-1 font-bold">باركودات إضافية (مفصولة بفاصلة)</label>
                <input type="text" value={pForm.extra_barcodes} onChange={(e) => setPForm({ ...pForm, extra_barcodes: e.target.value })} placeholder="622100001010, 622100001011" className="w-full px-2.5 py-1.5 border border-slate-500 bg-white font-mono-num" />
              </div>
              <div className="md:col-span-3 flex justify-end gap-2 pt-2 border-t border-slate-400">
                <button type="button" onClick={() => setModalOpen(false)} className="win-btn px-4 py-1.5 font-bold rounded-xs">إلغاء</button>
                <button type="submit" className="win-btn px-5 py-1.5 font-extrabold rounded-xs flex items-center gap-1.5 text-emerald-900">
                  <Save className="w-3.5 h-3.5 text-emerald-700" /> حفظ الصنف
                </button>
              </div>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
