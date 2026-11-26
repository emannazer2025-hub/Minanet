import { createRoot } from 'react-dom/client';
import { KeyRound } from 'lucide-react';
import './index.css';
import { LicenseManagerView } from './pages/LicenseManagerView.tsx';

function StandaloneLicenseApp() {
  return (
    <div className="mina-desktop-bg min-h-screen flex items-center justify-center p-2 sm:p-6">
      <div className="win-window w-full max-w-6xl overflow-hidden shadow-2xl">
        {/* Standalone Windows Title Bar */}
        <div className="no-print h-9 bg-white border-b border-slate-300 px-3 flex items-center justify-between select-none">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
            <span className="w-5 h-5 rounded-xs bg-[#214283] text-white inline-flex items-center justify-center">
              <KeyRound className="w-3.5 h-3.5 text-amber-300" />
            </span>
            <span>Mina Net License Manager — أداة إصدار وإدارة التراخيص المستقلة (اسامه جرجس · 01153672084)</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[11px] font-mono-num text-slate-600 font-semibold hidden sm:inline">
              Ed25519 Offline Licensing Utility
            </span>
            <a href="/" className="win-btn px-2.5 py-0.5 text-[11px] font-bold text-slate-900">
              العودة للبرنامج
            </a>
          </div>
        </div>

        <div className="max-h-[calc(100vh-80px)] overflow-y-auto">
          <LicenseManagerView />
        </div>
      </div>
    </div>
  );
}

createRoot(document.getElementById('license-root')!).render(<StandaloneLicenseApp />);
