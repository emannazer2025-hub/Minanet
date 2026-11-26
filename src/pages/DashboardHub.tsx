import React, { useState } from 'react';
import {
  Layers,
  ScanSearch,
  Truck,
  ShoppingBag,
  Banknote,
  BookOpenCheck,
  PackageMinus,
  CornerUpLeft,
  SlidersHorizontal,
  PieChart,
  X,
  Building2,
  ShieldCheck,
  Package,
  Warehouse,
  Landmark,
  FileSpreadsheet,
  Tag,
  Barcode,
  DatabaseBackup,
  ArrowLeftRight,
  RefreshCw,
  Users,
  Wallet,
  UserCheck,
  Power,
  Monitor,
} from 'lucide-react';
import type { UserInfo, ViewKey } from '../types.ts';

interface DashboardHubProps {
  onNavigate: (view: ViewKey, subTab?: string) => void;
  onOpenLogin: () => void;
  settings: Record<string, string>;
  currentUser: UserInfo;
  canViewCost: boolean;
  isOverlayActive: boolean;
}

export const DashboardHub: React.FC<DashboardHubProps> = ({
  onNavigate,
  onOpenLogin,
  settings,
  currentUser,
}) => {
  const [defsPopupOpen, setDefsPopupOpen] = useState(false);
  const [opsPopupOpen, setOpsPopupOpen] = useState(false);
  const [nowDate] = useState(new Date());

  const arabicDate = nowDate.toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const navigateFromPopup = (view: ViewKey, subTab?: string) => {
    setDefsPopupOpen(false);
    setOpsPopupOpen(false);
    onNavigate(view, subTab);
  };

  return (
    <div className="mina-desktop-bg relative w-full min-h-[calc(100vh-36px)] flex flex-col justify-between px-4 sm:px-8 lg:px-14 py-5 select-none overflow-hidden">
      {/* Top Header Bar: Modern Glass Card keeping Right Title + Date & Left Mina Net Emblem */}
      <div className="max-w-5xl w-full mx-auto bg-white/85 backdrop-blur-sm border border-slate-200/90 rounded-2xl px-5 sm:px-7 py-3.5 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <div className="text-right">
          <h1 className="mina-hero-title font-display font-extrabold text-xl sm:text-2xl lg:text-3xl tracking-tight leading-snug">
            إدارة المحلات التجارية والمخازن
          </h1>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs sm:text-sm font-semibold text-slate-600">
            <span className="text-[#0d7377] font-bold">{arabicDate}</span>
            <span aria-hidden="true">·</span>
            <span>{settings.company_name || 'Mina Net'}</span>
            {settings.company_phone && (
              <>
                <span aria-hidden="true">·</span>
                <span className="font-mono-num" dir="ltr">{settings.company_phone}</span>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-50/90 border border-slate-200 rounded-xl px-3.5 py-2">
          <div className="relative w-12 h-11 flex items-center justify-center shrink-0">
            <svg viewBox="0 0 64 64" className="w-full h-full">
              <defs>
                <linearGradient id="minaSteel" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0f3d5e" />
                  <stop offset="100%" stopColor="#0a253b" />
                </linearGradient>
                <linearGradient id="minaEmerald" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#34d399" />
                  <stop offset="100%" stopColor="#0d9488" />
                </linearGradient>
              </defs>
              <rect width="64" height="64" rx="14" fill="url(#minaSteel)" />
              <rect x="9" y="45" width="46" height="5" rx="2.5" fill="url(#minaEmerald)" />
              <path d="M12 40 V16 H19 L27 29 L35 16 H42 V40 H36 V26 L29 37 H25 L18 26 V40 Z" fill="#f8fafc" />
              <path d="M45 40 V16 H50 L54 27 V16 H58 V40 H53 L49 29 V40 Z" fill="url(#minaEmerald)" transform="translate(-4,0)" />
            </svg>
          </div>
          <div className="text-left" dir="ltr">
            <div className="font-display font-black text-xl leading-none tracking-tight text-[#0f3d5e]">
              Mina <span className="text-[#0d9488]">Net</span>
            </div>
            <div className="text-[11px] font-bold text-slate-600 border-t border-slate-200 mt-1 pt-0.5 text-right" dir="rtl">
              اسامه جرجس · <span className="font-mono-num" dir="ltr">01153672084</span>
            </div>
          </div>
        </div>
      </div>

      {/* Center Two-Column Modern Card Menu (Same arrangement, modern styling & fresh icons) */}
      <div className="my-auto py-5 w-full">
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-x-10 lg:gap-x-14 gap-y-3.5">
          {/* Right Column */}
          <div className="space-y-3.5">
            <button
              type="button"
              onClick={() => setDefsPopupOpen(true)}
              className="mina-menu-btn w-full h-16 rounded-2xl px-3.5 flex items-center gap-3.5 text-right group"
            >
              <div className="w-11 h-11 rounded-xl bg-teal-50 border border-teal-200/80 flex items-center justify-center shrink-0 group-hover:bg-teal-600 transition-colors">
                <Layers className="w-6 h-6 text-teal-700 group-hover:text-white transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
                  أكواد وتعريفات
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  الأصناف، العملاء، الموردين، المخازن والخزائن
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('inventory', 'balances')}
              className="mina-menu-btn w-full h-16 rounded-2xl px-3.5 flex items-center gap-3.5 text-right group"
            >
              <div className="w-11 h-11 rounded-xl bg-sky-50 border border-sky-200/80 flex items-center justify-center shrink-0 group-hover:bg-[#0f3d5e] transition-colors">
                <ScanSearch className="w-6 h-6 text-[#0f3d5e] group-hover:text-white transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
                  بحث واستعلام
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  أرصدة المخازن وحركة الصنف والجرد
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('purchases')}
              className="mina-menu-btn w-full h-16 rounded-2xl px-3.5 flex items-center gap-3.5 text-right group"
            >
              <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-200/80 flex items-center justify-center shrink-0 group-hover:bg-indigo-700 transition-colors">
                <Truck className="w-6 h-6 text-indigo-700 group-hover:text-white transition-colors" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
                    المشتريات
                  </span>
                  <span className="text-[11px] font-mono-num font-bold text-slate-400">F2</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  فواتير التوريد وحسابات الموردين
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('sales')}
              className="mina-menu-btn w-full h-16 rounded-2xl px-3.5 flex items-center gap-3.5 text-right group border-emerald-300/80"
            >
              <div className="w-11 h-11 rounded-xl bg-emerald-600 border border-emerald-700 flex items-center justify-center shrink-0 group-hover:bg-emerald-700 transition-colors">
                <ShoppingBag className="w-6 h-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-display font-extrabold text-base sm:text-lg text-[#0f3d5e] leading-tight">
                    المبيعات
                  </span>
                  <span className="text-[11px] font-mono-num font-bold text-emerald-700">F1</span>
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  إصدار فواتير البيع السريعة والباركود
                </div>
              </div>
            </button>
          </div>

          {/* Left Column (Mirrored symmetrically matching original rhythm) */}
          <div className="space-y-3.5">
            <button
              type="button"
              onClick={() => onNavigate('treasury')}
              className="mina-menu-btn w-full h-16 rounded-2xl px-3.5 flex items-center gap-3.5 text-right group"
            >
              <div className="flex-1 min-w-0">
                <div className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
                  مصروفات وإيرادات
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  حركة الخزينة والبنوك والمصاريف اليومية
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-rose-50 border border-rose-200/80 flex items-center justify-center shrink-0 group-hover:bg-rose-700 transition-colors">
                <Banknote className="w-6 h-6 text-rose-700 group-hover:text-white transition-colors" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('accounts', 'vouchers')}
              className="mina-menu-btn w-full h-16 rounded-2xl px-3.5 flex items-center gap-3.5 text-right group"
            >
              <div className="flex-1 min-w-0">
                <div className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
                  المدفوعــــــات
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  سندات القبض والصرف وكشوف الحساب
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-cyan-50 border border-cyan-200/80 flex items-center justify-center shrink-0 group-hover:bg-cyan-700 transition-colors">
                <BookOpenCheck className="w-6 h-6 text-cyan-800 group-hover:text-white transition-colors" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('returns', 'purchase')}
              className="mina-menu-btn w-full h-16 rounded-2xl px-3.5 flex items-center gap-3.5 text-right group"
            >
              <div className="flex-1 min-w-0">
                <div className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
                  مرتجعات مشتريات
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  رد أصناف للموردين وتسوية الرصيد
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-orange-50 border border-orange-200/80 flex items-center justify-center shrink-0 group-hover:bg-orange-600 transition-colors">
                <PackageMinus className="w-6 h-6 text-orange-700 group-hover:text-white transition-colors" />
              </div>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('returns', 'sales')}
              className="mina-menu-btn w-full h-16 rounded-2xl px-3.5 flex items-center gap-3.5 text-right group"
            >
              <div className="flex-1 min-w-0">
                <div className="font-display font-extrabold text-base sm:text-lg text-slate-900 leading-tight">
                  مرتجعات مبيعات
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5 truncate">
                  استرجاع فواتير العملاء للمخزن
                </div>
              </div>
              <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-200/80 flex items-center justify-center shrink-0 group-hover:bg-amber-600 transition-colors">
                <CornerUpLeft className="w-6 h-6 text-amber-700 group-hover:text-white transition-colors" />
              </div>
            </button>
          </div>
        </div>

        {/* Bottom Center Actions (Same centered rhythm: Operations + Reports, and Switch/Exit below) */}
        <div className="max-w-xl mx-auto mt-6 space-y-3.5">
          <div className="grid grid-cols-2 gap-4 sm:gap-6">
            <button
              type="button"
              onClick={() => setOpsPopupOpen(true)}
              className="h-13 rounded-xl bg-[#0f3d5e] hover:bg-[#144f7a] text-white border border-[#0a2940] shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2.5 px-5"
            >
              <SlidersHorizontal className="w-5 h-5 text-emerald-300" />
              <span className="font-display font-extrabold text-lg">العمليات</span>
            </button>

            <button
              type="button"
              onClick={() => onNavigate('reports')}
              className="h-13 rounded-xl bg-[#0f3d5e] hover:bg-[#144f7a] text-white border border-[#0a2940] shadow-sm hover:shadow-md transition-all flex items-center justify-center gap-2.5 px-5"
            >
              <PieChart className="w-5 h-5 text-emerald-300" />
              <span className="font-display font-extrabold text-lg">التقارير</span>
              <span className="text-[11px] font-mono-num text-sky-200">F6</span>
            </button>
          </div>

          <div className="flex items-center justify-center">
            <button
              type="button"
              onClick={onOpenLogin}
              className="mina-exit-btn px-7 py-2 rounded-xl border border-slate-700 shadow-sm hover:brightness-110 transition-all flex items-center gap-2 font-display font-bold text-sm"
            >
              <Power className="w-4 h-4 text-emerald-400" />
              <span>تبديل المستخدم / تسجيل الخروج</span>
            </button>
          </div>
        </div>
      </div>

      {/* Bottom Desktop Status Row (User switcher only, no outer business metrics exposed) */}
      <div className="max-w-5xl w-full mx-auto flex flex-wrap items-center justify-between gap-4 pt-2">
        <button
          type="button"
          onClick={onOpenLogin}
          className="inline-flex items-center gap-2 text-sm sm:text-base font-bold text-[#0f3d5e] hover:text-[#0d7377] transition-colors"
        >
          <UserCheck className="w-4 h-4" />
          <span>المستخدم الحالي: {currentUser.username}</span>
        </button>
      </div>

      {/* POPUP 1: أكواد وتعريفات */}
      {defsPopupOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-4" onClick={() => setDefsPopupOpen(false)}>
          <div className="win-window w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="h-9 bg-white border-b border-slate-200 px-3.5 flex items-center justify-between text-xs font-bold text-slate-900">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#0d7377]" />
                <span>أكواد وتعريفات</span>
              </div>
              <button type="button" onClick={() => setDefsPopupOpen(false)} className="p-1 hover:bg-red-600 hover:text-white rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-5 mina-popup-surface space-y-3">
              <div className="text-center font-display font-black text-xl text-[#0f3d5e] mb-2">أكواد وتعريفات</div>
              <div className="grid grid-cols-2 gap-2.5 text-xs font-bold">
                <button type="button" onClick={() => navigateFromPopup('settings', 'company')} className="win-btn py-2.5 px-3 flex items-center justify-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-[#0f3d5e]" /> بيانات الشركة
                </button>
                <button type="button" onClick={() => navigateFromPopup('definitions', 'products')} className="win-btn py-2.5 px-3 flex items-center justify-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-amber-700" /> الأصناف والأسعار
                </button>
                <button type="button" onClick={() => navigateFromPopup('users', 'users')} className="win-btn py-2.5 px-3 flex items-center justify-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-slate-700" /> المستخدمين
                </button>
                <button type="button" onClick={() => navigateFromPopup('definitions', 'categories')} className="win-btn py-2.5 px-3 flex items-center justify-center gap-1.5">
                  <Tag className="w-3.5 h-3.5 text-emerald-700" /> فئات الأصناف والوحدات
                </button>
                <button type="button" onClick={() => navigateFromPopup('users', 'permissions')} className="win-btn py-2.5 px-3 flex items-center justify-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-[#0f3d5e]" /> صلاحيات المستخدمين
                </button>
                <button type="button" onClick={() => navigateFromPopup('definitions', 'customers')} className="win-btn py-2.5 px-3 flex items-center justify-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-sky-700" /> بيانات العملاء
                </button>
                <button type="button" onClick={() => navigateFromPopup('definitions', 'warehouses')} className="win-btn py-2.5 px-3 flex items-center justify-center gap-1.5">
                  <Warehouse className="w-3.5 h-3.5 text-slate-700" /> المخازن / المناديب
                </button>
                <button type="button" onClick={() => navigateFromPopup('definitions', 'suppliers')} className="win-btn py-2.5 px-3 flex items-center justify-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-amber-700" /> بيانات الموردين
                </button>
                <button type="button" onClick={() => navigateFromPopup('definitions', 'cashboxes')} className="win-btn py-2.5 px-3 flex items-center justify-center gap-1.5">
                  <Landmark className="w-3.5 h-3.5 text-emerald-800" /> الخزائن والبنوك
                </button>
                <button type="button" onClick={() => navigateFromPopup('definitions', 'categories')} className="win-btn py-2.5 px-3 flex items-center justify-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-rose-700" /> بنود المصروفات والإيرادات
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POPUP 2: العمليات */}
      {opsPopupOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-slate-900/40 backdrop-blur-[1px] p-4" onClick={() => setOpsPopupOpen(false)}>
          <div className="win-window w-full max-w-lg overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="h-9 bg-white border-b border-slate-200 px-3.5 flex items-center justify-between text-xs font-bold text-slate-900">
              <div className="flex items-center gap-2">
                <SlidersHorizontal className="w-4 h-4 text-[#0d7377]" />
                <span>العمليات</span>
              </div>
              <button type="button" onClick={() => setOpsPopupOpen(false)} className="p-1 hover:bg-red-600 hover:text-white rounded">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="p-6 mina-popup-surface">
              <div className="text-right font-display font-black text-2xl text-[#0f3d5e] mb-4">العمليات والإعدادات</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs font-bold">
                <button type="button" onClick={() => navigateFromPopup('operations', 'checks')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1">
                  <Landmark className="w-3.5 h-3.5 text-[#0f3d5e]" /> الشيكات
                </button>
                <button type="button" onClick={() => navigateFromPopup('treasury', 'transfer')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1">
                  <ArrowLeftRight className="w-3.5 h-3.5 text-emerald-700" /> التعاملات البنكية
                </button>
                <button type="button" onClick={() => navigateFromPopup('inventory', 'transfer')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1">
                  <Warehouse className="w-3.5 h-3.5 text-slate-700" /> تحويل بضاعة
                </button>
                <button type="button" onClick={() => navigateFromPopup('operations', 'prices')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-sky-700" /> تحديث الأسعار
                </button>
                <button type="button" onClick={() => navigateFromPopup('operations', 'checks')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-amber-700" /> أنظمة التقسيط
                </button>
                <button type="button" onClick={() => navigateFromPopup('import')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1">
                  <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-800" /> إدارة واستيراد البيانات
                </button>
                <button type="button" onClick={() => navigateFromPopup('operations', 'barcode')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1">
                  <Barcode className="w-3.5 h-3.5 text-slate-800" /> طباعة الباركود
                </button>
                <button type="button" onClick={() => navigateFromPopup('inventory', 'stocktake')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1">
                  <Package className="w-3.5 h-3.5 text-[#0f3d5e]" /> الجرد والتسويات
                </button>
                <button type="button" onClick={() => navigateFromPopup('settings', 'company')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1">
                  <SlidersHorizontal className="w-3.5 h-3.5 text-slate-700" /> إعدادات
                </button>
                <button type="button" onClick={() => navigateFromPopup('settings', 'backup')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1">
                  <DatabaseBackup className="w-3.5 h-3.5 text-[#0f3d5e]" /> نسخة احتياطية
                </button>
                <button type="button" onClick={() => navigateFromPopup('settings', 'updates')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1 text-emerald-950">
                  <RefreshCw className="w-3.5 h-3.5 text-emerald-700" /> تحديثات البرنامج
                </button>
                <button type="button" onClick={() => navigateFromPopup('settings', 'hardware')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1 text-[#0f3d5e]">
                  <Monitor className="w-3.5 h-3.5 text-teal-700" /> الأجهزة وشاشة العميل
                </button>
                <button type="button" onClick={() => navigateFromPopup('users', 'audit')} className="win-btn py-2.5 px-2.5 flex items-center justify-center gap-1">
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-700" /> سجل التدقيق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
