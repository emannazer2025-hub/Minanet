import React, { useEffect, useState } from 'react';
import { Download, MonitorDown, WifiOff } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

export const PWAInstallButton: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    const isStandalone =
      window.location.protocol === 'file:' ||
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsInstalled(isStandalone);

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setShowGuide(false);
    };

    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const handleInstallBrowserApp = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        setIsInstalled(true);
        setDeferredPrompt(null);
        setShowGuide(false);
      }
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setShowGuide(true)}
        title="تحميل ملف تثبيت البرنامج لويندوز (MINA_NET_SETUP.exe) متوافق مع جميع الإصدارات"
        className="px-2.5 py-1 bg-[#2b529a] border border-[#7aa2eb] hover:bg-[#3664b8] text-white flex items-center gap-1 font-bold whitespace-nowrap cursor-pointer"
      >
        <MonitorDown className="w-3.5 h-3.5 text-amber-300" />
        <span>تثبيت لويندوز (Setup .exe)</span>
      </button>

      {showGuide && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
          onClick={() => setShowGuide(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="win-window w-full max-w-lg overflow-hidden text-xs text-slate-900"
          >
            <div className="h-8 bg-white border-b border-slate-300 px-3 flex items-center justify-between font-bold">
              <span>تحميل وتثبيت Mina Net على جميع إصدارات ويندوز</span>
              <button
                type="button"
                onClick={() => setShowGuide(false)}
                className="px-2 py-0.5 hover:bg-red-600 hover:text-white cursor-pointer"
              >
                ×
              </button>
            </div>
            <div className="p-4 space-y-3 leading-relaxed">
              <div className="bg-blue-50 border border-blue-300 p-3 space-y-2.5">
                <p className="font-bold text-blue-950">
                  ملف التثبيت الشامل للكمبيوتر (Windows XP / 7 / 8 / 8.1 / 10 / 11 — 32 و 64 بت):
                </p>
                <div className="flex flex-wrap gap-2">
                  <a
                    href="/api/desktop/download-setup-exe"
                    download="MINA_NET_SETUP.exe"
                    className="flex items-center gap-1.5 px-3.5 py-2 font-bold text-white bg-[#214283] border border-[#12264d] hover:brightness-110"
                  >
                    <Download className="w-4 h-4 text-amber-300" />
                    تحميل ملف التثبيت لويندوز (MINA_NET_SETUP.exe)
                  </a>
                  <a
                    href="/api/desktop/download-zip"
                    download="MINA_NET_ERP_CLIENT.zip"
                    className="win-btn flex items-center gap-1.5 px-3 py-2 font-bold text-blue-950"
                  >
                    <Download className="w-4 h-4 text-blue-800" />
                    نسخة محمولة (.zip)
                  </a>
                  <a
                    href="/api/desktop/download-direct-html"
                    download="MINA_NET_DIRECT.html"
                    className="win-btn flex items-center gap-1.5 px-3 py-2 font-bold text-emerald-950"
                  >
                    <Download className="w-4 h-4 text-emerald-800" />
                    فتح مباشر (.html)
                  </a>
                </div>
              </div>

              <ol className="list-decimal pr-5 space-y-1.5">
                <li>
                  <strong>التثبيت بنقرة واحدة:</strong> شغّل <strong>MINA_NET_SETUP.exe</strong> واضغط <strong>نعم</strong>، ليقوم بفك الملفات تلقائياً وإنشاء أيقونة <strong>Mina Net ERP</strong> على سطح المكتب وقائمة ابدأ وتشغيل البرنامج فوراً (بدون صلاحيات أدمن وبدون الحاجة لـ Node.js).
                </li>
                <li>
                  أو للتثبيت المباشر من المتصفح الآن:
                  {deferredPrompt ? (
                    <button
                      type="button"
                      onClick={handleInstallBrowserApp}
                      className="win-btn mr-2 px-2.5 py-0.5 font-bold text-blue-950"
                    >
                      تثبيت كنافذة ديسكتوب الآن
                    </button>
                  ) : (
                    <span> من قائمة المتصفح <span dir="ltr">⋮ → Apps → Install Mina Net</span>.</span>
                  )}
                </li>
              </ol>
              <div className="pt-1 flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowGuide(false)}
                  className="win-btn px-4 py-1.5 font-bold"
                >
                  إغلاق
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const OfflineIndicator: React.FC = () => {
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    const on = () => setIsOnline(true);
    const off = () => setIsOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="no-print fixed bottom-11 left-3 z-50 flex items-center gap-1.5 bg-amber-600 text-white px-3 py-1.5 text-xs font-bold border border-amber-800 shadow-lg">
      <WifiOff className="w-3.5 h-3.5" />
      <span>وضع عدم الاتصال — يتم استخدام الملفات المخزنة مؤقتاً</span>
    </div>
  );
};
