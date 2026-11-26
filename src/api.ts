let activeUserId = 1;

export function setApiUserId(id: number) {
  activeUserId = id;
}

export function isDirectDesktopMode(): boolean {
  if (typeof window === 'undefined') return false;
  const envFlag = import.meta.env.VITE_DIRECT_STANDALONE === 'true';
  return window.location.protocol === 'file:' || envFlag;
}

export async function apiFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-User-Id': String(activeUserId),
    ...((options.headers as Record<string, string>) || {}),
  };

  if (isDirectDesktopMode()) {
    const { dispatchLocalApi } = await import('./desktop/localDesktopRouter.ts');
    const localRes = await dispatchLocalApi(url, { ...options, headers });
    if (localRes.statusCode >= 400) {
      const errObj = (localRes.body || {}) as { error?: string };
      throw new Error(errObj.error || `حدث خطأ غير متوقع (${localRes.statusCode})`);
    }
    return localRes.body as T;
  }

  const res = await fetch(url, { ...options, headers });
  const contentType = res.headers.get('content-type') || '';

  if (!res.ok) {
    if (contentType.includes('application/json')) {
      const errJson = await res.json();
      throw new Error(errJson.error || 'حدث خطأ غير متوقع في الخادم');
    }
    throw new Error(`خطأ في الاتصال بالخادم (${res.status})`);
  }

  if (contentType.includes('application/json')) {
    return (await res.json()) as T;
  }
  return (await res.text()) as unknown as T;
}

export async function downloadApiFile(url: string, fallbackName: string, options: RequestInit = {}): Promise<void> {
  if (isDirectDesktopMode()) {
    const { dispatchLocalApi } = await import('./desktop/localDesktopRouter.ts');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-User-Id': String(activeUserId),
      ...((options.headers as Record<string, string>) || {}),
    };
    const localRes = await dispatchLocalApi(url, { ...options, headers });
    if (localRes.statusCode >= 400) {
      const errObj = (localRes.body || {}) as { error?: string };
      throw new Error(errObj.error || 'تعذر تنزيل الملف');
    }
    const raw = localRes.body;
    const blobPart: BlobPart =
      raw instanceof Uint8Array
        ? new Uint8Array(raw)
        : typeof raw === 'string'
        ? raw
        : JSON.stringify(raw, null, 2);
    const blob = new Blob([blobPart], {
      type: localRes.headers['content-type'] || 'application/octet-stream',
    });
    const objUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objUrl;
    a.download = localRes.downloadName || fallbackName;
    a.click();
    URL.revokeObjectURL(objUrl);
    return;
  }

  if (!options.method || options.method.toUpperCase() === 'GET') {
    const a = document.createElement('a');
    a.href = url;
    a.download = fallbackName;
    a.click();
    return;
  }

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': String(activeUserId),
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const blob = await res.blob();
  const objUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objUrl;
  a.download = fallbackName;
  a.click();
  URL.revokeObjectURL(objUrl);
}

export async function fetchApiBinaryBytes(url: string): Promise<Uint8Array> {
  if (isDirectDesktopMode()) {
    const { dispatchLocalApi } = await import('./desktop/localDesktopRouter.ts');
    const localRes = await dispatchLocalApi(url, {
      method: 'GET',
      headers: { 'X-User-Id': String(activeUserId) },
    });
    if (localRes.statusCode >= 400) {
      throw new Error('تعذر قراءة ملف النسخة الاحتياطية');
    }
    const raw = localRes.body;
    if (raw instanceof Uint8Array) return new Uint8Array(raw);
    if (typeof raw === 'string') return new TextEncoder().encode(raw);
    return new TextEncoder().encode(JSON.stringify(raw));
  }

  const res = await fetch(url, {
    headers: { 'X-User-Id': String(activeUserId) },
  });
  if (!res.ok) {
    throw new Error(`تعذر قراءة الملف (${res.status})`);
  }
  const ab = await res.arrayBuffer();
  return new Uint8Array(ab);
}

export function formatMoney(val: number | string | undefined | null, currency = 'ج.م.'): string {
  const num = Number(val || 0);
  return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}

export function formatNum(val: number | string | undefined | null): string {
  const num = Number(val || 0);
  return num.toLocaleString('en-US', { maximumFractionDigits: 3 });
}

export function todayDateStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function nowDateTimeStr(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
