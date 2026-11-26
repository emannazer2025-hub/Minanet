import React, { useEffect, useState } from 'react';
import {
  LayoutDashboard,
  ReceiptText,
  ShoppingCart,
  Package,
  FileSpreadsheet,
  BarChart3,
  ShieldCheck,
  DatabaseBackup,
  LogOut,
  AlertTriangle,
  Minus,
  Square,
  X,
  Globe,
} from 'lucide-react';
import { apiFetch, isDirectDesktopMode, setApiUserId } from './api.ts';
import type { BootstrapData, SettingsSubTab, ViewKey } from './types.ts';
import { LandingShowcaseView } from './pages/LandingShowcaseView.tsx';
import { DownloadPortalView } from './pages/DownloadPortalView.tsx';
import { CustomerDisplayView } from './pages/CustomerDisplayView.tsx';
import { DashboardHub } from './pages/DashboardHub.tsx';
import { DefinitionsView } from './pages/DefinitionsView.tsx';
import { SalesView } from './pages/SalesView.tsx';
import { PurchasesView } from './pages/PurchasesView.tsx';
import { ReturnsView } from './pages/ReturnsView.tsx';
import { InventoryView } from './pages/InventoryView.tsx';
import { AccountsView } from './pages/AccountsView.tsx';
import { TreasuryView } from './pages/TreasuryView.tsx';
import { OperationsView } from './pages/OperationsView.tsx';
import { SmartImportView } from './pages/SmartImportView.tsx';
import { ReportsView } from './pages/ReportsView.tsx';
import { UsersPermissionsView } from './pages/UsersPermissionsView.tsx';
import { SettingsBackupView } from './pages/SettingsBackupView.tsx';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton.tsx';
import { ActivationGateModal } from './components/ActivationGateModal.tsx';
import { runClientScheduledBackupIfDue } from './utils/localBackupFolder.ts';
import {
  applyMinaIndustry,
  applyMinaLayout,
  applyMinaTheme,
  getInitialIndustryId,
  getInitialLayoutId,
  isClientDesktopPackage,
} from './themes.ts';

export default function App() {
  const [bootstrap, setBootstrap] = useState<BootstrapData | null>(null);
  const [activeView, setActiveView] = useState<ViewKey>('dashboard');
  const [defsTab, setDefsTab] = useState<'products' | 'categories' | 'warehouses' | 'customers' | 'suppliers' | 'cashboxes'>('products');
  const [invTab, setInvTab] = useState<'balances' | 'card' | 'transfer' | 'stocktake'>('balances');
  const [accTab, setAccTab] = useState<'statement' | 'vouchers' | 'aging'>('statement');
  const [treTab, setTreTab] = useState<'vouchers' | 'transfer' | 'ledger'>('vouchers');
  const [returnsSubTab, setReturnsSubTab] = useState<'sales' | 'purchase'>('sales');
  const [opsTab, setOpsTab] = useState<'prices' | 'barcode' | 'checks'>('prices');
  const [usrTab, setUsrTab] = useState<'permissions' | 'users' | 'audit'>('permissions');
  const [setTab, setSetTab] = useState<SettingsSubTab>('company');
  const [windowMaximized, setWindowMaximized] = useState(false);
  const hideDesktopInstallUi = isClientDesktopPackage();
  const isDirectMode = isDirectDesktopMode();
  const isCustomerDisplayRoute = (() => {
    try {
      const p = window.location.pathname.replace(/\/+$/, '');
      const sp = new URLSearchParams(window.location.search);
      return p === '/customer-display' || sp.get('customer-display') === '1';
    } catch {
      return false;
    }
  })();
  const [isDownloadRoute, setIsDownloadRoute] = useState<boolean>(() => {
    if (hideDesktopInstallUi || isDirectMode) return false;
    try {
      const p = window.location.pathname.replace(/\/+$/, '');
      return p === '/download' || p === '/downloads';
    } catch {
      return false;
    }
  });
  const [enteredErpDemo, setEnteredErpDemo] = useState<boolean>(() => {
    if (hideDesktopInstallUi || isDirectMode) return true;
    try {
      return new URLSearchParams(window.location.search).get('app') === '1';
    } catch {
      return false;
    }
  });

  const [loginOpen, setLoginOpen] = useState(false);
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [loginError, setLoginError] = useState('');

  const [bootError, setBootError] = useState('');

  const handleEnterDemo = () => {
    setIsDownloadRoute(false);
    setEnteredErpDemo(true);
    try {
      const url = new URL(window.location.href);
      url.pathname = '/';
      url.searchParams.set('app', '1');
      window.history.replaceState(null, '', url.toString());
    } catch {
      // ignore
    }
  };

  const handleReturnToLanding = () => {
    setIsDownloadRoute(false);
    setEnteredErpDemo(false);
    try {
      const url = new URL(window.location.href);
      url.pathname = '/';
      url.searchParams.delete('app');
      window.history.replaceState(null, '', url.toString());
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    getInitialLayoutId();
    getInitialIndustryId();
    applyMinaLayout('mina-classic', false);
    applyMinaTheme('mina-classic', false);
    applyMinaIndustry('general-classic', false);
  }, []);

  const loadBootstrap = async () => {
    try {
      setBootError('');
      const data = await apiFetch<BootstrapData>('/api/bootstrap');
      setBootstrap(data);
      if (data.currentUser) {
        setApiUserId(data.currentUser.id);
      }
    } catch (err: unknown) {
      setBootError((err as Error)?.message || 'تعذر تشغيل قاعدة بيانات النظام في هذا المتصفح');
    }
  };

  useEffect(() => {
    void loadBootstrap();
  }, []);

  useEffect(() => {
    if (!bootstrap?.settings) return;
    const runCheck = () => {
      void runClientScheduledBackupIfDue(bootstrap.settings, () => {
        void loadBootstrap();
      });
    };
    runCheck();
    const timer = window.setInterval(runCheck, 20_000);
    return () => window.clearInterval(timer);
  }, [
    bootstrap?.settings?.auto_backup_enabled,
    bootstrap?.settings?.auto_backup_time,
    bootstrap?.settings?.auto_backup_dir,
    bootstrap?.settings?.auto_backup_last_date,
  ]);

  // Global Keyboard Shortcuts (F1-F6 & Escape back to Dashboard Hub)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!bootstrap?.license?.is_operational) return;
      if (e.key === 'F1') {
        e.preventDefault();
        setActiveView('sales');
      } else if (e.key === 'F2') {
        e.preventDefault();
        setActiveView('purchases');
      } else if (e.key === 'F3') {
        e.preventDefault();
        setDefsTab('products');
        setActiveView('definitions');
      } else if (e.key === 'F4') {
        e.preventDefault();
        setActiveView('import');
      } else if (e.key === 'F6') {
        e.preventDefault();
        setActiveView('reports');
      } else if (e.ctrlKey && e.shiftKey && (e.key === 'L' || e.key === 'l')) {
        e.preventDefault();
        window.location.href = '/license-manager';
      } else if (e.key === 'Escape' && !loginOpen) {
        setActiveView('dashboard');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [loginOpen, bootstrap?.license?.is_operational]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');
    try {
      const res = await apiFetch<{ user: BootstrapData['currentUser'] }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username: loginUser.trim(), password: loginPass }),
      });
      if (res.user) setApiUserId(res.user.id);
      setLoginOpen(false);
      setLoginUser('');
      setLoginPass('');
      await loadBootstrap();
      setActiveView('dashboard');
    } catch (err: unknown) {
      setLoginError((err as Error).message);
    }
  };

  if (isCustomerDisplayRoute) {
    return <CustomerDisplayView />;
  }

  if (!hideDesktopInstallUi && !isDirectMode && isDownloadRoute) {
    return <DownloadPortalView onOpenLiveDemo={handleEnterDemo} />;
  }

  if (!hideDesktopInstallUi && !isDirectMode && !enteredErpDemo) {
    return <LandingShowcaseView onEnterDemo={handleEnterDemo} />;
  }

  if (bootError) {
    return (
      <div className="mina-desktop-bg min-h-screen flex items-center justify-center p-4 text-slate-900">
        <div className="win-window max-w-md w-full p-5 space-y-3 text-xs border-2 border-red-800 bg-[#ece9d8]">
          <div className="font-bold text-sm text-red-900">تعذر تشغيل نظام Mina Net</div>
          <p className="font-semibold text-slate-800">{bootError}</p>
          <p className="text-[11px] text-slate-700">
            تأكد من فتح الملف بمتصفح Microsoft Edge أو Google Chrome الحديث مع السماح بالتخزين المحلي.
          </p>
          <button type="button" onClick={() => void loadBootstrap()} className="win-btn px-4 py-1.5 font-bold">
            إعادة المحاولة
          </button>
        </div>
      </div>
    );
  }

  if (!bootstrap) {
    return (
      <div className="mina-desktop-bg min-h-screen flex items-center justify-center text-slate-900 font-bold text-sm">
        جاري تحميل نظام Mina Net وقاعدة البيانات...
      </div>
    );
  }

  const { settings, currentUser, permissions, modules, license } = bootstrap;

  const hasPermission = (modKey: string, field: 'can_view' | 'can_view_cost' = 'can_view'): boolean => {
    if (!currentUser) return false;
    if (currentUser.role_id === 1) return true;
    const row = permissions.find((p) => p.module_key === modKey);
    return row ? Number(row[field]) === 1 : true;
  };

  const canViewCost = hasPermission('sales', 'can_view_cost') && hasPermission('reports', 'can_view_cost');

  const viewTitles: Record<ViewKey, string> = {
    dashboard: 'الشاشة الرئيسية',
    definitions: 'الأصناف والأسعار والأكواد والتعريفات',
    sales: 'فاتورة بيع',
    purchases: 'فاتورة شراء',
    returns: returnsSubTab === 'purchase' ? 'مرتجعات مشتريات' : 'مرتجعات مبيعات',
    inventory: 'بحث واستعلام المخازن والجرد',
    accounts: 'المدفوعات وكشوف الحسابات',
    treasury: 'مصروفات وإيرادات والخزينة',
    operations: 'العمليات والأسعار والباركود',
    import: 'الاستيراد الذكي للبيانات',
    reports: 'التقارير',
    users: 'صلاحيات المستخدمين والتدقيق',
    settings: 'بيانات الشركة والنسخ الاحتياطي والترخيص والتحديثات',
  };

  const handleNavigate = (view: ViewKey, subTab?: string) => {
    if (view === 'definitions' && subTab) {
      setDefsTab(subTab as typeof defsTab);
    } else if (view === 'inventory' && subTab) {
      setInvTab(subTab as typeof invTab);
    } else if (view === 'accounts' && subTab) {
      setAccTab(subTab as typeof accTab);
    } else if (view === 'treasury' && subTab) {
      setTreTab(subTab as typeof treTab);
    } else if (view === 'returns' && (subTab === 'sales' || subTab === 'purchase')) {
      setReturnsSubTab(subTab);
    } else if (view === 'operations' && subTab) {
      setOpsTab(subTab as typeof opsTab);
    } else if (view === 'users' && subTab) {
      setUsrTab(subTab as typeof usrTab);
    } else if (view === 'settings' && subTab) {
      setSetTab((subTab === 'themes' ? 'company' : subTab) as SettingsSubTab);
    }
    setActiveView(view);
  };

  const isOverlayActive = activeView !== 'dashboard';

  const renderLicenseAlertBanner = () =>
    (license.warning_level !== 'NONE' || !license.is_operational || license.clock_tamper) && (
      <div
        className={`no-print px-4 py-1.5 text-xs flex flex-wrap items-center justify-between gap-2 border-b z-20 ${
          !license.is_operational
            ? 'bg-red-700 text-white border-red-900'
            : 'bg-amber-200 text-amber-950 border-amber-500 font-semibold'
        }`}
      >
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>
            {license.message}
            {license.clock_tamper && ' · ملاحظة: تم رصد تغيير في ساعة النظام للخلف.'}
          </span>
        </div>
        <button
          type="button"
          onClick={() => handleNavigate('settings', 'license')}
          className="win-btn px-2.5 py-0.5 font-bold text-slate-900"
        >
          الانتقال لشاشة التفعيل والترخيص
        </button>
      </div>
    );

  const renderActiveErpView = () => {
    if (!currentUser) return null;
    switch (activeView) {
      case 'dashboard':
        return (
          <DashboardHub
            onNavigate={handleNavigate}
            onOpenLogin={() => {
              setLoginError('');
              setLoginUser('');
              setLoginPass('');
              setLoginOpen(true);
            }}
            settings={settings}
            currentUser={currentUser}
            canViewCost={canViewCost}
            isOverlayActive={false}
          />
        );
      case 'definitions':
        return <DefinitionsView settings={settings} canViewCost={canViewCost} initialTab={defsTab} />;
      case 'sales':
        return <SalesView settings={settings} currentUser={currentUser} canViewCost={canViewCost} />;
      case 'purchases':
        return <PurchasesView settings={settings} currentUser={currentUser} />;
      case 'returns':
        return <ReturnsView settings={settings} initialTab={returnsSubTab} />;
      case 'inventory':
        return <InventoryView settings={settings} canViewCost={canViewCost} initialTab={invTab} />;
      case 'accounts':
        return <AccountsView settings={settings} initialTab={accTab} />;
      case 'treasury':
        return <TreasuryView settings={settings} initialTab={treTab} />;
      case 'operations':
        return <OperationsView settings={settings} initialTab={opsTab} />;
      case 'import':
        return <SmartImportView />;
      case 'reports':
        return <ReportsView settings={settings} canViewCost={canViewCost} />;
      case 'users':
        return (
          <UsersPermissionsView
            modules={modules}
            initialTab={usrTab}
            onRefreshBootstrap={() => void loadBootstrap()}
          />
        );
      case 'settings':
        return (
          <SettingsBackupView
            settings={settings}
            license={license}
            onRefreshBootstrap={loadBootstrap}
            initialTab={setTab}
          />
        );
      default:
        return null;
    }
  };

  const renderLoginModal = () =>
    license.is_operational &&
    loginOpen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4" onClick={() => setLoginOpen(false)}>
        <form
          onSubmit={handleLogin}
          onClick={(e) => e.stopPropagation()}
          className="win-window w-full max-w-sm overflow-hidden text-xs"
          autoComplete="off"
        >
          <div className="h-8 bg-white border-b border-slate-300 px-3 flex items-center justify-between font-bold text-slate-900">
            <span>تسجيل الدخول / تبديل المستخدم</span>
            <button type="button" onClick={() => setLoginOpen(false)} className="p-1 hover:bg-red-600 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 space-y-3">
            {loginError && <div className="p-2 bg-red-100 text-red-800 border border-red-400 font-semibold">{loginError}</div>}
            <div>
              <label className="block font-bold mb-1">اسم المستخدم</label>
              <input
                type="text"
                required
                autoFocus
                value={loginUser}
                onChange={(e) => setLoginUser(e.target.value)}
                placeholder="أدخل اسم المستخدم"
                className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num"
              />
            </div>
            <div>
              <label className="block font-bold mb-1">كلمة المرور</label>
              <input
                type="password"
                required
                value={loginPass}
                onChange={(e) => setLoginPass(e.target.value)}
                placeholder="أدخل كلمة المرور"
                className="w-full px-2.5 py-1.5 border border-[#7f9db9] bg-white font-mono-num"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button type="submit" className="win-btn flex-1 py-2 font-bold text-blue-950">
                دخول للنظام
              </button>
              <button type="button" onClick={() => setLoginOpen(false)} className="win-btn px-4 py-2 font-bold">
                إلغاء
              </button>
            </div>
          </div>
        </form>
      </div>
    );

  return (
    <div className="relative min-h-screen flex flex-col pb-9 text-slate-900">
      {renderLicenseAlertBanner()}

      {!license.is_operational && <ActivationGateModal license={license} onActivated={loadBootstrap} />}

      {license.is_operational && currentUser && (
        <DashboardHub
          onNavigate={handleNavigate}
          onOpenLogin={() => {
            setLoginError('');
            setLoginUser('');
            setLoginPass('');
            setLoginOpen(true);
          }}
          settings={settings}
          currentUser={currentUser}
          canViewCost={canViewCost}
          isOverlayActive={isOverlayActive}
        />
      )}

      {license.is_operational && currentUser && isOverlayActive && (
        <div
          className="fixed inset-0 bottom-9 z-30 flex items-center justify-center bg-slate-900/25 p-1 sm:p-4"
          onClick={() => setActiveView('dashboard')}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`win-window flex flex-col overflow-hidden ${
              windowMaximized ? 'w-full h-full' : 'w-full max-w-6xl max-h-[calc(100vh-58px)]'
            }`}
          >
            <div className="no-print h-8 bg-white border-b border-slate-300 px-3 flex items-center justify-between select-none shrink-0">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                <span className="px-1.5 h-5 rounded bg-[#0f3d5e] border border-[#0d9488] text-white inline-flex items-center justify-center text-[10px] font-black tracking-tighter">
                  MN
                </span>
                <span>{viewTitles[activeView]}</span>
              </div>

              <div className="flex items-center gap-0.5" dir="ltr">
                <button
                  type="button"
                  onClick={() => setActiveView('dashboard')}
                  title="تصغير للشاشة الرئيسية"
                  className="w-8 h-6 flex items-center justify-center hover:bg-slate-200 text-slate-700"
                >
                  <Minus className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setWindowMaximized(!windowMaximized)}
                  title="تكبير / استعادة"
                  className="w-8 h-6 flex items-center justify-center hover:bg-slate-200 text-slate-700"
                >
                  <Square className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => setActiveView('dashboard')}
                  title="إغلاق (Esc)"
                  className="w-8 h-6 flex items-center justify-center hover:bg-red-600 hover:text-white text-slate-700"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto">{renderActiveErpView()}</div>
          </div>
        </div>
      )}

      {license.is_operational && currentUser && (
        <footer className="no-print fixed bottom-0 inset-x-0 h-9 mina-taskbar border-t text-white px-2 flex items-center justify-between gap-2 z-40 text-xs overflow-x-auto">
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('dashboard')}
              className={`px-2.5 py-1 flex items-center gap-1 font-bold border whitespace-nowrap shrink-0 ${
                activeView === 'dashboard' ? 'mina-taskbar-btn-active text-white' : 'mina-taskbar-btn text-slate-100'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5 text-amber-300" />
              <span>الشاشة الرئيسية</span>
            </button>

            {hasPermission('sales', 'can_view') && (
              <button
                type="button"
                onClick={() => setActiveView('sales')}
                className={`px-2.5 py-1 flex items-center gap-1 font-semibold border whitespace-nowrap shrink-0 ${
                  activeView === 'sales' ? 'mina-taskbar-btn-active' : 'mina-taskbar-btn'
                }`}
              >
                <ReceiptText className="w-3.5 h-3.5 text-sky-300" />
                <span>المبيعات F1</span>
              </button>
            )}

            {hasPermission('purchases', 'can_view') && (
              <button
                type="button"
                onClick={() => setActiveView('purchases')}
                className={`px-2.5 py-1 flex items-center gap-1 font-semibold border whitespace-nowrap shrink-0 ${
                  activeView === 'purchases' ? 'mina-taskbar-btn-active' : 'mina-taskbar-btn'
                }`}
              >
                <ShoppingCart className="w-3.5 h-3.5 text-orange-300" />
                <span>المشتريات F2</span>
              </button>
            )}

            {hasPermission('definitions', 'can_view') && (
              <button
                type="button"
                onClick={() => handleNavigate('definitions', 'products')}
                className={`px-2.5 py-1 flex items-center gap-1 font-semibold border whitespace-nowrap shrink-0 ${
                  activeView === 'definitions' ? 'mina-taskbar-btn-active' : 'mina-taskbar-btn'
                }`}
              >
                <Package className="w-3.5 h-3.5 text-amber-200" />
                <span>الأصناف F3</span>
              </button>
            )}

            {hasPermission('import', 'can_view') && (
              <button
                type="button"
                onClick={() => setActiveView('import')}
                className={`px-2.5 py-1 flex items-center gap-1 font-semibold border whitespace-nowrap shrink-0 ${
                  activeView === 'import' ? 'mina-taskbar-btn-active' : 'mina-taskbar-btn'
                }`}
              >
                <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-300" />
                <span>الاستيراد الذكي F4</span>
              </button>
            )}

            {hasPermission('reports', 'can_view') && (
              <button
                type="button"
                onClick={() => setActiveView('reports')}
                className={`px-2.5 py-1 flex items-center gap-1 font-semibold border whitespace-nowrap shrink-0 ${
                  activeView === 'reports' ? 'mina-taskbar-btn-active' : 'mina-taskbar-btn'
                }`}
              >
                <BarChart3 className="w-3.5 h-3.5 text-blue-300" />
                <span>التقارير F6</span>
              </button>
            )}

            {hasPermission('users', 'can_view') && (
              <button
                type="button"
                onClick={() => handleNavigate('users', 'permissions')}
                className={`px-2.5 py-1 flex items-center gap-1 font-semibold border whitespace-nowrap shrink-0 ${
                  activeView === 'users' ? 'mina-taskbar-btn-active' : 'mina-taskbar-btn'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5 text-amber-300" />
                <span>الصلاحيات</span>
              </button>
            )}

            {hasPermission('settings', 'can_view') && (
              <button
                type="button"
                onClick={() => handleNavigate('settings', 'backup')}
                className={`px-2.5 py-1 flex items-center gap-1 font-semibold border whitespace-nowrap shrink-0 ${
                  activeView === 'settings' ? 'mina-taskbar-btn-active' : 'mina-taskbar-btn'
                }`}
              >
                <DatabaseBackup className="w-3.5 h-3.5 text-slate-200" />
                <span>النسخ الاحتياطي</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!hideDesktopInstallUi && !isDirectMode && (
              <button
                type="button"
                onClick={handleReturnToLanding}
                className="px-2.5 py-1 mina-taskbar-btn border flex items-center gap-1 font-bold whitespace-nowrap shrink-0 text-amber-200"
                title="العودة إلى الصفحة الدعائية وتحميل النسخة التجريبية"
              >
                <Globe className="w-3.5 h-3.5" />
                <span>صفحة العملاء</span>
              </button>
            )}
            {!hideDesktopInstallUi && <PWAInstallButton />}

            <button
              type="button"
              onClick={() => handleNavigate('settings', 'license')}
              className={`px-2.5 py-1 border font-bold whitespace-nowrap shrink-0 ${
                license.is_operational
                  ? 'bg-emerald-800 border-emerald-500 text-white'
                  : 'bg-red-700 border-red-400 text-white'
              }`}
            >
              {license.status === 'ACTIVATED'
                ? 'مرخص'
                : license.is_operational
                ? `تجريبي (${license.days_left} يوم)`
                : 'منتهي — للتفعيل'}
            </button>

            <button
              type="button"
              onClick={() => {
                setLoginError('');
                setLoginUser('');
                setLoginPass('');
                setLoginOpen(true);
              }}
              className="px-2.5 py-1 mina-taskbar-btn border flex items-center gap-1 font-bold whitespace-nowrap shrink-0"
            >
              <LogOut className="w-3.5 h-3.5 text-red-300" />
              <span>{currentUser.username}</span>
            </button>
          </div>
        </footer>
      )}

      <OfflineIndicator />
      {renderLoginModal()}
    </div>
  );
}
