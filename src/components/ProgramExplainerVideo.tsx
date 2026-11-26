import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Barcode,
  CheckCircle2,
  Coins,
  DatabaseBackup,
  Download,
  Film,
  Layers,
  Monitor,
  Pause,
  Play,
  Printer,
  QrCode,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ScanBarcode,
  ShoppingBag,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Warehouse,
} from 'lucide-react';

interface ExplainerChapter {
  id: string;
  num: string;
  durationSec: number;
  title: string;
  subtitle: string;
  narration: string;
  bullets: string[];
}

const CHAPTERS: ExplainerChapter[] = [
  {
    id: 'dashboard',
    num: '01',
    durationSec: 8,
    title: 'الشاشة الرئيسية واختصارات لوحة المفاتيح',
    subtitle: 'واجهة عربية مرتبة تدعم العمل السريع على ويندوز 7 إلى 11 وأوفلاين 100%',
    narration:
      'أهلاً بكم في شرح برنامج مينا نت لإدارة المحلات التجارية والمخازن. من الشاشة الرئيسية تصل لكل الأقسام بضغطة واحدة أو باختصارات لوحة المفاتيح مثل F1 للمبيعات وF2 للمشتريات.',
    bullets: [
      'الدخول بصلاحيات مستقلة لكل من المدير والكاشير وأمين المخزن',
      'أزرار سريعة للمبيعات F1 والمشتريات F2 والأصناف F3 والتقارير F6',
      'قاعدة بيانات محلية سريعة تعمل بدون إنترنت مع حفظ تلقائي',
    ],
  },
  {
    id: 'pos-barcode',
    num: '02',
    durationSec: 9,
    title: 'نقطة البيع وقارئ الباركود السريع وشاشة التاتش',
    subtitle: 'قراءة متتالية لأي قارئ باركود دون لمس الماوس مع أزرار مصورة للأصناف غير المعبأة',
    narration:
      'في شاشة المبيعات، يلتقط البرنامج قراءات أي قارئ باركود USB أو لاسلكي بشكل متتالي وفوري بدون الضغط بالماوس، مع تجميع الكمية تلقائياً وإمكانية تعليق الفاتورة لخدمة العميل التالي.',
    bullets: [
      'قراءة متتالية فورية بالباركود مع صوت تنبيه وزيادة الكمية (+1) تلقائياً',
      'لوحة بيع سريعة بالتاتش للأصناف المصورة أو التي لا تحمل باركود مثل المخبوزات والخضروات',
      'تعليق الفاتورة مؤقتاً بالزر F8 لعدم تعطيل طابور العملاء واستدعائها في أي وقت',
    ],
  },
  {
    id: 'printer-drawer',
    num: '03',
    durationSec: 9,
    title: 'الطابعة الحرارية (80 و58 مم) ودرج النقدية',
    subtitle: 'طباعة فورية للفواتير باللوجو وفتح الدرج تلقائياً بمجرد البيع النقدي',
    narration:
      'يدعم البرنامج كافة الطابعات الحرارية مقاس 80 ملم و58 ملم وطابعات A4، مع تنسيق الفاتورة بشعار المحل وبيانات التواصل، ويرسل أمراً تلقائياً لفتح درج النقدية فور البيع الكاش.',
    bullets: [
      'دعم طباعة الإيصالات الحرارية 80mm و58mm وورق A4 القياسي',
      'إظهار لوجو المحل، رقم الهاتف، تفاصيل الضريبة، وباركود QR على الإيصال',
      'فتح درج النقدية برمجياً تلقائياً عند البيع النقدي أو يدوياً بزر F9',
    ],
  },
  {
    id: 'customer-display',
    num: '04',
    durationSec: 10,
    title: 'الشاشة الثانية للعميل (Dual Customer Display)',
    subtitle: 'اكتشاف تلقائي للشاشة الثانية مع عرض الفاتورة والعروض وملخص الدفع وQR Code',
    narration:
      'بمجرد توصيل شاشة ثانية بالويندوز، يفتح البرنامج نافذة العميل عليها تلقائياً بوضع ملء الشاشة لعرض الفاتورة لحظياً بالعربية، مع صور وفيديوهات العروض، وملخص المبلغ المدفوع والباقي وباركود الدفع السريع.',
    bullets: [
      'تعرف تلقائي على الشاشة الثانية بالويندوز وتحديث لحظي لكل صنف وخصم',
      'نصف شاشة ترحيب وعروض متحركة بالصور أو الفيديوهات في وقت الانتظار',
      'عرض الإجمالي والمدفوع والباقي بخط واضح مع QR Code لإنستاباي أو تقييم الخدمة',
    ],
  },
  {
    id: 'inventory-barcode',
    num: '05',
    durationSec: 8,
    title: 'المخازن والجرد وطباعة ملصقات الباركود',
    subtitle: 'رقابة دقيقة على الأرصدة وتوليد وطباعة باركود الأسعار للأصناف غير المعبأة',
    narration:
      'تابع أرصدة كل مخزن لحظياً مع التحويل بين المخازن وتسوية الجرد، واستخدم شاشة طابعة الباركود لتوليد أكواد EAN-13 وطباعة ملصقات الأسعار واسم المحل على المقاس الذي يناسب طابعتك.',
    bullets: [
      'تنبيهات تلقائية للأصناف التي وصلت لحد الطلب مع كارت حركة الصنف',
      'توليد باركود EAN-13 تلقائياً للأصناف التي بدون باركود مصنعي',
      'طباعة ملصقات بمقاسات متعددة (38×25، 50×30، 40×20 مم، أو صفحات A4)',
    ],
  },
  {
    id: 'reports-accounts',
    num: '06',
    durationSec: 8,
    title: 'الحسابات والخزينة وتقارير صافي الربح',
    subtitle: 'كشوف حساب العملاء والموردين ومراقبة الخزينة والأقساط وسجل التدقيق',
    narration:
      'تابع حسابات العملاء والموردين والمصروفات وسندات القبض والصرف، واستخرج تقارير المبيعات وصافي الأرباح بدقة، مع إخفاء أسعار التكلفة والأرباح تلقائياً عن الكاشير.',
    bullets: [
      'سندات قبض وصرف وكشوف حسابات تفصيلية ومتابعة الشيكات والأقساط',
      'تقارير يومية وشهرية للمبيعات والمشتريات والأرباح حسب الصنف أو الفترة',
      'سجل تدقيق كامل لحماية الحسابات ومنع التلاعب',
    ],
  },
  {
    id: 'updates-backup',
    num: '07',
    durationSec: 8,
    title: 'النسخ الاحتياطي اليومي والتحديث المباشر والتفعيل',
    subtitle: 'حماية بياناتك تلقائياً واستلام أي تعديل أو ميزة جديدة من الإعدادات',
    narration:
      'يوفر مينا نت نسخاً احتياطياً يومياً تلقائياً لقاعدة بياناتك، مع زر تحديثات في الإعدادات لتنزيل أي إضافة أو تعديل من المبرمج فوراً. جرّب النظام الآن وتواصل للتفعيل على 01153672084.',
    bullets: [
      'نسخ احتياطي مجدول تلقائياً يومياً مع استيراد سريع للبيانات من Excel',
      'تحديث البرنامج بضغطة زر من الإعدادات دون المساس ببيانات العملاء والفواتير',
      'دعم فني مباشر وتعديلات حسب نشاطك عبر واتساب: 01153672084',
    ],
  },
];

interface ProgramExplainerVideoProps {
  onEnterDemo: () => void;
}

export const ProgramExplainerVideo: React.FC<ProgramExplainerVideoProps> = ({ onEnterDemo }) => {
  const [viewMode, setViewMode] = useState<'interactive' | 'mp4'>('interactive');
  const [chapterIndex, setChapterIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [elapsedInChapter, setElapsedInChapter] = useState(0);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [demoScanStep, setDemoScanStep] = useState(0);
  const mp4VideoRef = useRef<HTMLVideoElement | null>(null);

  const chapter = CHAPTERS[chapterIndex];
  const totalDuration = CHAPTERS.reduce((s, c) => s + c.durationSec, 0);
  const elapsedBeforeCurrent = CHAPTERS.slice(0, chapterIndex).reduce((s, c) => s + c.durationSec, 0);
  const overallProgressPct = Math.min(100, ((elapsedBeforeCurrent + elapsedInChapter) / totalDuration) * 100);

  const stopSpeech = () => {
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    } catch {
      // ignore speech errors
    }
  };

  const speakChapter = (idx: number) => {
    if (!voiceEnabled) return;
    try {
      if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
      window.speechSynthesis.cancel();
      const target = CHAPTERS[idx];
      if (!target) return;
      const utter = new SpeechSynthesisUtterance(target.narration);
      const voices = window.speechSynthesis.getVoices();
      const arVoice = voices.find((v) => v.lang.startsWith('ar')) || null;
      if (arVoice) utter.voice = arVoice;
      utter.lang = arVoice?.lang || 'ar-EG';
      utter.rate = 1.02;
      window.speechSynthesis.speak(utter);
    } catch {
      // ignore speech synthesis restrictions
    }
  };

  useEffect(() => {
    return () => stopSpeech();
  }, []);

  useEffect(() => {
    if (!isPlaying || viewMode !== 'interactive') {
      stopSpeech();
      return;
    }
    speakChapter(chapterIndex);
  }, [isPlaying, chapterIndex, voiceEnabled, viewMode]);

  useEffect(() => {
    if (!isPlaying || viewMode !== 'interactive') return;
    const tick = window.setInterval(() => {
      setDemoScanStep((prev) => (prev + 1) % 3);
      setElapsedInChapter((prev) => {
        const next = prev + 0.25;
        if (next >= chapter.durationSec) {
          if (chapterIndex < CHAPTERS.length - 1) {
            setChapterIndex((idx) => idx + 1);
            return 0;
          }
          setIsPlaying(false);
          return chapter.durationSec;
        }
        return next;
      });
    }, 250);
    return () => window.clearInterval(tick);
  }, [isPlaying, chapterIndex, chapter.durationSec, viewMode]);

  const handleTogglePlay = () => {
    if (viewMode === 'mp4') {
      if (mp4VideoRef.current) {
        if (mp4VideoRef.current.paused) void mp4VideoRef.current.play();
        else mp4VideoRef.current.pause();
      }
      return;
    }
    if (!isPlaying && chapterIndex === CHAPTERS.length - 1 && elapsedInChapter >= chapter.durationSec) {
      setChapterIndex(0);
      setElapsedInChapter(0);
    }
    setIsPlaying((p) => !p);
  };

  const selectChapter = (idx: number, autoStart = true) => {
    setChapterIndex(idx);
    setElapsedInChapter(0);
    if (autoStart) setIsPlaying(true);
  };

  const renderAnimatedMockScene = () => {
    switch (chapter.id) {
      case 'dashboard':
        return (
          <div className="bg-[#f1f5f9] text-slate-900 rounded-lg border border-slate-300 p-4 space-y-3 shadow-inner">
            <div className="flex items-center justify-between border-b border-slate-300 pb-2">
              <div className="font-extrabold text-sm text-[#0f3d5e]">الشاشة الرئيسية — Mina Net</div>
              <div className="text-[11px] font-semibold text-slate-600">المدير العام · متصل محلياً</div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs font-bold">
              <div className="p-3 bg-emerald-700 text-white rounded-lg flex flex-col gap-1">
                <ShoppingBag className="w-4 h-4" />
                <span>المبيعات (F1)</span>
              </div>
              <div className="p-3 bg-white border border-slate-300 rounded-lg flex flex-col gap-1">
                <Layers className="w-4 h-4 text-[#0f3d5e]" />
                <span>الأصناف (F3)</span>
              </div>
              <div className="p-3 bg-white border border-slate-300 rounded-lg flex flex-col gap-1">
                <Warehouse className="w-4 h-4 text-sky-700" />
                <span>المخازن والجرد</span>
              </div>
              <div className="p-3 bg-[#0f3d5e] text-white rounded-lg flex flex-col gap-1">
                <ReceiptText className="w-4 h-4 text-emerald-300" />
                <span>التقارير (F6)</span>
              </div>
            </div>
          </div>
        );
      case 'pos-barcode':
        return (
          <div className="bg-[#f8fafc] text-slate-900 rounded-lg border border-slate-300 p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
            <div className="sm:col-span-7 space-y-2">
              <div className="flex items-center justify-between bg-emerald-50 border border-emerald-300 px-2.5 py-1.5 rounded font-bold text-emerald-950">
                <span className="flex items-center gap-1.5">
                  <ScanBarcode className="w-4 h-4 text-emerald-700" />
                  قارئ الباركود نشط (قراءة متتالية فورية)
                </span>
                <span className="font-mono-num" dir="ltr">
                  {demoScanStep === 0 ? '622100451239' : demoScanStep === 1 ? '622300891142' : '622401129901'}
                </span>
              </div>
              <div className="bg-white border border-slate-300 rounded overflow-hidden">
                <div className="grid grid-cols-3 bg-slate-100 px-2.5 py-1 font-bold border-b border-slate-200">
                  <span>الصنف</span>
                  <span>الكمية</span>
                  <span>الإجمالي</span>
                </div>
                <div className="divide-y divide-slate-200 font-mono-num">
                  <div className="grid grid-cols-3 px-2.5 py-1.5">
                    <span className="font-sans font-semibold">شاي علبة 250 جم</span>
                    <span>{demoScanStep >= 1 ? '2' : '1'}</span>
                    <span>{demoScanStep >= 1 ? '130.00' : '65.00'}</span>
                  </div>
                  <div className="grid grid-cols-3 px-2.5 py-1.5 bg-emerald-50/70">
                    <span className="font-sans font-semibold">خبز فينو طازج</span>
                    <span>3</span>
                    <span>15.00</span>
                  </div>
                </div>
              </div>
            </div>
            <div className="sm:col-span-5 space-y-2">
              <div className="font-bold text-slate-700">أزرار التاتش السريعة (بدون باركود)</div>
              <div className="grid grid-cols-2 gap-1.5 font-bold">
                <div className="p-2 bg-white border border-slate-300 rounded text-center">خبز طازج · 5 ج</div>
                <div className="p-2 bg-white border border-slate-300 rounded text-center">خضار طازج · 18 ج</div>
                <div className="p-2 bg-amber-50 border border-amber-300 rounded text-center col-span-2 text-amber-950">
                  تعليق الفاتورة (F8) — 1 معلقة
                </div>
              </div>
            </div>
          </div>
        );
      case 'printer-drawer':
        return (
          <div className="bg-[#f8fafc] text-slate-900 rounded-lg border border-slate-300 p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs items-center">
            <div className="sm:col-span-5 bg-white border border-slate-300 p-3 rounded font-mono-num space-y-1 text-center mx-auto w-full max-w-[210px]">
              <div className="font-sans font-extrabold text-sm text-[#0f3d5e]">Mina Net Market</div>
              <div className="text-[10px] text-slate-500">إيصال حراري 80mm / 58mm</div>
              <div className="border-t border-dashed border-slate-300 my-1 pt-1 flex justify-between text-[11px]">
                <span>2 × شاي</span>
                <span>130.00</span>
              </div>
              <div className="border-t border-dashed border-slate-300 pt-1 flex justify-between font-bold">
                <span>الإجمالي</span>
                <span>145.00 ج.م</span>
              </div>
              <div className="pt-1 flex justify-center">
                <QrCode className="w-8 h-8 text-slate-800" />
              </div>
            </div>
            <div className="sm:col-span-7 space-y-2.5">
              <div className="p-3 bg-white border border-slate-300 rounded flex items-center gap-2.5">
                <Printer className="w-5 h-5 text-[#1e3a8a] shrink-0" />
                <div>
                  <div className="font-bold">طباعة تلقائية على 80mm أو 58mm أو A4</div>
                  <div className="text-[11px] text-slate-600">يدعم كافة طابعات الكاشير USB والشبكة</div>
                </div>
              </div>
              <div className="p-3 bg-amber-50 border border-amber-300 rounded flex items-center gap-2.5 text-amber-950">
                <Coins className="w-5 h-5 text-amber-700 shrink-0" />
                <div>
                  <div className="font-bold">فتح درج النقدية تلقائياً (ESC/POS)</div>
                  <div className="text-[11px]">يفتح الدرج فور حفظ الفاتورة النقدية أو بزر F9</div>
                </div>
              </div>
            </div>
          </div>
        );
      case 'customer-display':
        return (
          <div className="bg-slate-900 text-white rounded-lg border border-slate-700 p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs">
            <div className="sm:col-span-6 bg-slate-800/90 border border-slate-700 rounded p-3 space-y-2">
              <div className="flex items-center justify-between border-b border-slate-700 pb-1.5">
                <span className="font-bold text-emerald-300 flex items-center gap-1.5">
                  <Monitor className="w-4 h-4" /> فاتورة العميل (شاشة 2)
                </span>
                <span className="text-[10px] text-slate-400">تحديث لحظي</span>
              </div>
              <div className="space-y-1 font-mono-num">
                <div className="flex justify-between">
                  <span className="font-sans">قهوة عربية 200 جم × 1</span>
                  <span>110.00</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-sans">مياه معدنية × 2</span>
                  <span>20.00</span>
                </div>
              </div>
              <div className="border-t border-slate-700 pt-2 flex justify-between font-bold text-sm text-emerald-300">
                <span>المطلوب: 130.00</span>
                <span>الباقي: 70.00</span>
              </div>
            </div>
            <div className="sm:col-span-6 bg-[#0f3d5e] border border-teal-700/60 rounded p-3 flex flex-col justify-between gap-2">
              <div>
                <div className="font-bold text-emerald-300">عروض اليوم للعملاء</div>
                <div className="text-[11px] text-slate-200 mt-0.5">خصم 15% على المشتريات فوق 500 ج.م</div>
              </div>
              <div className="bg-white text-slate-900 rounded p-2 flex items-center justify-between gap-2">
                <div className="text-[11px] font-bold">امسح QR للدفع عبر إنستاباي أو تقييم الخدمة</div>
                <QrCode className="w-8 h-8 text-[#0f3d5e] shrink-0" />
              </div>
            </div>
          </div>
        );
      case 'inventory-barcode':
        return (
          <div className="bg-[#f8fafc] text-slate-900 rounded-lg border border-slate-300 p-3.5 grid grid-cols-1 sm:grid-cols-12 gap-3 text-xs items-center">
            <div className="sm:col-span-7 space-y-2">
              <div className="p-2.5 bg-white border border-slate-300 rounded flex justify-between font-bold">
                <span>المخزن الرئيسي</span>
                <span className="text-emerald-800 font-mono-num">1,420 صنف متاح</span>
              </div>
              <div className="p-2.5 bg-white border border-slate-300 rounded flex justify-between font-bold">
                <span>تنبيهات النواقص التلقائية</span>
                <span className="text-amber-800 font-mono-num">6 أصناف تحت الحد الأدنى</span>
              </div>
            </div>
            <div className="sm:col-span-5 bg-white border border-slate-300 rounded p-3 text-center space-y-1">
              <div className="font-bold text-slate-900">ملصق باركود 38×25 مم</div>
              <Barcode className="w-24 h-10 mx-auto text-slate-900" />
              <div className="font-mono-num font-bold text-[#1e3a8a]">6221048592014 · 85.00 ج.م</div>
            </div>
          </div>
        );
      case 'reports-accounts':
        return (
          <div className="bg-[#f8fafc] text-slate-900 rounded-lg border border-slate-300 p-3.5 grid grid-cols-3 gap-2.5 text-xs">
            <div className="bg-white border border-slate-300 rounded p-3">
              <div className="text-slate-500 font-semibold">مبيعات اليوم</div>
              <div className="text-base font-extrabold text-[#1e3a8a] font-mono-num mt-1">18,450.00</div>
            </div>
            <div className="bg-white border border-slate-300 rounded p-3">
              <div className="text-slate-500 font-semibold">رصيد الخزينة</div>
              <div className="text-base font-extrabold text-emerald-800 font-mono-num mt-1">42,910.00</div>
            </div>
            <div className="bg-white border border-slate-300 rounded p-3">
              <div className="text-slate-500 font-semibold">كشوف الحساب</div>
              <div className="text-base font-extrabold text-slate-900 font-mono-num mt-1">العملاء والموردين</div>
            </div>
          </div>
        );
      default:
        return (
          <div className="bg-[#f8fafc] text-slate-900 rounded-lg border border-slate-300 p-3.5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 bg-white border border-slate-300 rounded flex items-center gap-2.5">
              <DatabaseBackup className="w-5 h-5 text-[#1e3a8a] shrink-0" />
              <div>
                <div className="font-bold">نسخ احتياطي يومي آمن</div>
                <div className="text-[11px] text-slate-600">حفظ تلقائي لقاعدة البيانات على جهازك</div>
              </div>
            </div>
            <div className="p-3 bg-emerald-50 border border-emerald-300 rounded flex items-center gap-2.5 text-emerald-950">
              <RefreshCw className="w-5 h-5 text-emerald-700 shrink-0" />
              <div>
                <div className="font-bold">تحديثات فورية من الإعدادات</div>
                <div className="text-[11px]">استقبال أي ميزة أو تعديل جديد بضغطة واحدة</div>
              </div>
            </div>
          </div>
        );
    }
  };

  return (
    <section id="explainer-video" className="bg-[#f8fafc] border-t border-slate-200 py-14">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-2xl">
            <h2 className="font-display font-extrabold text-2xl sm:text-3xl text-slate-900">
              فيديو شرح استخدام برنامج Mina Net
            </h2>
            <p className="text-sm text-slate-600 mt-1.5 leading-relaxed">
              شاهد شرح خطوات العمل اليومية على نقاط البيع، قارئ الباركود، شاشة العميل الثانية، والمخازن — أو قم بتحميل الفيديو بصيغة MP4 لمشاركته على واتساب.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-200/80 rounded-lg">
              <button
                type="button"
                onClick={() => {
                  setViewMode('interactive');
                  stopSpeech();
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  viewMode === 'interactive' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Play className="w-3.5 h-3.5 text-[#1e3a8a]" />
                <span>جولة الشرح بالصوت والنص</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsPlaying(false);
                  stopSpeech();
                  setViewMode('mp4');
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-md transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  viewMode === 'mp4' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Film className="w-3.5 h-3.5 text-emerald-700" />
                <span>مشغل فيديو MP4</span>
              </button>
            </div>

            <a
              href="/mina-net-explainer.mp4"
              download="Mina_Net_Explainer.mp4"
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-700 hover:bg-emerald-800 rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
            >
              <Download className="w-3.5 h-3.5" />
              <span>تحميل الفيديو (MP4)</span>
            </a>
          </div>
        </div>

        {viewMode === 'mp4' ? (
          <div className="bg-slate-950 rounded-xl border border-slate-800 overflow-hidden">
            <video
              ref={mp4VideoRef}
              controls
              playsInline
              preload="metadata"
              className="w-full aspect-video bg-slate-950"
              src="/mina-net-explainer.mp4"
            >
              متصفحك لا يدعم تشغيل الفيديو، يمكنك تحميله مباشرة من زر التحميل أعلاه.
            </video>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
            {/* Main Interactive Video Stage */}
            <div className="lg:col-span-8 bg-[#0f172a] text-white rounded-xl border border-slate-800 overflow-hidden flex flex-col justify-between">
              {/* Top Video Info Strip */}
              <div className="px-5 py-3.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="font-bold text-emerald-300">
                  {chapter.num}. {chapter.title}
                </div>
                <div className="text-slate-400 font-mono-num tabular-nums">
                  {chapterIndex + 1} / {CHAPTERS.length}
                </div>
              </div>

              {/* Animated Visual Screen Area */}
              <div className="p-5 sm:p-6 space-y-5 flex-1 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <h3 className="font-display font-extrabold text-lg sm:text-xl text-white">
                    {chapter.title}
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
                    {chapter.subtitle}
                  </p>
                </div>

                {renderAnimatedMockScene()}

                <ul className="space-y-1.5 text-xs text-slate-200">
                  {chapter.bullets.map((b, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>

                {/* Synchronized Arabic Subtitle Bar */}
                <div className="bg-slate-900/90 border border-slate-700 rounded-lg px-4 py-2.5 text-xs sm:text-sm text-amber-100 leading-relaxed">
                  {chapter.narration}
                </div>
              </div>

              {/* Timeline & Playback Controls Bar */}
              <div className="bg-slate-950 border-t border-slate-800 px-4 py-3 space-y-2.5">
                <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden" dir="ltr">
                  <div
                    className="h-full bg-emerald-500 transition-all duration-200"
                    style={{ width: `${overallProgressPct}%` }}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleTogglePlay}
                      className="px-4 py-2 bg-[#1e3a8a] hover:bg-[#1d4ed8] text-white font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                      <span>{isPlaying ? 'إيقاف مؤقت' : 'تشغيل الشرح'}</span>
                    </button>

                    <button
                      type="button"
                      disabled={chapterIndex === 0}
                      onClick={() => selectChapter(Math.max(0, chapterIndex - 1), isPlaying)}
                      title="الخطوة السابقة"
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg disabled:opacity-40"
                    >
                      <SkipForward className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      disabled={chapterIndex === CHAPTERS.length - 1}
                      onClick={() => selectChapter(Math.min(CHAPTERS.length - 1, chapterIndex + 1), isPlaying)}
                      title="الخطوة التالية"
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg disabled:opacity-40"
                    >
                      <SkipBack className="w-4 h-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => selectChapter(0, true)}
                      title="إعادة من البداية"
                      className="p-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVoiceEnabled((v) => !v)}
                      className={`px-3 py-2 rounded-lg font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 border ${
                        voiceEnabled
                          ? 'bg-emerald-900/50 border-emerald-600 text-emerald-200'
                          : 'bg-slate-800 border-slate-700 text-slate-300'
                      }`}
                    >
                      {voiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                      <span>{voiceEnabled ? 'التعليق الصوتي مفعل' : 'صامت (نص فقط)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={onEnterDemo}
                      className="px-3.5 py-2 bg-white text-slate-900 hover:bg-slate-100 font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap shrink-0"
                    >
                      <span>تجربة هذه الشاشة</span>
                      <ArrowLeft className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Chapter Playlist */}
            <div className="lg:col-span-4 bg-white border border-slate-200 rounded-xl p-3 space-y-1.5 flex flex-col justify-between">
              <div className="px-2 py-1.5 text-xs font-extrabold text-slate-800 border-b border-slate-200">
                فصول فيديو الشرح ({CHAPTERS.length} خطوات)
              </div>
              <div className="space-y-1.5 flex-1">
                {CHAPTERS.map((ch, idx) => {
                  const active = idx === chapterIndex;
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => selectChapter(idx, true)}
                      className={`w-full text-right p-2.5 rounded-lg border transition-colors flex items-start justify-between gap-2 ${
                        active
                          ? 'bg-[#1e3a8a] text-white border-[#1e3a8a]'
                          : 'bg-[#f8fafc] text-slate-800 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold leading-snug">
                          {ch.num}. {ch.title}
                        </div>
                        <div className={`text-[11px] mt-0.5 truncate ${active ? 'text-blue-100' : 'text-slate-500'}`}>
                          {ch.subtitle}
                        </div>
                      </div>
                      <span className={`text-[11px] font-mono-num shrink-0 ${active ? 'text-emerald-300' : 'text-slate-500'}`}>
                        {ch.durationSec}ث
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
};
