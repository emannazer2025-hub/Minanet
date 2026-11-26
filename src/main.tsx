import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import {
  applyMinaIndustry,
  applyMinaLayout,
  applyMinaTheme,
  getInitialIndustryId,
  getInitialLayoutId,
  getInitialThemeId,
} from './themes.ts';

applyMinaLayout(getInitialLayoutId(), false);
applyMinaTheme(getInitialThemeId(), false);
applyMinaIndustry(getInitialIndustryId(), false);

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMsg: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMsg: '' };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, errorMsg: error?.message || 'حدث خطأ غير متوقع في واجهة البرنامج' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#1b2b4b] p-4 text-slate-900" dir="rtl">
          <div className="max-w-md w-full bg-[#ece9d8] border-2 border-red-800 p-5 space-y-3 text-xs">
            <h2 className="font-bold text-sm text-red-900">حدث خطأ أثناء تشغيل Mina Net</h2>
            <p className="font-semibold">{this.state.errorMsg}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="px-4 py-1.5 bg-white border border-slate-600 font-bold"
            >
              إعادة تحميل البرنامج
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const rootEl = document.getElementById('root')!;
createRoot(rootEl).render(
  <AppErrorBoundary>
    <App />
  </AppErrorBoundary>
);
rootEl.setAttribute('data-mina-mounted', '1');

