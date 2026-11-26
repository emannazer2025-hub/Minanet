import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Maximize2,
  Minimize2,
  QrCode,
  ShoppingBag,
  Sparkles,
  CheckCircle2,
  Phone,
  Clock,
  Receipt,
} from 'lucide-react';
import { formatMoney, formatNum } from '../api.ts';
import type { CustomerDisplayState, PromoSlide } from '../types.ts';
import {
  getDefaultPromoSlides,
  readCustomerDisplayState,
  subscribeCustomerDisplayState,
} from '../utils/customerDisplaySync.ts';
import { generateQrDataUrl } from '../utils/posHardware.ts';

function createFallbackIdleState(): CustomerDisplayState {
  return {
    mode: 'IDLE',
    updatedAt: Date.now(),
    companyName: 'Mina Net',
    companyPhone: '01153672084',
    currency: 'ج.م.',
    cashierName: 'الكاشير',
    customerName: 'عميل نقدي',
    items: [],
    subtotal: 0,
    discount: 0,
    additions: 0,
    tax: 0,
    netTotal: 0,
    paidAmount: 0,
    remainingAmount: 0,
    changeAmount: 0,
    paymentType: 'CASH',
    welcomeText: 'أهلاً وسهلاً بكم — نتمنى لكم تسوقاً ممتعاً',
    tickerText: 'عروض وخصومات يومية مستمرة · اسأل الكاشير عن عروض اليوم',
    qrEnabled: true,
    qrLabel: 'امسح الكود للدفع عبر إنستاباي أو تقييم الخدمة',
    qrValue: 'https://wa.me/201153672084',
    slides: [],
  };
}

export const CustomerDisplayView: React.FC = () => {
  const [state, setState] = useState<CustomerDisplayState>(() => readCustomerDisplayState() || createFallbackIdleState());
  const [slideIdx, setSlideIdx] = useState(0);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [nowClock, setNowClock] = useState(() => new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
  const itemsEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = `${state.companyName || 'Mina Net'} — شاشة العميل`;
  }, [state.companyName]);

  useEffect(() => {
    const unsub = subscribeCustomerDisplayState((next) => {
      setState(next);
    });
    const clockTimer = window.setInterval(() => {
      setNowClock(new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }));
    }, 15_000);
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    // Try automatic fullscreen (browsers may allow if opened with user gesture on 2nd display)
    try {
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) {
        void document.documentElement.requestFullscreen().catch(() => {});
      }
    } catch {
      // ignore
    }
    return () => {
      unsub();
      window.clearInterval(clockTimer);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, []);

  const slides: PromoSlide[] = useMemo(() => {
    if (state.slides && state.slides.length > 0) return state.slides;
    return getDefaultPromoSlides(state.companyName);
  }, [state.slides, state.companyName]);

  useEffect(() => {
    if (slides.length <= 1) return;
    const t = window.setInterval(() => {
      setSlideIdx((i) => (i + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(t);
  }, [slides.length]);

  useEffect(() => {
    if (state.qrEnabled === false || !state.qrValue) {
      setQrDataUrl('');
      return;
    }
    let alive = true;
    void generateQrDataUrl(state.qrValue, 220).then((url) => {
      if (alive) setQrDataUrl(url);
    });
    return () => {
      alive = false;
    };
  }, [state.qrEnabled, state.qrValue]);

  useEffect(() => {
    itemsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.items.length, state.lastAddedIndex]);

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore fullscreen gesture errors
    }
  };

  const activeSlide = slides[slideIdx % slides.length];
  const currency = state.currency || 'ج.م.';
  const isIdle = state.mode === 'IDLE' || (state.items.length === 0 && state.mode !== 'PAID');
  const lastIndex = typeof state.lastAddedIndex === 'number' ? state.lastAddedIndex : state.items.length - 1;

  return (
    <div dir="rtl" className="min-h-screen bg-[#071928] text-white flex flex-col overflow-hidden select-none">
      {/* Top Sleek Header Bar */}
      <header className="h-16 bg-[#0b2740] border-b border-white/10 px-6 flex items-center justify-between shrink-0 shadow-lg">
        <div className="flex items-center gap-3.5">
          {state.companyLogo ? (
            <img
              src={state.companyLogo}
              alt={state.companyName}
              className="w-11 h-11 rounded-xl object-contain bg-white p-1 border border-white/20 shadow-sm"
            />
          ) : (
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 flex items-center justify-center font-display font-black text-lg text-white shadow-md">
              MN
            </div>
          )}
          <div>
            <h1 className="font-display font-extrabold text-xl tracking-tight text-white leading-tight">
              {state.companyName || 'Mina Net'}
            </h1>
            <div className="text-xs text-teal-300 flex items-center gap-3">
              {state.companyPhone && (
                <span className="inline-flex items-center gap-1 font-mono-num" dir="ltr">
                  <Phone className="w-3 h-3" /> {state.companyPhone}
                </span>
              )}
              <span>الكاشير: {state.cashierName}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {!isIdle && (
            <div className="hidden sm:flex items-center gap-2 bg-white/10 border border-white/15 rounded-xl px-4 py-1.5 text-sm">
              <span className="text-slate-300">العميل:</span>
              <span className="font-bold text-emerald-300">{state.customerName || 'عميل نقدي'}</span>
            </div>
          )}
          <div className="flex items-center gap-2 bg-white/10 border border-white/15 rounded-xl px-3.5 py-1.5 font-mono-num text-sm font-bold text-sky-200">
            <Clock className="w-4 h-4 text-teal-300" />
            <span>{nowClock}</span>
          </div>
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            className="p-2.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-white transition-colors"
            title={isFullscreen ? 'إنهاء ملء الشاشة' : 'عرض بملء الشاشة'}
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </header>

      {/* Main Split Body */}
      <main className="flex-1 p-5 grid grid-cols-1 lg:grid-cols-12 gap-5 overflow-hidden">
        {/* RIGHT HALF: Live Invoice or Idle Welcome Banner */}
        <section className="lg:col-span-7 flex flex-col bg-white text-slate-900 rounded-2xl shadow-2xl border border-white/20 overflow-hidden">
          {isIdle ? (
            <div className="flex-1 flex flex-col items-center justify-center p-10 text-center bg-gradient-to-br from-slate-50 via-sky-50 to-teal-50">
              {state.companyLogo ? (
                <img
                  src={state.companyLogo}
                  alt={state.companyName}
                  className="w-32 h-32 object-contain rounded-2xl bg-white p-3 shadow-lg border border-slate-200 mb-6"
                />
              ) : (
                <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-[#0f3d5e] to-teal-600 text-white flex items-center justify-center font-display font-black text-3xl shadow-xl mb-6">
                  MN
                </div>
              )}
              <h2 className="font-display font-extrabold text-3xl sm:text-4xl text-[#0f3d5e] mb-3">
                {state.welcomeText || 'أهلاً وسهلاً بكم'}
              </h2>
              <p className="text-slate-600 text-lg max-w-xl leading-relaxed">
                بمجرد بدء مسح الأصناف عند الكاشير ستظهر تفاصيل فاتورتك كاملة والأسعار والخصومات هنا لحظة بلحظة.
              </p>
              <div className="mt-8 inline-flex items-center gap-2.5 px-5 py-2.5 rounded-xl bg-teal-600 text-white font-bold text-sm shadow-md">
                <Sparkles className="w-4 h-4" />
                <span>جاهز لاستقبال فاتورتك التالية</span>
              </div>
            </div>
          ) : (
            <>
              {/* Invoice Header */}
              <div className="bg-slate-100 border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-[#0f3d5e] text-white flex items-center justify-center">
                    <Receipt className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="font-display font-extrabold text-base text-[#0f3d5e]">
                      {state.mode === 'PAID' ? `فاتورة معتمدة ${state.invoiceNumber ? `#${state.invoiceNumber}` : ''}` : 'فاتورتك الحالية'}
                    </div>
                    <div className="text-xs text-slate-500 font-semibold">
                      عدد البنود: {state.items.length} · إجمالي القطع: {formatNum(state.items.reduce((s, i) => s + i.quantity, 0))}
                    </div>
                  </div>
                </div>
                <div className="text-left">
                  <span className="inline-block px-3 py-1 rounded-lg bg-sky-100 text-[#0f3d5e] font-bold text-xs border border-sky-200">
                    {state.paymentType === 'CASH' ? 'دفع نقدي' : state.paymentType === 'VISA' ? 'بطاقة / فيزا' : 'آجل'}
                  </span>
                </div>
              </div>

              {/* Scrollable Live Cart Items */}
              <div className="flex-1 overflow-y-auto px-4 py-2">
                <table className="w-full text-right border-collapse">
                  <thead className="sticky top-0 bg-white border-b-2 border-slate-200 text-xs font-bold text-slate-500">
                    <tr>
                      <th className="py-2.5 px-2">#</th>
                      <th className="py-2.5 px-2">الصنف</th>
                      <th className="py-2.5 px-2 text-center">الكمية</th>
                      <th className="py-2.5 px-2 text-center">السعر</th>
                      <th className="py-2.5 px-2 text-left">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-sm">
                    {state.items.map((item, idx) => {
                      const isLatest = idx === lastIndex && state.mode === 'CART';
                      return (
                        <tr
                          key={`${item.name}-${idx}`}
                          className={`transition-colors ${
                            isLatest ? 'bg-emerald-50/90 ring-1 ring-inset ring-emerald-300' : 'hover:bg-slate-50'
                          }`}
                        >
                          <td className="py-3 px-2 font-mono-num text-xs text-slate-400">{idx + 1}</td>
                          <td className="py-3 px-2">
                            <div className="font-bold text-slate-900 text-base flex items-center gap-2">
                              <span>{item.name}</span>
                              {item.isBonus && (
                                <span className="px-2 py-0.5 text-[10px] rounded bg-red-100 text-red-700 font-bold">بونص</span>
                              )}
                              {isLatest && (
                                <span className="px-2 py-0.5 text-[10px] rounded bg-emerald-600 text-white font-bold">الآن</span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500">
                              {item.unitName}
                              {item.discountValue > 0 && (
                                <span className="text-red-600 mr-2 font-semibold">
                                  (خصم: {formatMoney(item.discountValue, currency)})
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center font-mono-num font-extrabold text-base text-[#0f3d5e]">
                            {formatNum(item.quantity)}
                          </td>
                          <td className="py-3 px-2 text-center font-mono-num text-slate-700">
                            {Number(item.unitPrice).toFixed(2)}
                          </td>
                          <td className="py-3 px-2 text-left font-mono-num font-extrabold text-base text-slate-900">
                            {formatMoney(item.lineTotal, currency)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div ref={itemsEndRef} />
              </div>

              {/* Totals Footer */}
              <div className="bg-slate-50 border-t-2 border-slate-200 px-6 py-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-4 text-sm text-slate-600 font-semibold">
                  <span>المجموع قبل الخصم: <strong className="font-mono-num text-slate-900">{formatMoney(state.subtotal, currency)}</strong></span>
                  {state.discount > 0 && (
                    <span className="text-red-700">الخصومات: <strong className="font-mono-num">- {formatMoney(state.discount, currency)}</strong></span>
                  )}
                  {state.tax > 0 && (
                    <span>الضريبة: <strong className="font-mono-num">+ {formatMoney(state.tax, currency)}</strong></span>
                  )}
                </div>
                <div className="flex items-center justify-between pt-2 border-t border-slate-200">
                  <span className="font-display font-extrabold text-xl text-[#0f3d5e]">الإجمالي المستحق</span>
                  <span className="font-mono-num font-black text-4xl text-emerald-700">
                    {formatMoney(state.netTotal, currency)}
                  </span>
                </div>
              </div>
            </>
          )}
        </section>

        {/* LEFT HALF: Payment Summary (when PAID) + Offers Carousel + QR Code */}
        <section className="lg:col-span-5 flex flex-col gap-5 overflow-hidden">
          {state.mode === 'PAID' && (
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 shadow-2xl border border-emerald-400/40 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 text-white">
                  <CheckCircle2 className="w-7 h-7 text-emerald-200" />
                  <h3 className="font-display font-extrabold text-2xl">تم السداد بنجاح</h3>
                </div>
                {state.invoiceNumber && (
                  <span className="px-3 py-1 rounded-lg bg-black/20 font-mono-num text-sm font-bold">
                    #{state.invoiceNumber}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-3">
                <div className="bg-white/15 backdrop-blur-xs rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-emerald-100 font-bold text-base">الإجمالي المطلوب</span>
                  <span className="font-mono-num font-black text-3xl text-white">
                    {formatMoney(state.netTotal, currency)}
                  </span>
                </div>
                <div className="bg-white/15 backdrop-blur-xs rounded-xl px-4 py-3 flex items-center justify-between">
                  <span className="text-emerald-100 font-bold text-base">المبلغ المدفوع</span>
                  <span className="font-mono-num font-black text-3xl text-white">
                    {formatMoney(state.paidAmount, currency)}
                  </span>
                </div>
                <div className="bg-white text-[#0f3d5e] rounded-xl px-4 py-3.5 flex items-center justify-between shadow-lg">
                  <span className="font-display font-extrabold text-xl">الباقي للعميل</span>
                  <span className="font-mono-num font-black text-4xl text-emerald-700">
                    {formatMoney(state.changeAmount, currency)}
                  </span>
                </div>
              </div>
              <div className="text-center text-sm font-bold text-emerald-100">
                شكراً لزيارتكم — نرحب بكم دائماً
              </div>
            </div>
          )}

          {/* Promo / Offers Carousel */}
          <div className="flex-1 min-h-[220px] bg-gradient-to-br from-[#0e324f] to-[#082034] rounded-2xl border border-white/15 shadow-2xl overflow-hidden flex flex-col">
            <div className="relative flex-1 flex items-center justify-center overflow-hidden">
              {activeSlide?.mediaUrl ? (
                activeSlide.mediaType === 'video' ? (
                  <video
                    key={activeSlide.mediaUrl}
                    src={activeSlide.mediaUrl}
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <img
                    src={activeSlide.mediaUrl}
                    alt={activeSlide.title}
                    className="w-full h-full object-cover"
                  />
                )
              ) : (
                <div className="p-8 text-center space-y-3">
                  <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-lg bg-teal-500/20 border border-teal-400/40 text-teal-200 text-xs font-bold">
                    <ShoppingBag className="w-4 h-4" />
                    <span>{activeSlide?.badge || 'عروض وخصومات'}</span>
                  </div>
                  <h3 className="font-display font-extrabold text-2xl sm:text-3xl text-white leading-snug">
                    {activeSlide?.title}
                  </h3>
                  {activeSlide?.subtitle && (
                    <p className="text-sky-200 text-sm sm:text-base max-w-md mx-auto">
                      {activeSlide.subtitle}
                    </p>
                  )}
                </div>
              )}

              {activeSlide?.mediaUrl && activeSlide.title && (
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4">
                  {activeSlide.badge && (
                    <span className="inline-block px-2.5 py-0.5 rounded bg-emerald-500 text-white text-[11px] font-bold mb-1">
                      {activeSlide.badge}
                    </span>
                  )}
                  <div className="font-display font-bold text-lg text-white">{activeSlide.title}</div>
                  {activeSlide.subtitle && <div className="text-xs text-slate-200">{activeSlide.subtitle}</div>}
                </div>
              )}
            </div>

            {slides.length > 1 && (
              <div className="px-4 py-2 bg-black/25 flex items-center justify-center gap-2">
                {slides.map((s, i) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSlideIdx(i)}
                    className={`h-2 rounded-full transition-all ${
                      i === slideIdx % slides.length ? 'w-7 bg-teal-400' : 'w-2 bg-white/30'
                    }`}
                    aria-label={s.title}
                  />
                ))}
              </div>
            )}
          </div>

          {/* QR Code Card (InstaPay / Wallets / Rating) */}
          {state.qrEnabled !== false && qrDataUrl && (
            <div className="bg-white text-slate-900 rounded-2xl p-4 shadow-2xl border border-white/20 flex items-center gap-4">
              <img
                src={qrDataUrl}
                alt="QR Code"
                className="w-28 h-28 rounded-xl border border-slate-200 p-1 bg-white shrink-0"
              />
              <div className="space-y-1.5">
                <div className="inline-flex items-center gap-1.5 text-xs font-extrabold text-[#0f3d5e] bg-sky-50 border border-sky-200 px-2.5 py-1 rounded-lg">
                  <QrCode className="w-3.5 h-3.5 text-teal-600" />
                  <span>دفع إلكتروني / تقييم سريع</span>
                </div>
                <div className="font-display font-bold text-base text-slate-900 leading-snug">
                  {state.qrLabel || 'امسح الكود للدفع عبر إنستاباي أو المحافظ الإلكترونية'}
                </div>
                <div className="text-xs text-slate-500 font-mono-num truncate max-w-[230px]" dir="ltr">
                  {state.qrValue}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>

      {/* Bottom Ticker */}
      {state.tickerText && (
        <footer className="h-10 bg-[#04101b] border-t border-white/10 px-6 flex items-center justify-between text-xs text-teal-200 shrink-0">
          <span className="font-semibold truncate">{state.tickerText}</span>
          <span className="text-slate-400 font-semibold whitespace-nowrap">Mina Net Smart POS Display</span>
        </footer>
      )}
    </div>
  );
};
