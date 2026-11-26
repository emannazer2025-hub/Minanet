import express from 'express';
import net from 'net';
import fs from 'fs';
import { execFile } from 'child_process';

// Standard ESC/POS Cash Drawer kick pulse (pin 2 & pin 5)
const DRAWER_KICK_BYTES = Buffer.from([
  0x1b, 0x70, 0x00, 0x19, 0xfa,
  0x1b, 0x70, 0x01, 0x19, 0xfa,
]);

function sendTcpRaw(host: string, port: number, payload: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    socket.setTimeout(2500);
    socket.connect(port, host, () => {
      socket.write(payload, () => {
        if (!settled) {
          settled = true;
          socket.end();
          resolve();
        }
      });
    });
    socket.on('timeout', () => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new Error(`انتهت مهلة الاتصال بالطابعة على ${host}:${port}`));
      }
    });
    socket.on('error', (err) => {
      if (!settled) {
        settled = true;
        socket.destroy();
        reject(new Error(`تعذر الاتصال بالطابعة (${host}:${port}): ${err.message}`));
      }
    });
  });
}

function sendWindowsRawSpooler(printerName: string, payload: Buffer): Promise<void> {
  return new Promise((resolve, reject) => {
    if (process.platform !== 'win32') {
      reject(new Error('إرسال أوامر الطابعة المباشرة عبر أسماء الويندوز يتطلب تشغيل نسخة الويندوز المحلية'));
      return;
    }
    const safePrinter = printerName.replace(/'/g, "''").trim();
    const b64 = payload.toString('base64');
    const psScript = `
$ErrorActionPreference = 'Stop'
$printerName = '${safePrinter}'
$bytes = [Convert]::FromBase64String('${b64}')
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class MinaRawPrint {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true, CharSet=CharSet.Ansi)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
  public static void SendBytes(string name, byte[] data) {
    IntPtr h;
    if (!OpenPrinter(name, out h, IntPtr.Zero)) throw new Exception("OpenPrinter failed");
    try {
      var di = new DOCINFOA { pDocName = "MinaNet POS", pDataType = "RAW" };
      if (!StartDocPrinter(h, 1, di)) throw new Exception("StartDocPrinter failed");
      try {
        StartPagePrinter(h);
        IntPtr p = Marshal.AllocCoTaskMem(data.Length);
        try {
          Marshal.Copy(data, 0, p, data.Length);
          int written = 0;
          if (!WritePrinter(h, p, data.Length, out written)) throw new Exception("WritePrinter failed");
        } finally {
          Marshal.FreeCoTaskMem(p);
          EndPagePrinter(h);
        }
      } finally {
        EndDocPrinter(h);
      }
    } finally {
      ClosePrinter(h);
    }
  }
}
"@
if (-not $printerName) {
  $printerName = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name)
}
if (-not $printerName) { throw "لا توجد طابعة افتراضية معرفة في الويندوز" }
[MinaRawPrint]::SendBytes($printerName, $bytes)
`;
    execFile('powershell', ['-NoProfile', '-NonInteractive', '-Command', psScript], { timeout: 5000 }, (err, _stdout, stderr) => {
      if (err) {
        reject(new Error(stderr?.trim() || err.message || 'فشل الإرسال إلى طابعة الويندوز'));
      } else {
        resolve();
      }
    });
  });
}

async function dispatchEscPosPayload(target: string, payload: Buffer): Promise<{ channel: string }> {
  const cleanTarget = String(target || '').trim();
  const ipMatch = cleanTarget.match(/^(\d{1,3}(?:\.\d{1,3}){3})(?::(\d{1,5}))?$/);
  if (ipMatch) {
    const host = ipMatch[1];
    const port = Number(ipMatch[2] || 9100);
    await sendTcpRaw(host, port, payload);
    return { channel: `TCP:${host}:${port}` };
  }

  if (/^(COM|LPT)\d+$/i.test(cleanTarget) && process.platform === 'win32') {
    fs.writeFileSync(`\\\\.\\${cleanTarget.toUpperCase()}`, payload);
    return { channel: cleanTarget.toUpperCase() };
  }

  await sendWindowsRawSpooler(cleanTarget, payload);
  return { channel: cleanTarget || 'WINDOWS_DEFAULT_PRINTER' };
}

export function createHardwareBridgeRouter(): express.Router {
  const router = express.Router();

  router.get('/hardware/printers', (_req, res) => {
    if (process.platform !== 'win32') {
      return res.json({
        platform: process.platform,
        printers: [],
        note: 'يعمل الاكتشاف التلقائي لطابعات الويندوز عند تشغيل البرنامج على جهاز ويندوز، أو استخدم طابعة الشبكة (IP:9100) أو ربط USB/Serial المباشر.',
      });
    }
    execFile(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', 'Get-Printer | Select-Object Name,DriverName,PortName,PrinterStatus | ConvertTo-Json -Compress'],
      { timeout: 3500 },
      (err, stdout) => {
        if (err || !stdout.trim()) {
          return res.json({ platform: 'win32', printers: [] });
        }
        try {
          const parsed = JSON.parse(stdout.trim());
          const list = Array.isArray(parsed) ? parsed : [parsed];
          res.json({ platform: 'win32', printers: list });
        } catch {
          res.json({ platform: 'win32', printers: [] });
        }
      }
    );
  });

  router.post('/hardware/cash-drawer', async (req, res) => {
    try {
      const { target } = (req.body || {}) as { target?: string };
      const result = await dispatchEscPosPayload(String(target || ''), DRAWER_KICK_BYTES);
      res.json({ ok: true, ...result, message: 'تم إرسال أمر فتح درج النقدية بنجاح' });
    } catch (err: unknown) {
      res.status(400).json({ ok: false, error: (err as Error).message });
    }
  });

  router.post('/hardware/print-escpos', async (req, res) => {
    try {
      const { target, rawBase64 } = (req.body || {}) as { target?: string; rawBase64?: string };
      if (!rawBase64) return res.status(400).json({ ok: false, error: 'بيانات الطباعة فارغة' });
      const payload = Buffer.from(rawBase64, 'base64');
      const result = await dispatchEscPosPayload(String(target || ''), payload);
      res.json({ ok: true, ...result, message: 'تم إرسال أمر الطباعة الحرارية المباشرة' });
    } catch (err: unknown) {
      res.status(400).json({ ok: false, error: (err as Error).message });
    }
  });

  return router;
}
