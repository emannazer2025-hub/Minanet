import React, { useState } from 'react';
import {
  ArrowLeft,
  FileCode2,
  FolderArchive,
  HardDriveDownload,
  MessageCircle,
  Phone,
  ShieldCheck,
} from 'lucide-react';
import warehouseOpsImg from '../assets/images/warehouse_inventory_ops_1795562358285.jpg';

interface DownloadPortalViewProps {
  onOpenLiveDemo: () => void;
}

const WHATSAPP_INTL = '201153672084';
const PHONE_DISPLAY = '01153672084';

function buildWhatsAppHref(message: string): string {
  return `https://wa.me/${WHATSAPP_INTL}?text=${encodeURIComponent(message)}`;
}

export const DownloadPortalView: React.FC<DownloadPortalViewProps> = ({ onOpenLiveDemo }) => {
  const [imgError, setImgError] = useState(false);

  const directWhatsAppUrl = buildWhatsAppHref(
    'مرحباً أستاذ اسامه جرجس، قمت بتحميل برنامج Mina Net ERP وأريد طلب التفعيل أو الدعم الفني.'
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
            <a href="#packages" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              ملفات التحميل
            </a>
            <a href="#steps" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              خطوات التثبيت
            </a>
            <a href="#activation" className="hover:text-slate-900 hover:underline underline-offset-4 whitespace-nowrap shrink-0">
              تواصل واتساب
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={onOpenLiveDemo}
              className="px-4 py-2 text-xs sm:text-sm font-bold text-white bg-[#1e3a8a] hover:bg-[#172554] transition-colors rounded-lg whitespace-nowrap shrink-0 flex items-center gap-1.5"
            >
              <span>تجربة البرنامج أونلاين</span>
              <ArrowLeft className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        {/* Header / Intro Section */}
        <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-10 pb-8 space-y-5">
          <div className="text-xs font-semibold text-slate-500 flex flex-wrap items-center gap-2">
            <span>مركز التحميل الرسمي</span>
            <span aria-hidden="true">·</span>
            <span>تطوير: اسامه جرجس</span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums font-mono-num" dir="ltr">{PHONE_DISPLAY}</span>
          </div>

          <h1
            className="font-display font-extrabold text-slate-900 leading-[1.2] tracking-tight max-w-3xl"
            style={{ fontSize: 'clamp(1.95rem, 3.4vw, 3rem)', textWrap: 'balance' }}
          >
            تحميل برنامج Mina Net ERP للكمبيوتر والتشغيل أوفلاين
          </h1>

          <p className="text-sm sm:text-base text-slate-600 leading-relaxed max-w-2xl">
            اختر الصيغة المناسبة لجهازك لتثبيت النظام والعمل عليه دون اتصال بالإنترنت بقاعدة بيانات SQLite محلية آمنة. متوافق مع Windows 7 و 8 و 10 و 11 (نواة 32 بت و 64 بت) مع 30 يوماً تجربة مجانية.
          </p>

          <div className="pt-2 border-t border-slate-200 grid grid-cols-2 md:grid-cols-4 gap-4 text-xs">
            <div>
              <div className="font-extrabold text-base text-slate-900">Windows 7 – 11</div>
              <div className="text-slate-600 mt-0.5">دعم كامل لأنظمة 32 بت و 64 بت</div>
            </div>
            <div>
              <div className="font-extrabold text-base text-slate-900">قاعدة بيانات محلية</div>
              <div className="text-slate-600 mt-0.5">يعمل أوفلاين بسرعة واستقرار تام</div>
            </div>
            <div>
              <div className="font-extrabold text-base text-slate-900 tabular-nums">30 يوماً</div>
              <div className="text-slate-600 mt-0.5">فترة تجريبية مجانية بكل الصلاحيات</div>
            </div>
            <div>
              <div className="font-extrabold text-base text-slate-900">تحديثات متصلة</div>
              <div className="text-slate-600 mt-0.5">استلام الإضافات الجديدة من الإعدادات</div>
            </div>
          </div>
        </section>

        {/* Independent Download Packages Grid */}
        <section id="packages" className="max-w-6xl mx-auto px-4 sm:px-6 pb-14">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="p-6 bg-white border border-slate-300 rounded-xl flex flex-col justify-between space-y-6">
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-[#1e3a8a]">موصى به لأجهزة المحلات والشركات</div>
                <h2 className="text-lg font-extrabold text-slate-900">ملف التثبيت الكامل (Setup .exe)</h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  مثبّت تلقائي ينشئ اختصاراً على سطح المكتب وقائمة ابدأ ويفعل الخادم المحلي وقاعدة البيانات بشكل آمن على ويندوز 7 وحتى ويندوز 11.
                </p>
                <div className="pt-1 text-[11px] font-mono-num text-slate-500" dir="ltr">
                  MINA_NET_SETUP.exe · Windows x86 / x64
                </div>
              </div>
              <a
                href="/api/desktop/download-setup-exe"
                download="MINA_NET_SETUP.exe"
                className="w-full py-3 px-4 text-xs font-bold text-white bg-[#1e3a8a] hover:bg-[#172554] transition-colors rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <HardDriveDownload className="w-4 h-4 shrink-0" />
                <span>تحميل ملف التثبيت (Setup .exe)</span>
              </a>
            </div>

            <div className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col justify-between space-y-6">
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-500">نسخة محمولة · Portable ZIP</div>
                <h2 className="text-lg font-extrabold text-slate-900">النسخة المضغوطة (.zip)</h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  فك ضغط الملفات في أي مجلد أو على فلاش ميموري وشغّل أيقونة التشغيل مباشرة دون المرور بخطوات التثبيت.
                </p>
                <div className="pt-1 text-[11px] font-mono-num text-slate-500" dir="ltr">
                  MINA_NET_ERP_PC.zip · Portable Package
                </div>
              </div>
              <a
                href="/api/desktop/download-zip"
                download="MINA_NET_ERP_PC.zip"
                className="w-full py-3 px-4 text-xs font-bold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <FolderArchive className="w-4 h-4 text-[#1e3a8a] shrink-0" />
                <span>تحميل النسخة المضغوطة (.zip)</span>
              </a>
            </div>

            <div className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col justify-between space-y-6">
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-slate-500">ملف واحد مستقل · Direct HTML</div>
                <h2 className="text-lg font-extrabold text-slate-900">نسخة التشغيل المباشر (.html)</h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  ملف تشغيل واحد خفيف يفتح مباشرة في المتصفح دون تثبيت برامج إضافية، مع حفظ تلقائي لبياناتك داخل الجهاز.
                </p>
                <div className="pt-1 text-[11px] font-mono-num text-slate-500" dir="ltr">
                  MINA_NET_DIRECT.html · Standalone File
                </div>
              </div>
              <a
                href="/api/desktop/download-direct-html"
                download="MINA_NET_DIRECT.html"
                className="w-full py-3 px-4 text-xs font-bold text-slate-900 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors rounded-lg flex items-center justify-center gap-2 whitespace-nowrap"
              >
                <FileCode2 className="w-4 h-4 text-[#1e3a8a] shrink-0" />
                <span>تحميل ملف التشغيل المباشر (.html)</span>
              </a>
            </div>
          </div>
        </section>

        {/* Installation Guide */}
        <section id="steps" className="bg-white border-y border-slate-200 py-14">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            <div className="lg:col-span-7 space-y-6">
              <div>
                <h2 className="font-display font-extrabold text-2xl text-slate-900">
                  خطوات التثبيت والتشغيل على ويندوز
                </h2>
                <p className="text-sm text-slate-600 mt-1.5">
                  صُممت حزمة التثبيت لتعمل تلقائياً دون إعدادات برمجية معقدة من المستخدم.
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-1">
                  <div className="text-sm font-extrabold text-[#1e3a8a]">01. شغّل ملف التثبيت MINA_NET_SETUP.exe</div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    بعد التحميل، اضغط مرتين على ملف التثبيت واختر مجلد الحفظ (الافتراضي C:\MinaNet)، وسيتم تجهيز بيئة التشغيل وقاعدة البيانات وإنشاء أيقونة سطح المكتب تلقائياً.
                  </p>
                </div>

                <div className="p-4 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-1">
                  <div className="text-sm font-extrabold text-[#1e3a8a]">02. افتح البرنامج من أيقونة سطح المكتب</div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    تفتح أيقونة البرنامج نافذة التشغيل الخاصة بالنظام دون ظهور شاشة موجه الأوامر، وتعمل فوراً بفترة تجريبية مجانية مدتها 30 يوماً.
                  </p>
                </div>

                <div className="p-4 bg-[#f8fafc] border border-slate-200 rounded-xl space-y-1">
                  <div className="text-sm font-extrabold text-[#1e3a8a]">03. التفعيل الدائم وتنزيل التحديثات</div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    لطلب التفعيل الدائم أرسل بصمة الجهاز من شاشة الترخيص عبر واتساب، وللحصول على أي تحديث مستقبلي ادخل إلى الإعدادات ثم تبويب «تحديثات البرنامج».
                  </p>
                </div>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="h-full min-h-[260px] rounded-xl overflow-hidden border border-slate-200 bg-slate-100">
                {!imgError ? (
                  <img
                    src={warehouseOpsImg}
                    alt="نظام Mina Net يعمل على أجهزة المحلات والمخازن"
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full min-h-[260px] flex flex-col items-center justify-center p-6 text-center bg-slate-100 text-slate-700">
                    <ShieldCheck className="w-10 h-10 text-[#1e3a8a] mb-2" />
                    <div className="font-bold text-sm">نسخة سطح المكتب المستقلة لنظام Mina Net</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* WhatsApp Contact & Activation */}
        <section id="activation" className="max-w-6xl mx-auto px-4 sm:px-6 py-12">
          <div className="p-6 sm:p-8 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="space-y-1.5 max-w-xl">
              <div className="text-xs font-semibold text-emerald-800">الدعم الفني والتفعيل الرسمي</div>
              <h2 className="font-display font-extrabold text-xl sm:text-2xl text-slate-900">
                تواصل مع المبرمج اسامه جرجس عبر واتساب
              </h2>
              <p className="text-xs sm:text-sm text-slate-600">
                لإصدار كود التفعيل المرتبط ببصمة جهازك أو طلب أي مساعدة أثناء التثبيت على ويندوز.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <a
                href={directWhatsAppUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-3 px-5 text-xs sm:text-sm font-bold text-white bg-emerald-700 hover:bg-emerald-800 transition-colors rounded-lg flex items-center gap-2 whitespace-nowrap"
              >
                <MessageCircle className="w-4 h-4" />
                <span>محادثة واتساب ({PHONE_DISPLAY})</span>
              </a>
              <a
                href={`tel:${PHONE_DISPLAY}`}
                className="py-3 px-4 text-xs sm:text-sm font-bold text-slate-800 bg-slate-100 hover:bg-slate-200 border border-slate-300 transition-colors rounded-lg flex items-center gap-1.5 whitespace-nowrap"
              >
                <Phone className="w-4 h-4" />
                <span>اتصال مباشر</span>
              </a>
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
            <a href="/" className="hover:text-slate-900 font-semibold">
              <span>الصفحة الرئيسية</span>
            </a>
            <button type="button" onClick={onOpenLiveDemo} className="hover:text-slate-900 font-semibold">
              تجربة البرنامج أونلاين
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
