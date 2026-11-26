import React, { useEffect, useState } from 'react';
import { Printer, PlusCircle } from 'lucide-react';
import { apiFetch, formatMoney, todayDateStr } from '../api.ts';
import type { DefinitionsBundle } from '../types.ts';

interface AccountsViewProps {
  settings: Record<string, string>;
  initialTab?: 'statement' | 'vouchers' | 'aging';
}

export const AccountsView: React.FC<AccountsViewProps> = ({ settings, initialTab = 'vouchers' }) => {
  const [tab, setTab] = useState<'statement' | 'vouchers' | 'aging'>(initialTab);
  const [defs, setDefs] = useState<DefinitionsBundle | null>(null);
  const [partyType, setPartyType] = useState<'CUSTOMER' | 'SUPPLIER'>('SUPPLIER');
  const [partyId, setPartyId] = useState<string>('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [statement, setStatement] = useState<{ party: Record<string, unknown>; transactions: Array<Record<string, unknown>> } | null>(null);

  const [vKind, setVKind] = useState<'RECEIPT' | 'PAYMENT'>('PAYMENT');
  const [vPartyType, setVPartyType] = useState<'CUSTOMER' | 'SUPPLIER'>('SUPPLIER');
  const [vPartyId, setVPartyId] = useState<string>('');
  const [vCashboxId, setVCashboxId] = useState<number>(1);
  const [vAmount, setVAmount] = useState('');
  const [vMethod, setVMethod] = useState('نقدي');
  const [vDate, setVDate] = useState(todayDateStr());
  const [vNotes, setVNotes] = useState('');
  const [vouchersList, setVouchersList] = useState<Array<Record<string, unknown>>>([]);
  const [agingList, setAgingList] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const currency = settings.currency || 'ج.م.';

  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  const loadDefs = async () => {
    try {
      const d = await apiFetch<DefinitionsBundle>('/api/definitions/all');
      setDefs(d);
      const firstSup = d.suppliers[0];
      const firstCust = d.customers.find((c) => !c.is_walkin) || d.customers[0];
      if (!partyId) {
        if (partyType === 'SUPPLIER' && firstSup) setPartyId(String(firstSup.id));
        else if (firstCust) setPartyId(String(firstCust.id));
      }
      if (!vPartyId) {
        if (vPartyType === 'SUPPLIER' && firstSup) setVPartyId(String(firstSup.id));
        else if (firstCust) setVPartyId(String(firstCust.id));
      }
      if (d.cashboxes[0]) setVCashboxId(d.cashboxes[0].id);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    void loadDefs();
  }, []);

  const loadStatement = async () => {
    if (!partyId) return;
    try {
      const data = await apiFetch<{ party: Record<string, unknown>; transactions: Array<Record<string, unknown>> }>(
        `/api/accounts/statement?party_type=${partyType}&party_id=${partyId}&from=${fromDate}&to=${toDate}`
      );
      setStatement(data);
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  useEffect(() => {
    if (tab === 'statement' && partyId) void loadStatement();
    if (tab === 'vouchers') {
      apiFetch<Array<Record<string, unknown>>>('/api/receipts-payments')
        .then(setVouchersList)
        .catch((err: unknown) => setError((err as Error).message));
    }
    if (tab === 'aging') {
      apiFetch<Array<Record<string, unknown>>>(`/api/accounts/aging?party_type=${partyType}`)
        .then(setAgingList)
        .catch((err: unknown) => setError((err as Error).message));
    }
  }, [tab, partyType, partyId, fromDate, toDate]);

  const submitVoucher = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    try {
      const res = await apiFetch<{ voucher_number: string }>('/api/receipts-payments', {
        method: 'POST',
        body: JSON.stringify({
          voucher_date: vDate,
          kind: vKind,
          party_type: vPartyType,
          party_id: Number(vPartyId),
          cashbox_id: vCashboxId,
          amount: Number(vAmount),
          payment_method: vMethod,
          notes: vNotes,
        }),
      });
      setSuccess(`تم اعتماد السند رقم ${res.voucher_number} وتحديث الرصيد والخزينة`);
      setVAmount('');
      setVNotes('');
      apiFetch<Array<Record<string, unknown>>>('/api/receipts-payments').then(setVouchersList);
      loadDefs();
    } catch (err: unknown) {
      setError((err as Error).message);
    }
  };

  const partyOptions =
    partyType === 'CUSTOMER'
      ? (defs?.customers.filter((c) => !c.is_walkin) || [])
      : (defs?.suppliers || []);

  const vPartyOptions =
    vPartyType === 'CUSTOMER'
      ? (defs?.customers.filter((c) => !c.is_walkin) || [])
      : (defs?.suppliers || []);

  const activeVoucherParty = vPartyOptions.find((p) => String(p.id) === vPartyId);

  return (
    <div className="bg-[#f3f3f3] border border-slate-600 rounded-xs overflow-hidden text-xs text-slate-900">
      {/* Dark Charcoal Header (matching screenshot 1260) */}
      <div className="bg-gradient-to-b from-[#4c4a49] to-[#343231] text-white px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 border-b border-black">
        <div className="font-display font-bold text-base">
          {tab === 'vouchers'
            ? vPartyType === 'SUPPLIER'
              ? 'مدفوعات الموردين'
              : 'مقبوضات العملاء'
            : tab === 'statement'
            ? 'كشف حساب عميل / مورد'
            : 'أعمار الديون والمتأخرات'}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            onClick={() => setTab('vouchers')}
            className={`px-3 py-1 font-bold rounded-xs border ${tab === 'vouchers' ? 'bg-[#ece9d8] text-slate-950 border-white' : 'bg-[#2c2b2a] text-slate-200 border-slate-600'}`}
          >
            المدفوعات والتحصيلات
          </button>
          <button
            type="button"
            onClick={() => setTab('statement')}
            className={`px-3 py-1 font-bold rounded-xs border ${tab === 'statement' ? 'bg-[#ece9d8] text-slate-950 border-white' : 'bg-[#2c2b2a] text-slate-200 border-slate-600'}`}
          >
            كشف الحساب
          </button>
          <button
            type="button"
            onClick={() => setTab('aging')}
            className={`px-3 py-1 font-bold rounded-xs border ${tab === 'aging' ? 'bg-[#ece9d8] text-slate-950 border-white' : 'bg-[#2c2b2a] text-slate-200 border-slate-600'}`}
          >
            أعمار الديون
          </button>
        </div>
      </div>

      {error && <div className="m-3 p-2.5 bg-red-100 text-red-900 border border-red-400 font-semibold">{error}</div>}
      {success && <div className="m-3 p-2.5 bg-emerald-100 text-emerald-900 border border-emerald-500 font-semibold">{success}</div>}

      {/* VOUCHERS TAB (Matching screenshot 1260 layout) */}
      {tab === 'vouchers' && defs && (
        <div className="p-4 space-y-4">
          <form onSubmit={submitVoucher} className="space-y-3 bg-[#ece9d8] border border-slate-400 p-3.5">
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-3 flex items-center gap-2">
                <span className="font-bold whitespace-nowrap">الطرف</span>
                <select
                  value={vPartyType}
                  onChange={(e) => {
                    const pt = e.target.value as 'CUSTOMER' | 'SUPPLIER';
                    setVPartyType(pt);
                    setVKind(pt === 'CUSTOMER' ? 'RECEIPT' : 'PAYMENT');
                    const list = pt === 'CUSTOMER' ? defs.customers.filter((c) => !c.is_walkin) : defs.suppliers;
                    setVPartyId(list[0]?.id ? String(list[0].id) : '');
                  }}
                  className="flex-1 px-2 py-1.5 border border-slate-600 bg-white font-bold"
                >
                  <option value="SUPPLIER">مورد (دفع)</option>
                  <option value="CUSTOMER">عميل (قبض)</option>
                </select>
              </div>

              <div className="md:col-span-4 flex items-center gap-2">
                <span className="font-bold whitespace-nowrap">{vPartyType === 'SUPPLIER' ? 'المورد' : 'العميل'}</span>
                <select value={vPartyId} onChange={(e) => setVPartyId(e.target.value)} className="flex-1 px-2 py-1.5 border border-slate-600 bg-white font-bold">
                  {vPartyOptions.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div className="md:col-span-2 flex items-center gap-1.5">
                <span className="font-bold whitespace-nowrap">الكود</span>
                <div className="flex-1 bg-white border border-slate-600 px-2 py-1.5 text-center font-mono-num font-bold">
                  {activeVoucherParty?.code || '-'}
                </div>
              </div>

              <div className="md:col-span-3 flex items-center gap-2">
                <span className="font-bold whitespace-nowrap">الرصيد</span>
                <div className="flex-1 bg-white border border-slate-600 px-2.5 py-1.5 text-center font-mono-num font-extrabold text-sm text-blue-950">
                  {formatMoney(activeVoucherParty?.current_balance || 0, currency)}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
              <div className="md:col-span-2 flex gap-1">
                <button
                  type="button"
                  onClick={() => setVKind('RECEIPT')}
                  className={`flex-1 py-1.5 font-bold rounded-xs border ${vKind === 'RECEIPT' ? 'bg-[#214283] text-white border-black' : 'win-btn'}`}
                >
                  قبض / دائن
                </button>
                <button
                  type="button"
                  onClick={() => setVKind('PAYMENT')}
                  className={`flex-1 py-1.5 font-bold rounded-xs border ${vKind === 'PAYMENT' ? 'bg-[#214283] text-white border-black' : 'win-btn'}`}
                >
                  صرف / مدين
                </button>
              </div>

              <div className="md:col-span-2 flex items-center gap-1.5">
                <span className="font-bold whitespace-nowrap">المدفوع</span>
                <input
                  required
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="0.00"
                  value={vAmount}
                  onChange={(e) => setVAmount(e.target.value)}
                  className="w-full px-2 py-1.5 border border-slate-600 bg-[#fffde6] font-mono-num font-bold text-center"
                />
              </div>

              <div className="md:col-span-2 flex items-center gap-1.5">
                <span className="font-bold whitespace-nowrap">التاريخ</span>
                <input type="date" value={vDate} onChange={(e) => setVDate(e.target.value)} className="w-full px-2 py-1.5 border border-slate-600 bg-white font-mono-num" />
              </div>

              <div className="md:col-span-2">
                <select value={vCashboxId} onChange={(e) => setVCashboxId(Number(e.target.value))} className="w-full px-2 py-1.5 border border-slate-600 bg-white font-semibold">
                  {defs.cashboxes.map((cb) => <option key={cb.id} value={cb.id}>{cb.name}</option>)}
                </select>
              </div>

              <div className="md:col-span-2">
                <input placeholder="البيان / ملاحظات" value={vNotes} onChange={(e) => setVNotes(e.target.value)} className="w-full px-2 py-1.5 border border-slate-600 bg-white" />
              </div>

              <div className="md:col-span-2">
                <button type="submit" className="win-btn w-full py-1.5 px-3 font-extrabold rounded-xs flex items-center justify-center gap-1">
                  <PlusCircle className="w-3.5 h-3.5 text-emerald-700" /> إدراج
                </button>
              </div>
            </div>
          </form>

          <div className="bg-white border border-slate-600 overflow-x-auto min-h-[260px]">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#214283] text-white">
                  <th className="py-2 px-3 border-l border-slate-500 text-right">التاريخ</th>
                  <th className="py-2 px-3 border-l border-slate-500 text-right">رقم السند</th>
                  <th className="py-2 px-3 border-l border-slate-500 text-right">الطرف</th>
                  <th className="py-2 px-3 border-l border-slate-500 text-right">النوع</th>
                  <th className="py-2 px-3 border-l border-slate-500 text-right">الخزينة</th>
                  <th className="py-2 px-3 border-l border-slate-500 text-center">المبلغ</th>
                  <th className="py-2 px-3 text-right">البيان</th>
                </tr>
              </thead>
              <tbody>
                {vouchersList.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-slate-400">لا توجد سندات مسجلة بعد</td>
                  </tr>
                ) : (
                  vouchersList.map((v) => (
                    <tr key={String(v.id)} className="border-b border-slate-300 hover:bg-slate-50">
                      <td className="py-1.5 px-3 border-l border-slate-300 font-mono-num">{String(v.voucher_date)}</td>
                      <td className="py-1.5 px-3 border-l border-slate-300 font-mono-num font-bold">{String(v.voucher_number)}</td>
                      <td className="py-1.5 px-3 border-l border-slate-300 font-bold">{String(v.party_name)}</td>
                      <td className="py-1.5 px-3 border-l border-slate-300">{v.kind === 'RECEIPT' ? 'سند قبض' : 'سند صرف'}</td>
                      <td className="py-1.5 px-3 border-l border-slate-300">{String(v.cashbox_name)}</td>
                      <td className="py-1.5 px-3 border-l border-slate-300 text-center font-mono-num font-extrabold">{formatMoney(Number(v.amount), currency)}</td>
                      <td className="py-1.5 px-3 text-slate-600">{String(v.notes || v.payment_method)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* STATEMENT TAB */}
      {tab === 'statement' && (
        <div className="p-4 space-y-3">
          <div className="no-print grid grid-cols-1 md:grid-cols-5 gap-2.5 bg-[#ece9d8] border border-slate-400 p-3 items-end">
            <div>
              <label className="block font-bold mb-1">نوع الحساب</label>
              <select
                value={partyType}
                onChange={(e) => {
                  const pt = e.target.value as 'CUSTOMER' | 'SUPPLIER';
                  setPartyType(pt);
                  const list = pt === 'CUSTOMER' ? defs?.customers.filter((c) => !c.is_walkin) : defs?.suppliers;
                  setPartyId(list?.[0]?.id ? String(list[0].id) : '');
                }}
                className="w-full px-2.5 py-1.5 border border-slate-600 bg-white"
              >
                <option value="CUSTOMER">عميل</option>
                <option value="SUPPLIER">مورد</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block font-bold mb-1">الحساب</label>
              <select value={partyId} onChange={(e) => setPartyId(e.target.value)} className="w-full px-2.5 py-1.5 border border-slate-600 bg-white font-bold">
                {partyOptions.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.current_balance.toFixed(2)})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-bold mb-1">من تاريخ</label>
              <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full px-2 py-1.5 border border-slate-600 font-mono-num bg-white" />
            </div>
            <div className="flex gap-1.5">
              <div className="flex-1">
                <label className="block font-bold mb-1">إلى تاريخ</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full px-2 py-1.5 border border-slate-600 font-mono-num bg-white" />
              </div>
              <button type="button" onClick={() => window.print()} className="win-btn px-3 py-1.5 self-end rounded-xs">
                <Printer className="w-4 h-4" />
              </button>
            </div>
          </div>

          {statement && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap justify-between items-center p-2.5 bg-white border border-slate-500">
                <div>
                  <span>كشف حساب {partyType === 'CUSTOMER' ? 'العميل' : 'المورد'}: </span>
                  <strong className="text-sm">{String(statement.party.name)}</strong>
                </div>
                <div className="font-mono-num">
                  الرصيد الحالي: <strong className="text-sm text-blue-900">{formatMoney(Number(statement.party.current_balance), currency)}</strong>
                </div>
              </div>

              <div className="bg-white border border-slate-600 overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-[#214283] text-white">
                      <th className="py-2 px-3 text-right">التاريخ</th>
                      <th className="py-2 px-3 text-right">النوع</th>
                      <th className="py-2 px-3 text-right">المرجع</th>
                      <th className="py-2 px-3 text-left">مدين</th>
                      <th className="py-2 px-3 text-left">دائن</th>
                      <th className="py-2 px-3 text-left">الرصيد بعد</th>
                      <th className="py-2 px-3 text-right">البيان</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.transactions.length === 0 ? (
                      <tr><td colSpan={7} className="py-8 text-center text-slate-500">لا توجد حركات مسجلة</td></tr>
                    ) : (
                      statement.transactions.map((t) => (
                        <tr key={String(t.id)} className="border-b border-slate-300">
                          <td className="py-1.5 px-3 font-mono-num">{String(t.tx_date)}</td>
                          <td className="py-1.5 px-3">{String(t.tx_type)}</td>
                          <td className="py-1.5 px-3 font-mono-num">{String(t.reference_number)}</td>
                          <td className="py-1.5 px-3 text-left font-mono-num text-red-700">{Number(t.debit) > 0 ? formatMoney(Number(t.debit), currency) : '-'}</td>
                          <td className="py-1.5 px-3 text-left font-mono-num text-emerald-700">{Number(t.credit) > 0 ? formatMoney(Number(t.credit), currency) : '-'}</td>
                          <td className="py-1.5 px-3 text-left font-mono-num font-bold">{formatMoney(Number(t.balance_after), currency)}</td>
                          <td className="py-1.5 px-3 text-slate-600">{String(t.notes)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* DEBT AGING TAB */}
      {tab === 'aging' && (
        <div className="p-4 space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="font-bold text-sm">تقرير أعمار الديون والمتأخرات</h3>
            <select value={partyType} onChange={(e) => setPartyType(e.target.value as 'CUSTOMER' | 'SUPPLIER')} className="px-3 py-1.5 border border-slate-600 bg-white font-bold">
              <option value="CUSTOMER">مديونية العملاء</option>
              <option value="SUPPLIER">مستحقات الموردين</option>
            </select>
          </div>
          <div className="bg-white border border-slate-600 overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-[#214283] text-white">
                  <th className="py-2 px-3 text-right">الاسم</th>
                  <th className="py-2 px-3 text-center">أيام التأخير</th>
                  <th className="py-2 px-3 text-left">0-30 يوم</th>
                  <th className="py-2 px-3 text-left">31-60 يوم</th>
                  <th className="py-2 px-3 text-left">61-90 يوم</th>
                  <th className="py-2 px-3 text-left">+90 يوم</th>
                  <th className="py-2 px-3 text-left">إجمالي الرصيد</th>
                </tr>
              </thead>
              <tbody>
                {agingList.map((a) => (
                  <tr key={String(a.id)} className="border-b border-slate-300">
                    <td className="py-1.5 px-3 font-bold">{String(a.name)}</td>
                    <td className="py-1.5 px-3 text-center font-mono-num">{String(a.days_outstanding)} يوم</td>
                    <td className="py-1.5 px-3 text-left font-mono-num">{formatMoney(Number(a.bucket_0_30), currency)}</td>
                    <td className="py-1.5 px-3 text-left font-mono-num">{formatMoney(Number(a.bucket_31_60), currency)}</td>
                    <td className="py-1.5 px-3 text-left font-mono-num">{formatMoney(Number(a.bucket_61_90), currency)}</td>
                    <td className="py-1.5 px-3 text-left font-mono-num text-red-700 font-bold">{formatMoney(Number(a.bucket_90_plus), currency)}</td>
                    <td className="py-1.5 px-3 text-left font-mono-num font-bold">{formatMoney(Number(a.current_balance), currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
