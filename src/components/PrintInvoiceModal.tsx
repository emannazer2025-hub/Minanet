import React, { useEffect, useState } from 'react';
import { Printer, X, FileText, Receipt } from 'lucide-react';
import { formatMoney, formatNum } from '../api.ts';
import { generateQrDataUrl } from '../utils/posHardware.ts';

interface PrintableLine {
  product_code?: string;
  product_name: string;
  unit_name: string;
  quantity: number;
  unit_price: number;
  discount_value?: number;
  line_total: number;
}

interface PrintInvoiceModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  invoiceNumber: string;
  invoiceDate: string;
  partyLabel: string;
  partyName: string;
  partyPhone?: string;
  warehouseName: string;
  paymentType: string;
  cashierName: string;
  subtotal: number;
  discount: number;
  additions?: number;
  tax?: number;
  netTotal: number;
  paidAmount: number;
  remainingAmount: number;
  notes?: string;
  items: PrintableLine[];
  settings: Record<string, string>;
  autoPrint?: boolean;
}

type PrintFormat = 'A4' | '80MM' | '58MM';

export const PrintInvoiceModal: React.FC<PrintInvoiceModalProps> = ({
  open,
  onClose,
  title,
  invoiceNumber,
  invoiceDate,
  partyLabel,
  partyName,
  partyPhone,
  warehouseName,
  paymentType,
  cashierName,
  subtotal,
  discount,
  additions = 0,
  tax = 0,
  netTotal,
  paidAmount,
  remainingAmount,
  notes,
  items,
  settings,
  autoPrint = false,
}) => {
  const resolveDefaultFormat = (): PrintFormat => {
    if (settings.default_print_format === '80MM') return '80MM';
    if (settings.default_print_format === '58MM') return '58MM';
    return 'A4';
  };

  const [format, setFormat] = useState<PrintFormat>(resolveDefaultFormat);
  const [qrUrl, setQrUrl] = useState('');
  const currency = settings.currency || 'ج.م.';
  const isThermal = format === '80MM' || format === '58MM';

  useEffect(() => {
    setFormat(resolveDefaultFormat());
  }, [settings.default_print_format, open]);

  useEffect(() => {
    if (!open) return;
    const qrVal =
      settings.customer_display_qr_value?.trim() ||
      `${settings.company_name || 'Mina Net'} | #${invoiceNumber} | ${netTotal.toFixed(2)} ${currency}`;
    if (settings.customer_display_qr_enabled !== '0' && qrVal) {
      void generateQrDataUrl(qrVal, 140).then(setQrUrl);
    } else {
      setQrUrl('');
    }
  }, [open, invoiceNumber, netTotal, currency, settings.customer_display_qr_value, settings.customer_display_qr_enabled, settings.company_name]);

  useEffect(() => {
    if (open && autoPrint) {
      const t = window.setTimeout(() => {
        window.print();
      }, 280);
      return () => window.clearTimeout(t);
    }
  }, [open, autoPrint]);

  if (!open) return null;

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 overflow-y-auto">
      <div className="bg-white border border-slate-200 rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh]">
        <div className="no-print flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-slate-200">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-bold text-slate-900">معاينة وطباعة المستند</h3>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setFormat('A4')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md whitespace-nowrap transition-colors ${
                  format === 'A4' ? 'bg-white text-[#0f3d5e] shadow-xs' : 'text-slate-600'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                طباعة A4
              </button>
              <button
                type="button"
                onClick={() => setFormat('80MM')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md whitespace-nowrap transition-colors ${
                  format === '80MM' ? 'bg-white text-[#0f3d5e] shadow-xs' : 'text-slate-600'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                حراري 80mm
              </button>
              <button
                type="button"
                onClick={() => setFormat('58MM')}
                className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-md whitespace-nowrap transition-colors ${
                  format === '58MM' ? 'bg-white text-[#0f3d5e] shadow-xs' : 'text-slate-600'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                حراري 58mm
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-2 px-4 py-2 bg-[#0f3d5e] hover:bg-[#0b2d47] text-white text-sm font-bold rounded-lg whitespace-nowrap"
            >
              <Printer className="w-4 h-4" />
              طباعة الآن
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-500 hover:text-slate-800 rounded-lg"
              aria-label="إغلاق"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-6 bg-slate-100 flex justify-center">
          <div
            className={`bg-white text-slate-900 border border-slate-300 shadow-sm ${
              format === '58MM'
                ? 'print-58mm w-[225px] p-2.5 text-[10px]'
                : format === '80MM'
                ? 'print-80mm w-[310px] p-3.5 text-xs'
                : 'print-a4 w-full max-w-[794px] p-8 text-sm'
            }`}
          >
            {/* Header */}
            <div
              className={`border-b border-slate-300 pb-3 mb-3 ${
                isThermal ? 'text-center' : 'flex items-start justify-between'
              }`}
            >
              <div className={isThermal ? 'flex flex-col items-center' : 'flex items-start gap-3'}>
                {settings.company_logo && (
                  <img
                    src={settings.company_logo}
                    alt={settings.company_name || 'Logo'}
                    className={`${isThermal ? 'w-14 h-14 mb-1.5' : 'w-16 h-16'} object-contain`}
                  />
                )}
                <div>
                  <h1 className={`font-bold text-slate-900 ${format === '58MM' ? 'text-sm' : format === '80MM' ? 'text-base' : 'text-xl'}`}>
                    {settings.company_name || 'Mina Net'}
                  </h1>
                  {settings.company_subtitle && (
                    <p className="text-slate-600 text-[11px] mt-0.5">{settings.company_subtitle}</p>
                  )}
                  <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
                    {settings.company_address && <div>{settings.company_address}</div>}
                    {settings.company_phone && (
                      <div>
                        هاتف: <span className="font-mono-num">{settings.company_phone}</span>
                      </div>
                    )}
                    {settings.company_tax_no && (
                      <div>
                        الرقم الضريبي: <span className="font-mono-num">{settings.company_tax_no}</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
              <div className={isThermal ? 'mt-2.5 pt-2 border-t border-dashed border-slate-300' : 'text-left'}>
                <div className="text-sm font-bold text-[#0f3d5e]">{title}</div>
                <div className="font-mono-num font-bold mt-0.5">#{invoiceNumber}</div>
                <div className="text-[11px] text-slate-600 font-mono-num mt-0.5">{invoiceDate}</div>
              </div>
            </div>

            {/* Party Info */}
            <div className={`grid ${isThermal ? 'grid-cols-1 gap-1' : 'grid-cols-2 gap-3'} mb-3 text-[11px] bg-slate-50 p-2.5 border border-slate-200`}>
              <div>
                <span className="text-slate-500">{partyLabel}: </span>
                <span className="font-semibold">{partyName}</span>
                {partyPhone && <span className="text-slate-500 mr-1.5 font-mono-num">({partyPhone})</span>}
              </div>
              <div>
                <span className="text-slate-500">المخزن: </span>
                <span className="font-semibold">{warehouseName}</span>
              </div>
              <div>
                <span className="text-slate-500">الدفع: </span>
                <span className="font-semibold">
                  {paymentType === 'CASH' ? 'نقدي' : paymentType === 'CREDIT' ? 'آجل' : paymentType === 'VISA' ? 'فيزا / شبكة' : paymentType}
                </span>
              </div>
              <div>
                <span className="text-slate-500">الكاشير: </span>
                <span className="font-semibold">{cashierName}</span>
              </div>
            </div>

            {/* Table */}
            <table className="w-full border-collapse mb-3">
              <thead>
                <tr className="border-y border-slate-400 bg-slate-100 text-slate-800">
                  {!isThermal && <th className="py-1.5 px-1.5 text-right font-semibold">#</th>}
                  <th className="py-1.5 px-1 text-right font-semibold">الصنف</th>
                  {format === 'A4' && <th className="py-1.5 px-1.5 text-right font-semibold">الوحدة</th>}
                  <th className="py-1.5 px-1 text-center font-semibold">ك</th>
                  <th className="py-1.5 px-1 text-left font-semibold">سعر</th>
                  <th className="py-1.5 px-1 text-left font-semibold">إجمالي</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it, i) => (
                  <tr key={i} className="border-b border-slate-200">
                    {!isThermal && <td className="py-1.5 px-1.5 font-mono-num">{i + 1}</td>}
                    <td className="py-1 px-1">
                      <div className="font-semibold">{it.product_name}</div>
                      {it.product_code && format === 'A4' && (
                        <div className="text-[11px] text-slate-500 font-mono-num">{it.product_code}</div>
                      )}
                    </td>
                    {format === 'A4' && <td className="py-1.5 px-1.5">{it.unit_name}</td>}
                    <td className="py-1 px-1 text-center font-mono-num">{formatNum(it.quantity)}</td>
                    <td className="py-1 px-1 text-left font-mono-num">{Number(it.unit_price).toFixed(2)}</td>
                    <td className="py-1 px-1 text-left font-mono-num font-bold">{Number(it.line_total).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className={`${isThermal ? 'w-full' : 'w-72 mr-auto'} space-y-1 border-t border-slate-300 pt-2.5 text-[11px]`}>
              <div className="flex justify-between">
                <span className="text-slate-600">الإجمالي قبل الخصم:</span>
                <span className="font-mono-num">{formatMoney(subtotal, currency)}</span>
              </div>
              {discount > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">الخصومات:</span>
                  <span className="font-mono-num text-red-700">- {formatMoney(discount, currency)}</span>
                </div>
              )}
              {additions > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">إضافات / مصروفات:</span>
                  <span className="font-mono-num">+ {formatMoney(additions, currency)}</span>
                </div>
              )}
              {tax > 0 && (
                <div className="flex justify-between">
                  <span className="text-slate-600">الضريبة:</span>
                  <span className="font-mono-num">+ {formatMoney(tax, currency)}</span>
                </div>
              )}
              <div className="flex justify-between text-xs font-bold border-y border-slate-400 py-1.5 bg-slate-50 px-1.5">
                <span>الصافي المستحق:</span>
                <span className="font-mono-num">{formatMoney(netTotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">المدفوع:</span>
                <span className="font-mono-num font-semibold">{formatMoney(paidAmount, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">المتبقي:</span>
                <span className="font-mono-num font-semibold">{formatMoney(remainingAmount, currency)}</span>
              </div>
            </div>

            {notes && (
              <div className="mt-3 pt-2 border-t border-dashed border-slate-300 text-[11px] text-slate-600">
                <span className="font-semibold">ملاحظات: </span>
                {notes}
              </div>
            )}

            {qrUrl && (
              <div className="mt-3 pt-2 border-t border-dashed border-slate-300 flex flex-col items-center gap-1 text-center">
                <img src={qrUrl} alt="QR" className={isThermal ? 'w-20 h-20' : 'w-24 h-24'} />
                {settings.customer_display_qr_label && (
                  <div className="text-[10px] text-slate-600">{settings.customer_display_qr_label}</div>
                )}
              </div>
            )}

            <div className="mt-4 pt-2.5 border-t border-slate-200 text-center text-[10px] text-slate-500">
              شكرًا لتعاملكم معنا · {settings.company_name || 'Mina Net'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
