import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  MessageCircle,
  Phone,
  PlayCircle,
  Send,
  ShieldCheck,
  Store,
  X,
} from 'lucide-react';
import heroStoreImg from '../assets/images/hero_store_erp_1795562357807.jpg';
import warehouseOpsImg from '../assets/images/warehouse_inventory_ops_1795562358285.jpg';
import { ProgramExplainerVideo } from '../components/ProgramExplainerVideo.tsx';

interface LandingShowcaseViewProps {
  onEnterDemo: () => void;
}

const WHATSAPP_INTL = '201153672084';
const PHONE_DISPLAY = '01153672084';

function buildWhatsAppHref(message: string): string {
  return `https://wa.me/${WHATSAPP_INTL}?text=${encodeURIComponent(message)}`;
}

export const LandingShowcaseView: React.FC<LandingShowcaseViewProps> = ({ onEnterDemo }) => {
  const [heroImgError, setHeroImgError] = useState(false);
  const [warehouseImgError, setWarehouseImgError] = useState(false);

  // Activation / WhatsApp lead form
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [licensePlan, setLicensePlan] = useState<'ترخيص دائم (مدى الحياة)' | 'ترخيص سنوي' | 'تجربة مجانية أولاً'>('ترخيص دائم (مدى الحياة)');
  const [deviceFingerprint, setDeviceFingerprint] = useState('');
  const [notes, setNotes] = useState('');
  const [formError, setFormError] = useState('');
  const [readyWhatsAppUrl, setReadyWhatsAppUrl] = useState('');

  // Compact bottom-corner WhatsApp chat widget (closed by default, zero arrival popup)
  const [chatOpen, setChatOpen] = useState(false);
  const [quickChatText, setQuickChatText] = useState('مرحباً أستاذ اسامه، أريد الاستفسار عن تجربة وتفعيل برنامج Mina Net ERP');

  const handlePrepareWhatsAppRequest = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setReadyWhatsAppUrl('');

    const name = customerName.trim();
    const phone = customerPhone.trim();
    if (!name) {
      setFormError('يرجى إدخال اسم العميل أو اسم المحل / الشركة.');
      return;
    }
    if (!/^[0-9+\-\s]{8,20}$/.test(phone)) {
      setFormError('يرجى إدخال رقم هاتف صحيح للتواصل.');
      return;
    }

    const lines = [
      'مرحباً مبرمج اسامه جرجس، أريد طلب تفعيل برنامج Mina Net ERP:',
      `- الاسم / النشاط: ${name}`,
      `- رقم الهاتف: ${phone}`,
      `- الباقة المطلوبة: ${licensePlan}`,
    ];
    if (deviceFingerprint.trim()) {
      lines.push(`- بصمة الجهاز: ${deviceFingerprint.trim()}`);
    }
    if (notes.trim()) {
      lines.push(`- ملاحظات: ${notes.trim()}`);
    }

    const url = buildWhatsAppHref(lines.join('\n'));
    setReadyWhatsAppUrl(url);
    const link = document.createElement('a');
    link.href = url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.click();
  };

  const directWhatsAppUrl = buildWhatsAppHref(
    'مرحباً أستاذ اسامه جرجس، أتواصل معك لطلب تفعيل أو الاستفسار عن برنامج Mina Net ERP.'
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-900 font-sans">
      {/* Top Bar Contract: 3 clean zones separated by gap-8 */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a href="#top" className="text-xl font-extrabold tracking-tight text-[#1e3a8a] whitespace-nowrap shrink-0">
            Mina Net
          </a>

          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-slate-600">
            <a href="#capabilities" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              المميزات
            </a>
            <a href="#explainer-video" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              فيديو الشرح
            </a>
            <a href="#whatsapp-activation" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              طلب التفعيل
            </a>
            <a href="#faq" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              الأسئلة الشائعة
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onEnterDemo}
              className="px-4 py-2 text-xs sm:text-sm font-bold text-white bg-[#1e3a8a] hover:bg-[#172554] transition-colors rounded-lg whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <span>تجربة البرنامج مباشرة</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Hero Split Section */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 py-10 lg:py-16">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-stretch">
            <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
              <div className="text-xs font-semibold text-slate-500 flex flex-wrap items-center gap-2">
                <span>نظام حسابات ومخازن متكامل</span>
                <span aria-hidden="true">·</span>
                <span>تطوير: اسامه جرجس</span>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums font-mono-num" dir="ltr">{PHONE_DISPLAY}</span>
              </div>

              <h1
                className="font-display font-extrabold text-slate-900 leading-[1.2] tracking-tight"
                style={{ fontSize: 'clamp(2.1rem, 3.8vw, 3.35rem)', textWrap: 'balance' }}
              >
                جرّب نظام Mina Net للمبيعات والمخازن والحسابات مباشرة الآن
              </h1>

              <p className="text-base text-slate-600 leading-relaxed max-w-xl">
                صُمّم نظام Mina Net لإدارة المحلات التجارية والشركات والمخازن بفواتير مبيعات ومشتريات فورية، دعم كامل للباركود وطباعة A4 والإيصال الحراري 80mm، ومتابعة الخزينة وصافي الأرباح. تصفّح كافة شاشات النظام الآن مباشرة في المتصفح وتواصل معنا لطلب نسختك المفعّلة.
              </p>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <button
                  type="button"
                  onClick={onEnterDemo}
                  className="px-6 py-3.5 text-sm font-bold text-white bg-[#1e3a8a] hover:bg-[#172554] transition-colors rounded-lg whitespace-nowrap shrink-0 flex items-center gap-2"
                >
                  <span>تجربة البرنامج مباشرة الآن</span>
                  <ArrowLeft className="w-4 h-4" />
                </button>

                <a
                  href="#explainer-video"
                  className="px-5 py-3.5 text-sm font-bold text-slate-800 bg-white border border-slate-300 hover:border-slate-400 transition-colors rounded-lg whitespace-nowrap shrink-0 flex items-center gap-2"
                >
                  <PlayCircle className="w-4 h-4 text-[#1e3a8a]" />
                  <span>فيديو شرح البرنامج</span>
                </a>

                <a
                  href="#whatsapp-activation"
                  className="px-5 py-3.5 text-sm font-bold text-emerald-900 bg-white border border-emerald-700/40 hover:border-emerald-700 transition-colors rounded-lg whitespace-nowrap shrink-0 flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-700" />
                  <span>تواصل واتساب لطلب التفعيل</span>
                </a>
              </div>

              <div className="pt-2 border-t border-slate-200 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-600">
                <span>تجربة فورية بدون تحميل</span>
                <span aria-hidden="true">·</span>
                <span>متاح للعمل على Windows 7 / 8 / 10 / 11</span>
                <span aria-hidden="true">·</span>
                <a href={directWhatsAppUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-800 font-bold hover:underline">
                  محادثة المبرمج ({PHONE_DISPLAY})
                </a>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="h-full min-h-[280px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                {!heroImgError ? (
                  <img
                    src={heroStoreImg}
                    alt="نقطة بيع وإدارة مبيعات ومخازن ببرنامج Mina Net"
                    referrerPolicy="no-referrer"
                    onError={() => setHeroImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full min-h-[280px] flex flex-col items-center justify-center p-8 text-center bg-gradient-to-br from-slate-100 to-blue-50 text-slate-700">
                    <Store className="w-12 h-12 text-[#1e3a8a] mb-3" />
                    <div className="font-bold text-base">واجهة Mina Net لإدارة المبيعات والمخازن</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* 4-column outcome strip below Hero */}
          <div className="mt-10 grid grid-cols-2 lg:grid-cols-4 gap-4 border-t border-slate-200 pt-8">
            <div>
              <div className="text-2xl font-extrabold text-slate-900">تجربة فورية</div>
              <div className="text-xs text-slate-600 mt-1">تصفّح كل الشاشات مباشرة من المتصفح الآن</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-slate-900">ويندوز 7 – 11</div>
              <div className="text-xs text-slate-600 mt-1">دعم نواة 32 بت و 64 بت دون تعقيد</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-slate-900">أوفلاين 100%</div>
              <div className="text-xs text-slate-600 mt-1">يعمل على جهازك بقاعدة بيانات SQLite محلية</div>
            </div>
            <div>
              <div className="text-2xl font-extrabold text-slate-900">تحديث مباشر</div>
              <div className="text-xs text-slate-600 mt-1">استقبال التعديلات الجديدة من داخل الإعدادات</div>
            </div>
          </div>
        </section>

        {/* Capabilities Asymmetric Section */}
        <section id="capabilities" className="bg-white border-y border-slate-200 py-14">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-8">
            <div className="max-w-2xl">
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900">
                كل أدوات النشاط التجاري في شاشة واحدة منظمة
              </h2>
              <p className="text-sm text-slate-600 mt-2 leading-relaxed">
                بدايةً من تكويد الأصناف وطباعة الباركود وحتى تقارير صافي الربح وجرد المخازن، مع صلاحيات دقيقة للمدير والكاشير وأمين المخزن.
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-5 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-2">
                  <div className="text-sm font-extrabold text-[#1e3a8a]">01. فواتير البيع والشراء ونقطة البيع</div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    إصدار سريع لفواتير المبيعات والمشتريات والمرتجعات مع دعم الدفع النقدي والآجل، تعدد الوحدات، وأسعار الجملة والقطاعي.
                  </p>
                </div>

                <div className="p-5 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-2">
                  <div className="text-sm font-extrabold text-[#1e3a8a]">02. المخازن والجرد وتنبيهات النواقص</div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    مراقبة أرصدة المخازن المتعددة لحظياً، التحويل بين الفروع، كارت حركة الصنف التفصيلي، وتسوية فروق الجرد.
                  </p>
                </div>

                <div className="p-5 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-2">
                  <div className="text-sm font-extrabold text-[#1e3a8a]">03. العملاء والموردين والخزينة والأرباح</div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    كشوف حسابات العملاء والموردين، سندات القبض والصرف، حركة الخزائن والبنوك، ومراقبة الشيكات والأقساط.
                  </p>
                </div>

                <div className="p-5 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-2">
                  <div className="text-sm font-extrabold text-[#1e3a8a]">04. النسخ الاحتياطي وتحديثات البرنامج</div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    حفظ تلقائي يومي لقاعدة البيانات والاستيراد الذكي من إكسل، مع إمكانية تنزيل أي تحديثات برمجية من الإعدادات فوراً.
                  </p>
                </div>
              </div>

              <div className="lg:col-span-5">
                <div className="h-full min-h-[260px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                  {!warehouseImgError ? (
                    <img
                      src={warehouseOpsImg}
                      alt="إدارة المخازن والباركود ببرنامج Mina Net"
                      referrerPolicy="no-referrer"
                      onError={() => setWarehouseImgError(true)}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full min-h-[260px] flex flex-col items-center justify-center p-6 text-center bg-slate-100 text-slate-700">
                      <ShieldCheck className="w-10 h-10 text-[#1e3a8a] mb-2" />
                      <div className="font-bold text-sm">متابعة دقيقة للمخازن والباركود</div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>

        <ProgramExplainerVideo onEnterDemo={onEnterDemo} />

        {/* WhatsApp Activation & Programmer Contact Section */}
        <section id="whatsapp-activation" className="bg-white border-y border-slate-200 py-14">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <div className="lg:col-span-5 space-y-5">
              <div className="text-xs font-semibold text-emerald-800">تواصل مباشر مع مبرمج النظام</div>
              <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900">
                طلب تفعيل النسخة الكاملة عبر واتساب
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                بعد تجربة البرنامج والتأكد من ملاءمته لنشاطك، تواصل مباشرة مع المبرمج <strong>اسامه جرجس</strong> لاستخراج كود التفعيل الموقع رقمياً لجهازك والحصول على الدعم الفني والتعديلات المطلوبة.
              </p>

              <div className="p-5 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-3 text-sm">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-600">المبرمج ومطور النظام</span>
                  <strong className="text-slate-900">اسامه جرجس</strong>
                </div>
                <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-600">رقم الهاتف والواتساب</span>
                  <strong className="font-mono-num text-emerald-800 tabular-nums" dir="ltr">
                    {PHONE_DISPLAY}
                  </strong>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={directWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-2.5 px-4 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
                  >
                    <MessageCircle className="w-4 h-4" />
                    <span>محادثة واتساب مباشرة ({PHONE_DISPLAY})</span>
                  </a>
                  <a
                    href={`tel:${PHONE_DISPLAY}`}
                    className="py-2.5 px-4 text-xs font-bold text-slate-800 bg-white border border-slate-300 hover:border-slate-400 rounded-lg flex items-center justify-center gap-1.5 whitespace-nowrap"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>اتصال هاتفي</span>
                  </a>
                </div>
              </div>
            </div>

            <form
              onSubmit={handlePrepareWhatsAppRequest}
              className="lg:col-span-7 p-6 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-4 text-sm"
            >
              <div className="font-extrabold text-base text-slate-900">أرسل بيانات طلب التفعيل عبر واتساب</div>

              {formError && (
                <div className="p-3 text-xs font-bold bg-red-50 border border-red-300 text-red-900 rounded-lg">
                  {formError}
                </div>
              )}

              {readyWhatsAppUrl && (
                <div className="p-3 text-xs font-bold bg-emerald-50 border border-emerald-300 text-emerald-950 rounded-lg flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                    تم تجهيز طلب التفعيل — اضغط لإرسال الرسالة في واتساب:
                  </span>
                  <a
                    href={readyWhatsAppUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3 py-1.5 bg-emerald-700 text-white rounded-md hover:bg-emerald-800"
                  >
                    فتح واتساب الآن
                  </a>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">الاسم / اسم المحل أو الشركة *</label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="مثال: شركة النور للتجارة"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#1e3a8a]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">رقم الموبايل (واتساب) *</label>
                  <input
                    type="tel"
                    dir="ltr"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="01xxxxxxxxx"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono-num text-left focus:outline-none focus:border-[#1e3a8a]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">نوع التفعيل المطلوب</label>
                  <select
                    value={licensePlan}
                    onChange={(e) => setLicensePlan(e.target.value as typeof licensePlan)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#1e3a8a]"
                  >
                    <option value="ترخيص دائم (مدى الحياة)">ترخيص دائم (مدى الحياة)</option>
                    <option value="ترخيص سنوي">ترخيص سنوي</option>
                    <option value="تجربة مجانية أولاً">تجربة مجانية أولاً ثم التفعيل</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">بصمة الجهاز (إن وُجدت)</label>
                  <input
                    type="text"
                    dir="ltr"
                    value={deviceFingerprint}
                    onChange={(e) => setDeviceFingerprint(e.target.value)}
                    placeholder="MINA-XXXX-XXXX-..."
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg font-mono-num text-left focus:outline-none focus:border-[#1e3a8a]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">رسالتك أو تفاصيل نشاطك</label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="اذكر عدد الأجهزة أو أي استفسار أو طلب تعديل خاص..."
                  className="w-full p-3 text-xs bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#1e3a8a]"
                />
              </div>

              <button
                type="submit"
                className="w-full py-3 px-5 text-xs sm:text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center justify-center gap-2 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                <span>إرسال طلب التفعيل عبر واتساب إلى {PHONE_DISPLAY}</span>
              </button>
            </form>
          </div>
        </section>

        {/* Concise FAQ Section */}
        <section id="faq" className="max-w-6xl mx-auto px-4 sm:px-6 py-12 space-y-6">
          <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">أسئلة شائعة حول تجربة النظام وتفعيله</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1.5">
              <div className="font-bold text-sm text-slate-900">هل تشمل التجربة المباشرة جميع شاشات البرنامج؟</div>
              <p className="text-slate-600 leading-relaxed">
                نعم، عند الضغط على «تجربة البرنامج مباشرة» ستدخل فوراً إلى بيئة النظام الكاملة لتجربة فواتير البيع والشراء والمخازن والخزينة والتقارير دون الحاجة لتثبيت مسبق.
              </p>
            </div>
            <div className="p-5 bg-white border border-slate-200 rounded-xl space-y-1.5">
              <div className="font-bold text-sm text-slate-900">كيف أحصل على النسخة الكاملة وتفعيلها لنشاطي التجاري؟</div>
              <p className="text-slate-600 leading-relaxed">
                بعد تجربة البرنامج، تواصل مع المبرمج اسامه جرجس عبر واتساب على <span className="font-mono-num font-bold" dir="ltr">{PHONE_DISPLAY}</span> لتجهيز النسخة الخاصة بمجال عملك وإصدار التفعيل الرسمي والدعم المباشر.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Quiet Footer */}
      <footer className="border-t border-slate-200 bg-white py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-600">
          <div>
            <strong>Mina Net ERP</strong> · تطوير وبرمجة: اسامه جرجس ·{' '}
            <span className="font-mono-num tabular-nums" dir="ltr">{PHONE_DISPLAY}</span>
          </div>
          <div className="flex items-center gap-5">
            <button type="button" onClick={onEnterDemo} className="hover:text-slate-900 font-semibold">
              تجربة البرنامج مباشرة
            </button>
            <a href="#capabilities" className="hover:text-slate-900 font-semibold">
              المميزات
            </a>
            <a href={directWhatsAppUrl} target="_blank" rel="noopener noreferrer" className="text-emerald-800 font-bold hover:underline">
              واتساب التفعيل
            </a>
          </div>
        </div>
      </footer>

      {/* Compact WhatsApp Quick Chat Floating Widget (closed on arrival, <= 15% cap) */}
      <div className="fixed bottom-4 left-4 z-40">
        {chatOpen ? (
          <div className="w-80 max-w-[calc(100vw-2rem)] bg-white border border-slate-300 rounded-xl shadow-xl overflow-hidden text-xs">
            <div className="bg-emerald-800 text-white px-3.5 py-2.5 flex items-center justify-between">
              <div className="font-bold flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" />
                <span>محادثة واتساب — اسامه جرجس</span>
              </div>
              <button
                type="button"
                aria-label="إغلاق نافذة الدردشة"
                onClick={() => setChatOpen(false)}
                className="p-1 hover:bg-emerald-700 rounded"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-3.5 space-y-2.5 bg-[#f8fafc]">
              <p className="text-slate-700 leading-relaxed">
                اكتب رسالتك أو طلب التفعيل وسيتم فتح المحادثة مباشرة على واتساب رقم <strong className="font-mono-num" dir="ltr">{PHONE_DISPLAY}</strong>:
              </p>
              <textarea
                rows={3}
                value={quickChatText}
                onChange={(e) => setQuickChatText(e.target.value)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-emerald-700"
              />
              <a
                href={buildWhatsAppHref(quickChatText.trim() || 'مرحباً، أريد الاستفسار عن تفعيل برنامج Mina Net ERP')}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2 px-3 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg flex items-center justify-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>بدء المحادثة على واتساب</span>
              </a>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setChatOpen(true)}
            className="h-11 px-4 rounded-full bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-lg flex items-center gap-2 whitespace-nowrap"
          >
            <MessageCircle className="w-4 h-4 shrink-0" />
            <span>واتساب طلب التفعيل ({PHONE_DISPLAY})</span>
          </button>
        )}
      </div>
    </div>
  );
};
