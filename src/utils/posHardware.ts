import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';
import { isDirectDesktopMode } from '../api.ts';

// Web Audio API subtle feedback tones (zero audio file dependencies)
let sharedAudioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return null;
    if (!sharedAudioCtx) sharedAudioCtx = new Ctx();
    if (sharedAudioCtx.state === 'suspended') {
      void sharedAudioCtx.resume();
    }
    return sharedAudioCtx;
  } catch {
    return null;
  }
}

export function playPosBeep(type: 'ok' | 'error' | 'drawer' = 'ok', enabled = true): void {
  if (!enabled) return;
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    if (type === 'ok') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(1480, now);
      gain.gain.setValueAtTime(0.08, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);
      osc.start(now);
      osc.stop(now + 0.09);
    } else if (type === 'drawer') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(1320, now + 0.07);
      gain.gain.setValueAtTime(0.09, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.16);
      osc.start(now);
      osc.stop(now + 0.17);
    } else {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(260, now);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
      osc.start(now);
      osc.stop(now + 0.23);
    }
  } catch {
    // ignore audio restrictions
  }
}

// Generate real scannable barcode SVG string (CODE128 or EAN13)
export function generateBarcodeDataUrl(
  value: string,
  options?: { height?: number; width?: number; displayValue?: boolean; fontSize?: number }
): string {
  const clean = String(value || '').trim();
  if (!clean || typeof document === 'undefined') return '';
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const isEan13 = /^\d{12,13}$/.test(clean);
    JsBarcode(svg, clean, {
      format: isEan13 ? 'EAN13' : 'CODE128',
      width: options?.width ?? 1.8,
      height: options?.height ?? 42,
      displayValue: options?.displayValue ?? false,
      fontSize: options?.fontSize ?? 12,
      margin: 4,
      background: '#ffffff',
      lineColor: '#000000',
    });
    const xml = new XMLSerializer().serializeToString(svg);
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
  } catch {
    try {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      JsBarcode(svg, clean, {
        format: 'CODE128',
        width: options?.width ?? 1.6,
        height: options?.height ?? 42,
        displayValue: options?.displayValue ?? false,
        margin: 4,
        background: '#ffffff',
        lineColor: '#000000',
      });
      const xml = new XMLSerializer().serializeToString(svg);
      return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`;
    } catch {
      return '';
    }
  }
}

export function generateRandomEan13(): string {
  const prefix = '622'; // Egypt / local retail GS1 prefix
  let body = prefix;
  for (let i = 0; i < 9; i++) {
    body += Math.floor(Math.random() * 10);
  }
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += Number(body[i]) * (i % 2 === 0 ? 1 : 3);
  }
  const check = (10 - (sum % 10)) % 10;
  return `${body}${check}`;
}

export async function generateQrDataUrl(text: string, width = 220): Promise<string> {
  const clean = String(text || '').trim();
  if (!clean) return '';
  try {
    return await QRCode.toDataURL(clean, {
      width,
      margin: 1,
      color: { dark: '#0f172a', light: '#ffffff' },
    });
  } catch {
    return '';
  }
}

// =========================================================
// WebSerial & WebUSB POS Hardware Integration (Chrome / Edge)
// =========================================================
interface SerialPortLike {
  open(opts: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
  getInfo?(): { usbVendorId?: number; usbProductId?: number };
}

interface UsbDeviceLike {
  open(): Promise<void>;
  selectConfiguration(config: number): Promise<void>;
  claimInterface(iface: number): Promise<void>;
  transferOut(endpointNumber: number, data: BufferSource): Promise<unknown>;
  configuration?: {
    interfaces: Array<{
      interfaceNumber: number;
      alternates: Array<{
        endpoints: Array<{ endpointNumber: number; direction: string }>;
      }>;
    }>;
  };
  productName?: string;
}

let activeSerialPrinterPort: SerialPortLike | null = null;
let activeUsbPrinterDevice: UsbDeviceLike | null = null;
let activeSerialScannerReader: ReadableStreamDefaultReader<Uint8Array> | null = null;
let activeSerialScannerPort: SerialPortLike | null = null;

export const ESC_POS_DRAWER_KICK = new Uint8Array([
  0x1b, 0x70, 0x00, 0x19, 0xfa,
  0x1b, 0x70, 0x01, 0x19, 0xfa,
]);

export function hasWebSerialSupport(): boolean {
  return typeof navigator !== 'undefined' && 'serial' in navigator;
}

export function hasWebUsbSupport(): boolean {
  return typeof navigator !== 'undefined' && 'usb' in navigator;
}

export async function connectSerialPrinter(baudRate = 9600): Promise<{ ok: boolean; label?: string; error?: string }> {
  if (!hasWebSerialSupport()) {
    return { ok: false, error: 'متصفحك لا يدعم Web Serial؛ استخدم جوجل كروم أو مايكروسوفت إيدج أو طابعة الويندوز الافتراضية.' };
  }
  try {
    const navSerial = (navigator as unknown as { serial: { requestPort: () => Promise<SerialPortLike> } }).serial;
    const port = await navSerial.requestPort();
    await port.open({ baudRate });
    activeSerialPrinterPort = port;
    return { ok: true, label: 'تم ربط الطابعة / الدرج عبر منفذ Serial/COM بنجاح' };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message || 'تم إلغاء اختيار منفذ الطابعة' };
  }
}

export async function connectUsbPrinter(): Promise<{ ok: boolean; label?: string; error?: string }> {
  if (!hasWebUsbSupport()) {
    return { ok: false, error: 'متصفحك لا يدعم WebUSB المباشر' };
  }
  try {
    const navUsb = (navigator as unknown as { usb: { requestDevice: (opts: { filters: unknown[] }) => Promise<UsbDeviceLike> } }).usb;
    const device = await navUsb.requestDevice({ filters: [] });
    await device.open();
    if (!device.configuration) {
      await device.selectConfiguration(1);
    }
    const iface = device.configuration?.interfaces[0];
    if (iface) {
      await device.claimInterface(iface.interfaceNumber);
    }
    activeUsbPrinterDevice = device;
    return { ok: true, label: `تم ربط طابعة USB: ${device.productName || 'Thermal Printer'}` };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message || 'لم يتم تحديد طابعة USB' };
  }
}

export async function connectSerialBarcodeScanner(
  onScan: (barcode: string) => void,
  baudRate = 9600
): Promise<{ ok: boolean; error?: string }> {
  if (!hasWebSerialSupport()) {
    return { ok: false, error: 'متصفحك لا يدعم قراءة منفذ COM/Serial؛ قارئات USB/Bluetooth العادية تعمل تلقائياً بدون ربط!' };
  }
  try {
    if (activeSerialScannerReader) {
      try {
        await activeSerialScannerReader.cancel();
      } catch {
        // ignore
      }
      activeSerialScannerReader = null;
    }
    if (activeSerialScannerPort) {
      try {
        await activeSerialScannerPort.close();
      } catch {
        // ignore
      }
    }
    const navSerial = (navigator as unknown as { serial: { requestPort: () => Promise<SerialPortLike> } }).serial;
    const port = await navSerial.requestPort();
    await port.open({ baudRate });
    activeSerialScannerPort = port;
    if (port.readable) {
      const reader = port.readable.getReader();
      activeSerialScannerReader = reader;
      const decoder = new TextDecoder();
      let buffer = '';
      void (async () => {
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value) {
              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split(/[\r\n]+/);
              buffer = lines.pop() || '';
              for (const line of lines) {
                const clean = line.trim();
                if (clean.length >= 2) {
                  onScan(clean);
                }
              }
            }
          }
        } catch {
          // port disconnected
        }
      })();
    }
    return { ok: true };
  } catch (err: unknown) {
    return { ok: false, error: (err as Error).message || 'تعذر الاتصال بقارئ الباركود السيريال' };
  }
}

async function sendBytesOverWebHardware(bytes: Uint8Array): Promise<boolean> {
  if (activeSerialPrinterPort?.writable) {
    const writer = activeSerialPrinterPort.writable.getWriter();
    try {
      await writer.write(bytes);
      return true;
    } finally {
      writer.releaseLock();
    }
  }
  if (activeUsbPrinterDevice) {
    const iface = activeUsbPrinterDevice.configuration?.interfaces[0];
    const outEp = iface?.alternates[0]?.endpoints.find((ep) => ep.direction === 'out');
    if (outEp) {
      await activeUsbPrinterDevice.transferOut(outEp.endpointNumber, bytes.buffer as ArrayBuffer);
      return true;
    }
  }
  return false;
}

export async function triggerCashDrawer(settings: Record<string, string>): Promise<{ ok: boolean; channel: string; error?: string }> {
  // 1. Try connected WebSerial or WebUSB hardware directly first
  try {
    const sentWeb = await sendBytesOverWebHardware(ESC_POS_DRAWER_KICK);
    if (sentWeb) {
      playPosBeep('drawer', settings.pos_scan_beep !== '0');
      return { ok: true, channel: 'WEB_SERIAL_USB' };
    }
  } catch {
    // fall through to Windows backend bridge
  }

  // 2. If running on local Node / Windows Desktop EXE, call backend raw bridge (TCP 9100 or Win32 Spooler)
  if (!isDirectDesktopMode()) {
    try {
      const resp = await fetch('/api/hardware/cash-drawer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: settings.pos_printer_target || '' }),
      });
      const data = (await resp.json()) as { ok?: boolean; channel?: string; error?: string };
      if (resp.ok && data.ok) {
        playPosBeep('drawer', settings.pos_scan_beep !== '0');
        return { ok: true, channel: data.channel || 'WINDOWS_BRIDGE' };
      }
      return { ok: false, channel: 'NONE', error: data.error || 'تعذر فتح درج النقدية' };
    } catch (err: unknown) {
      return { ok: false, channel: 'NONE', error: (err as Error).message };
    }
  }

  return {
    ok: false,
    channel: 'DIRECT_BROWSER',
    error: 'في وضع HTML المباشر، اربط طابعة الكاشير عبر زر (ربط USB/Serial) من الإعدادات أو استخدم نسخة التثبيت (.exe) للطباعة عبر الويندوز تلقائياً.',
  };
}

export async function fetchInstalledWindowsPrinters(): Promise<Array<{ Name: string; DriverName?: string; PortName?: string }>> {
  if (isDirectDesktopMode()) return [];
  try {
    const resp = await fetch('/api/hardware/printers');
    if (!resp.ok) return [];
    const data = (await resp.json()) as { printers?: Array<{ Name: string; DriverName?: string; PortName?: string }> };
    return data.printers || [];
  } catch {
    return [];
  }
}
