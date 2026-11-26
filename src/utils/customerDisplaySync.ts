import type { CustomerDisplayState, PromoSlide } from '../types.ts';

const CHANNEL_NAME = 'mina_net_customer_display_v1';
const STORAGE_KEY = 'mina_net_customer_display_state_v1';

let broadcastChannel: BroadcastChannel | null = null;
let customerWindowRef: Window | null = null;

function getChannel(): BroadcastChannel | null {
  try {
    if (typeof BroadcastChannel === 'undefined') return null;
    if (!broadcastChannel) {
      broadcastChannel = new BroadcastChannel(CHANNEL_NAME);
    }
    return broadcastChannel;
  } catch {
    return null;
  }
}

export function getDefaultPromoSlides(companyName: string): PromoSlide[] {
  return [
    {
      id: 'default-1',
      title: `أهلاً بكم في ${companyName || 'Mina Net'}`,
      subtitle: 'جودة مضمونة · أسعار تنافسية · خدمة عملاء متميزة',
      badge: 'مرحباً بكم',
      mediaType: 'image',
      mediaUrl: '',
    },
    {
      id: 'default-2',
      title: 'عروض وخصومات يومية على المنتجات المختارة',
      subtitle: 'اسأل الكاشير عن عروض اليوم ونظام النقاط والخصومات الخاصة',
      badge: 'عروض اليوم',
      mediaType: 'image',
      mediaUrl: '',
    },
  ];
}

export function parsePromoSlides(jsonStr: string | undefined, companyName: string): PromoSlide[] {
  try {
    const parsed = JSON.parse(String(jsonStr || '[]')) as PromoSlide[];
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {
    // fallback
  }
  return getDefaultPromoSlides(companyName);
}

export function publishCustomerDisplayState(state: CustomerDisplayState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore quota errors
  }
  try {
    getChannel()?.postMessage(state);
  } catch {
    // ignore channel errors
  }
}

export function readCustomerDisplayState(): CustomerDisplayState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as CustomerDisplayState;
  } catch {
    return null;
  }
}

export function subscribeCustomerDisplayState(onUpdate: (state: CustomerDisplayState) => void): () => void {
  const ch = getChannel();
  const handleBc = (ev: MessageEvent) => {
    if (ev.data && typeof ev.data === 'object') {
      onUpdate(ev.data as CustomerDisplayState);
    }
  };
  const handleStorage = (ev: StorageEvent) => {
    if (ev.key === STORAGE_KEY && ev.newValue) {
      try {
        onUpdate(JSON.parse(ev.newValue) as CustomerDisplayState);
      } catch {
        // ignore parse errors
      }
    }
  };
  if (ch) ch.addEventListener('message', handleBc);
  window.addEventListener('storage', handleStorage);
  return () => {
    if (ch) ch.removeEventListener('message', handleBc);
    window.removeEventListener('storage', handleStorage);
  };
}

export function buildCustomerDisplayUrl(): string {
  try {
    const isFile = window.location.protocol === 'file:';
    if (isFile) {
      const url = new URL(window.location.href);
      url.searchParams.set('customer-display', '1');
      return url.toString();
    }
    return `${window.location.origin}/customer-display`;
  } catch {
    return '/customer-display';
  }
}

export interface ExtendedScreenInfo {
  hasExtendedScreen: boolean;
  secondaryScreen?: { left: number; top: number; width: number; height: number; label?: string };
}

export async function detectSecondaryScreen(): Promise<ExtendedScreenInfo> {
  const basicExtended = Boolean((window.screen as unknown as { isExtended?: boolean }).isExtended);
  try {
    const winWithScreens = window as unknown as {
      getScreenDetails?: () => Promise<{
        screens: Array<{
          isPrimary: boolean;
          availLeft: number;
          availTop: number;
          availWidth: number;
          availHeight: number;
          left: number;
          top: number;
          width: number;
          height: number;
          label?: string;
        }>;
      }>;
    };
    if (typeof winWithScreens.getScreenDetails === 'function') {
      const details = await winWithScreens.getScreenDetails();
      const secondary = details.screens.find((s) => !s.isPrimary) || (details.screens.length > 1 ? details.screens[1] : undefined);
      if (secondary) {
        return {
          hasExtendedScreen: true,
          secondaryScreen: {
            left: secondary.left ?? secondary.availLeft ?? window.screen.availWidth,
            top: secondary.top ?? secondary.availTop ?? 0,
            width: secondary.width || secondary.availWidth || 1280,
            height: secondary.height || secondary.availHeight || 720,
            label: secondary.label,
          },
        };
      }
      return { hasExtendedScreen: details.screens.length > 1 };
    }
  } catch {
    // Permission not granted yet or unsupported; fallback to window.screen.isExtended
  }
  return {
    hasExtendedScreen: basicExtended,
    secondaryScreen: basicExtended
      ? {
          left: window.screen.availWidth || 1366,
          top: 0,
          width: window.screen.width || 1280,
          height: window.screen.height || 720,
        }
      : undefined,
  };
}

export function isCustomerDisplayWindowOpen(): boolean {
  return Boolean(customerWindowRef && !customerWindowRef.closed);
}

export async function openCustomerDisplayWindow(autoOnlyIfExtended = false): Promise<{
  opened: boolean;
  onSecondMonitor: boolean;
  reason?: string;
}> {
  const info = await detectSecondaryScreen();
  if (autoOnlyIfExtended && !info.hasExtendedScreen) {
    return { opened: false, onSecondMonitor: false, reason: 'NO_SECOND_MONITOR' };
  }

  if (customerWindowRef && !customerWindowRef.closed) {
    customerWindowRef.focus();
    return { opened: true, onSecondMonitor: info.hasExtendedScreen };
  }

  const url = buildCustomerDisplayUrl();
  const sec = info.secondaryScreen;
  const features = sec
    ? `popup=yes,left=${sec.left},top=${sec.top},width=${sec.width},height=${sec.height},menubar=no,toolbar=no,location=no,status=no`
    : `popup=yes,width=1280,height=720,menubar=no,toolbar=no,location=no,status=no`;

  const win = window.open(url, 'MinaNetCustomerDisplay', features);
  if (!win) {
    return {
      opened: false,
      onSecondMonitor: info.hasExtendedScreen,
      reason: 'BLOCKED_POPUP',
    };
  }
  customerWindowRef = win;
  try {
    if (sec) {
      win.moveTo(sec.left, sec.top);
      win.resizeTo(sec.width, sec.height);
    }
  } catch {
    // cross-origin/window restrictions ignored
  }
  return { opened: true, onSecondMonitor: info.hasExtendedScreen };
}
