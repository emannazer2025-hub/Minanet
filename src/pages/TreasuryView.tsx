import React, { useEffect, useState } from 'react';
import { Wallet, ArrowLeftRight, ListChecks } from 'lucide-react';
import { apiFetch, formatMoney, todayDateStr } from '../api.ts';
import type { DefinitionsBundle } from '../types.ts';

interface TreasuryViewProps {
  settings: Record<string, string>;
  initialTab?: 'vouchers' | 'transfer' | 'ledger';
}

export const TreasuryView: React.FC<TreasuryViewProps> = ({ settings, initialTab = 'vouchers' }) => {
  const [tab, setTab] = useState<'vouchers' | 'transfer' | 'ledger'>(initialTab);
  const [defs, setDefs] = useState<DefinitionsBundle | null>(null);
  const [vouchers, setVouchers] = useState<Array<Record<string, unknown>>>([]);
  const [transfers, setTransfers] = useState<Array<Record<string, unknown>>>([]);
  const [selectedCashboxId, setSelectedCashboxId] = useState<string>('1');
  const [ledgerData, setLedgerData] = useState<{ cashbox: Record<string, unknown>; movements: Array<Record<string, unknown>> } | null>(null);

  const [vForm, setVForm] = useState({
    voucher_number: '',
    voucher_date: todayDateStr(),
    kind: 'EXPENSE' as 'EXPENSE' | 'REVENUE',
    type_id: '',
    cashbox_id: '',
    amount: '',
    payment_method: 'نقدي',
    description: '',
    attachment_name: '',
  });

  const [tForm, setTForm] = useState({
    from_cashbox_id: '',
    to_cashbox_id: '',
    transfer_date: todayDateStr(),
    amount: '',
    notes: '',
  });

  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const currency = settings.currency || 'ج.م.';

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadAll = async () => {
    try {
      const [d, v, tr] = await Promise.all([
        apiFetch<DefinitionsBundle>('/api/definitions/all'),
        apiFetch<Array<Record<string, unknown>>>('/api/treasury/vouchers'),
        apiFetch<Array<Record<string, unknown>>>('/api/treasury/transfers'),
      ]);
      setDefs(d);
      setVouchers(v);
      setTransfers(tr);
      if (d.cashboxes[0]) {
        setVForm((f) => ({ ...f, cashbox_id: f.cashbox_id || String(d.cashboxes[0].id) }));
        setTForm((f) => ({ ...f, from_cashbox_id: f.from_cashbox_id || String(d.cashboxes[0].id) }));
        setSelectedCashboxId((id) => id || String(d.cashboxes[0].id));
      }
      if (d.cashboxes[1]) {
        setTForm((f) => ({ ...f, to_cashbox_id: f.to_cashbox_id || String(d.cashboxes[1].id) }));
      }
      const firstExp = d.expense_revenue_types.find((t) => t.kind === 'EXPENSE');
      if (firstExp) setVForm((f) => ({ ...f, type_id: f.type_id || String(firstExp.id) }));
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (tab === 'ledger' && selectedCashboxId) {
      apiFetch<{ cashbox: Record<string, unknown>; movements: Array<Record<string, unknown>> }>(
        `/api/treasury/ledger/${selectedCashboxId}`
      )
        .then(setLedgerData)
        .catch((err: unknown) => setError((err as Error).message));
    }
  }, [tab, selectedCashboxId]);

  const submitVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch<{ voucher_number: string }>('/api/treasury/vouchers', {
        method: 'POST',
        body: JSON.stringify({ ...vForm, type_id: Number(vForm.type_id), cashbox_id: Number(vForm.cashbox_id), amount: Number(vForm.amount) }),
      });
      setSuccess(`تم حفظ السند رقم ${res.voucher_number}`);
      setVForm((f) => ({ ...f, voucher_number: '', amount: '', description: '', attachment_name: '' }));
      loadAll();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const submitTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch<{ transfer_number: string }>('/api/treasury/transfers', {
        method: 'POST',
        body: JSON.stringify({
          ...tForm,
          from_cashbox_id: Number(tForm.from_cashbox_id),
          to_cashbox_id: Number(tForm.to_cashbox_id),
          amount: Number(tForm.amount),
        }),
      });
      setSuccess(`تم تنفيذ التحويل رقم ${res.transfer_number}`);
      setTForm((f) => ({ ...f, amount: '', notes: '' }));
      loadAll();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const filteredTypes = defs?.expense_revenue_types.filter((t) => t.kind === vForm.kind) || [];

  return (
    <div className="bg-[#ece9d8] text-slate-900">
      {/* Classic Sub-Tabs & Live Cashbox Strip */}
      <div className="bg-[#d6d2c2] border-b border-[#aca899] px-3 py-2 flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setTab('vouchers')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'vouchers' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
          >
            <Wallet className="w-3.5 h-3.5" /> مصروفات وإيرادات
          </button>
          <button
            type="button"
            onClick={() => setTab('transfer')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'transfer' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" /> تحويل بين الخزائن
          </button>
          <button
            type="button"
            onClick={() => setTab('ledger')}
            className={`flex items-center gap-1.5 px-3 py-1.5 font-bold border ${tab === 'ledger' ? 'bg-[#214283] text-white border-[#12264d]' : 'win-btn text-slate-900'}`}
          >
            <ListChecks className="w-3.5 h-3.5" /> كشف حركة الخزينة والبنك
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {defs?.cashboxes.map((cb) => (
            <div key={cb.id} className="bg-white border border-[#8c8c8c] px-2.5 py-1">
              <span className="text-slate-600 font-semibold">{cb.name}: </span>
              <strong className="font-mono-num text-emerald-800">{formatMoney(cb.current_balance, currency)}</strong>
            </div>
          ))}
        </div>
      </div>

      {error && <div className="m-3 p-2 text-xs bg-red-100 text-red-800 border border-red-400 font-semibold">{error}</div>}
      {success && <div className="m-3 p-2 text-xs bg-emerald-100 text-emerald-900 border border-emerald-500 font-semibold">{success}</div>}

      <div className="p-3">
        {/* VOUCHERS */}
        {tab === 'vouchers' && defs && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <form onSubmit={submitVoucher} className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-2.5 text-xs">
              <h3 className="font-bold text-sm border-b border-[#aca899] pb-1.5">تسجيل سند مصروف / إيراد</h3>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const first = defs.expense_revenue_types.find((t) => t.kind === 'EXPENSE');
                    setVForm((f) => ({ ...f, kind: 'EXPENSE', type_id: first ? String(first.id) : '' }));
                  }}
                  className={`py-1.5 font-bold border ${vForm.kind === 'EXPENSE' ? 'bg-[#991b1b] text-white border-red-950' : 'win-btn text-slate-900'}`}
                >
                  سند مصروف
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const first = defs.expense_revenue_types.find((t) => t.kind === 'REVENUE');
                    setVForm((f) => ({ ...f, kind: 'REVENUE', type_id: first ? String(first.id) : '' }));
                  }}
                  className={`py-1.5 font-bold border ${vForm.kind === 'REVENUE' ? 'bg-emerald-800 text-white border-emerald-950' : 'win-btn text-slate-900'}`}
                >
                  سند إيراد
                </button>
              </div>
              <select value={vForm.type_id} onChange={(e) => setVForm({ ...vForm, type_id: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                {filteredTypes.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
              <select value={vForm.cashbox_id} onChange={(e) => setVForm({ ...vForm, cashbox_id: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                {defs.cashboxes.map((cb) => <option key={cb.id} value={cb.id}>{cb.name}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-2">
                <input required type="number" min="0.01" step="0.01" placeholder="المبلغ *" value={vForm.amount} onChange={(e) => setVForm({ ...vForm, amount: e.target.value })} className="px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num" />
                <input type="date" value={vForm.voucher_date} onChange={(e) => setVForm({ ...vForm, voucher_date: e.target.value })} className="px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num" />
              </div>
              <input required placeholder="البيان / الوصف *" value={vForm.description} onChange={(e) => setVForm({ ...vForm, description: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white" />
              <input placeholder="رقم السند (تلقائي إذا ترك فارغًا - يمنع التكرار)" value={vForm.voucher_number} onChange={(e) => setVForm({ ...vForm, voucher_number: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num" />
              <button type="submit" className="win-btn w-full py-2 font-bold text-blue-950">اعتماد السند</button>
            </form>

            <div className="lg:col-span-2 bg-white border border-[#8c8c8c] overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#214283] text-white">
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">السند</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">التاريخ</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">النوع</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">التصنيف</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">الخزينة</th>
                    <th className="py-2 px-3 text-left border-l border-[#375da3]">المبلغ</th>
                    <th className="py-2 px-3 text-right">البيان</th>
                  </tr>
                </thead>
                <tbody>
                  {vouchers.map((v, idx) => (
                    <tr key={String(v.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                      <td className="py-1.5 px-3 font-mono-num font-bold">{String(v.voucher_number)}</td>
                      <td className="py-1.5 px-3 font-mono-num">{String(v.voucher_date)}</td>
                      <td className={`py-1.5 px-3 font-bold ${v.kind === 'EXPENSE' ? 'text-red-700' : 'text-emerald-700'}`}>
                        {v.kind === 'EXPENSE' ? 'مصروف' : 'إيراد'}
                      </td>
                      <td className="py-1.5 px-3">{String(v.type_name)}</td>
                      <td className="py-1.5 px-3">{String(v.cashbox_name)}</td>
                      <td className="py-1.5 px-3 text-left font-mono-num font-bold">{formatMoney(Number(v.amount), currency)}</td>
                      <td className="py-1.5 px-3 text-slate-600">{String(v.description)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TRANSFERS */}
        {tab === 'transfer' && defs && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <form onSubmit={submitTransfer} className="bg-[#f4f3ee] border border-[#8c8c8c] p-4 space-y-3 text-xs">
              <h3 className="font-bold text-sm border-b border-[#aca899] pb-1.5">تحويل نقدية بين الخزائن والبنوك</h3>
              <div>
                <label className="block mb-1 font-bold">من خزينة / حساب</label>
                <select value={tForm.from_cashbox_id} onChange={(e) => setTForm({ ...tForm, from_cashbox_id: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                  {defs.cashboxes.map((cb) => <option key={cb.id} value={cb.id}>{cb.name} ({cb.current_balance.toFixed(2)})</option>)}
                </select>
              </div>
              <div>
                <label className="block mb-1 font-bold">إلى خزينة / حساب</label>
                <select value={tForm.to_cashbox_id} onChange={(e) => setTForm({ ...tForm, to_cashbox_id: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white">
                  {defs.cashboxes.map((cb) => <option key={cb.id} value={cb.id}>{cb.name} ({cb.current_balance.toFixed(2)})</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input required type="number" min="0.01" step="0.01" placeholder="المبلغ *" value={tForm.amount} onChange={(e) => setTForm({ ...tForm, amount: e.target.value })} className="px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num" />
                <input type="date" value={tForm.transfer_date} onChange={(e) => setTForm({ ...tForm, transfer_date: e.target.value })} className="px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num" />
              </div>
              <input placeholder="ملاحظات" value={tForm.notes} onChange={(e) => setTForm({ ...tForm, notes: e.target.value })} className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white" />
              <button type="submit" className="win-btn w-full py-2 font-bold text-blue-950">اعتماد التحويل</button>
            </form>

            <div className="lg:col-span-2 bg-white border border-[#8c8c8c] overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#214283] text-white">
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">المستند</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">التاريخ</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">من</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">إلى</th>
                    <th className="py-2 px-3 text-left">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {transfers.map((t, idx) => (
                    <tr key={String(t.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                      <td className="py-1.5 px-3 font-mono-num font-bold">{String(t.transfer_number)}</td>
                      <td className="py-1.5 px-3 font-mono-num">{String(t.transfer_date)}</td>
                      <td className="py-1.5 px-3">{String(t.from_name)}</td>
                      <td className="py-1.5 px-3">{String(t.to_name)}</td>
                      <td className="py-1.5 px-3 text-left font-mono-num font-bold">{formatMoney(Number(t.amount), currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* LEDGER */}
        {tab === 'ledger' && defs && (
          <div className="space-y-3 text-xs">
            <div className="bg-[#f4f3ee] border border-[#8c8c8c] p-3 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <label className="font-bold">اختر الخزينة / البنك:</label>
                <select value={selectedCashboxId} onChange={(e) => setSelectedCashboxId(e.target.value)} className="px-3 py-1.5 border border-[#7f9db9] bg-white">
                  {defs.cashboxes.map((cb) => <option key={cb.id} value={cb.id}>{cb.name}</option>)}
                </select>
              </div>
              {ledgerData?.cashbox && (
                <div className="bg-white border border-[#8c8c8c] px-4 py-1 font-mono-num font-bold text-sm text-blue-950">
                  الرصيد الحالي: {formatMoney(Number(ledgerData.cashbox.current_balance), currency)}
                </div>
              )}
            </div>
            <div className="bg-white border border-[#8c8c8c] overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#214283] text-white">
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">التاريخ</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">الحركة</th>
                    <th className="py-2 px-3 text-right border-l border-[#375da3]">المرجع</th>
                    <th className="py-2 px-3 text-left border-l border-[#375da3]">وارد</th>
                    <th className="py-2 px-3 text-left border-l border-[#375da3]">صادر</th>
                    <th className="py-2 px-3 text-left border-l border-[#375da3]">الرصيد بعد</th>
                    <th className="py-2 px-3 text-right">البيان</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData?.movements.map((m, idx) => (
                    <tr key={String(m.id)} className={idx % 2 === 0 ? 'bg-white border-b border-slate-200' : 'bg-slate-50 border-b border-slate-200'}>
                      <td className="py-1.5 px-3 font-mono-num">{String(m.movement_date)}</td>
                      <td className="py-1.5 px-3">{String(m.movement_type)}</td>
                      <td className="py-1.5 px-3 font-mono-num">{String(m.reference_number)}</td>
                      <td className="py-1.5 px-3 text-left font-mono-num text-emerald-700 font-bold">{Number(m.amount_in) > 0 ? formatMoney(Number(m.amount_in), currency) : '-'}</td>
                      <td className="py-1.5 px-3 text-left font-mono-num text-red-700 font-bold">{Number(m.amount_out) > 0 ? formatMoney(Number(m.amount_out), currency) : '-'}</td>
                      <td className="py-1.5 px-3 text-left font-mono-num font-bold">{formatMoney(Number(m.balance_after), currency)}</td>
                      <td className="py-1.5 px-3 text-slate-600">{String(m.notes)}</td>
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
