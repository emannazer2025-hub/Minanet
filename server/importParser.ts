import * as XLSX from 'xlsx';

export interface ParsedSheet {
  name: string;
  rows: string[][];
}

export interface ColumnMapping {
  code: number | null;
  name: number | null;
  alt_name: number | null;
  barcode: number | null;
  category: number | null;
  unit: number | null;
  purchase_price: number | null;
  sale_price: number | null;
  wholesale_price: number | null;
  special_price: number | null;
  quantity: number | null;
  min_stock: number | null;
  reorder_level: number | null;
  notes: number | null;
}

export const TARGET_FIELDS: Array<{ key: keyof ColumnMapping; label: string; required?: boolean }> = [
  { key: 'name', label: 'اسم الصنف', required: true },
  { key: 'code', label: 'كود الصنف' },
  { key: 'barcode', label: 'الباركود' },
  { key: 'category', label: 'الفئة / التصنيف' },
  { key: 'unit', label: 'الوحدة' },
  { key: 'purchase_price', label: 'سعر الشراء / التكلفة' },
  { key: 'sale_price', label: 'سعر البيع (المستهلك)' },
  { key: 'wholesale_price', label: 'سعر الجملة' },
  { key: 'special_price', label: 'سعر خاص' },
  { key: 'quantity', label: 'الكمية / الرصيد الافتتاحي' },
  { key: 'min_stock', label: 'الحد الأدنى' },
  { key: 'reorder_level', label: 'حد إعادة الطلب' },
  { key: 'alt_name', label: 'الاسم البديل' },
  { key: 'notes', label: 'ملاحظات' },
];

const SYNONYMS: Record<keyof ColumnMapping, string[]> = {
  name: ['اسم الصنف', 'الصنف', 'البيان', 'المنتج', 'اسم المنتج', 'اسم', 'item', 'item name', 'product', 'product name', 'name', 'description'],
  code: ['كود الصنف', 'الكود', 'رقم الصنف', 'كود', 'رمز الصنف', 'code', 'sku', 'item code', 'product code', 'id'],
  alt_name: ['الاسم البديل', 'اسم بديل', 'اسم انجليزي', 'alt name', 'english name'],
  barcode: ['الباركود', 'باركود', 'رقم الباركود', 'barcode', 'ean', 'upc', 'gtin'],
  category: ['الفئة', 'التصنيف', 'المجموعة', 'فئة', 'تصنيف', 'category', 'group', 'dept'],
  unit: ['الوحدة', 'وحدة', 'وحدة القياس', 'unit', 'uom'],
  purchase_price: ['سعر الشراء', 'التكلفة', 'سعر التكلفة', 'شراء', 'تكلفة', 'purchase price', 'cost', 'buy price', 'cost price'],
  sale_price: ['سعر البيع', 'سعر المستهلك', 'البيع', 'السعر', 'بيع', 'sale price', 'retail price', 'price', 'selling price'],
  wholesale_price: ['سعر الجملة', 'الجملة', 'جملة', 'wholesale', 'wholesale price'],
  special_price: ['سعر خاص', 'نصف جملة', 'special price', 'half wholesale'],
  quantity: ['الكمية', 'الرصيد', 'رصيد', 'كمية', 'رصيد البداية', 'qty', 'quantity', 'stock', 'balance', 'opening stock'],
  min_stock: ['الحد الأدنى', 'حد ادنى', 'min stock', 'minimum'],
  reorder_level: ['حد الطلب', 'حد إعادة الطلب', 'reorder', 'reorder level'],
  notes: ['ملاحظات', 'وصف', 'notes', 'note', 'remarks'],
};

function normalizeHeader(h: string): string {
  return String(h || '')
    .trim()
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ');
}

function decodeSmartText(buf: Buffer): string {
  // Try UTF-8 first; if replacement character appears, decode with windows-1256 (Arabic)
  const utf8 = buf.toString('utf-8');
  if (!utf8.includes('\uFFFD')) {
    return utf8.replace(/^\uFEFF/, '');
  }
  try {
    const decoder = new TextDecoder('windows-1256');
    return decoder.decode(buf);
  } catch {
    return utf8;
  }
}

export function parseDbfBuffer(buf: Buffer): ParsedSheet[] {
  if (buf.length < 32) {
    throw new Error('ملف DBF غير صالح أو تالف');
  }
  const numRecords = buf.readUInt32LE(4);
  const headerLength = buf.readUInt16LE(8);
  const recordLength = buf.readUInt16LE(10);

  const fields: Array<{ name: string; type: string; length: number }> = [];
  let offset = 32;
  while (offset < headerLength - 1 && offset + 32 <= buf.length) {
    if (buf[offset] === 0x0d) break;
    const rawName = buf.subarray(offset, offset + 11);
    const nullIdx = rawName.indexOf(0);
    const name = decodeSmartText(rawName.subarray(0, nullIdx >= 0 ? nullIdx : 11)).trim();
    const type = String.fromCharCode(buf[offset + 11]);
    const length = buf[offset + 16];
    fields.push({ name, type, length });
    offset += 32;
  }

  const rows: string[][] = [];
  rows.push(fields.map((f) => f.name));

  let recOffset = headerLength;
  for (let i = 0; i < numRecords && recOffset + recordLength <= buf.length; i++) {
    const deletedFlag = buf[recOffset];
    if (deletedFlag !== 0x2a) {
      const row: string[] = [];
      let fOff = recOffset + 1;
      for (const f of fields) {
        const slice = buf.subarray(fOff, fOff + f.length);
        row.push(decodeSmartText(slice).trim());
        fOff += f.length;
      }
      rows.push(row);
    }
    recOffset += recordLength;
  }

  return [{ name: 'DBF Table', rows }];
}

export function parseXmlBuffer(buf: Buffer): ParsedSheet[] {
  const text = decodeSmartText(buf);
  const itemMatches = text.match(/<(row|item|product|record)\b[^>]*>([\s\S]*?)<\/\1>/gi) || [];
  if (itemMatches.length === 0) {
    throw new Error('لم يتم العثور على عناصر بيانات صالحة (<row> أو <item> أو <product>) داخل ملف XML');
  }
  const records: Array<Record<string, string>> = [];
  const headerSet = new Set<string>();

  for (const block of itemMatches) {
    const rec: Record<string, string> = {};
    const tagRegex = /<([a-zA-Z0-9_\-\u0600-\u06FF]+)>([^<]*)<\/\1>/g;
    let m: RegExpExecArray | null;
    while ((m = tagRegex.exec(block)) !== null) {
      const key = m[1].trim();
      const val = m[2].trim();
      rec[key] = val;
      headerSet.add(key);
    }
    if (Object.keys(rec).length > 0) records.push(rec);
  }

  const headers = Array.from(headerSet);
  const rows: string[][] = [headers];
  for (const rec of records) {
    rows.push(headers.map((h) => rec[h] || ''));
  }
  return [{ name: 'XML Data', rows }];
}

export function parseJsonBuffer(buf: Buffer): ParsedSheet[] {
  const text = decodeSmartText(buf);
  const parsed = JSON.parse(text);
  const arr = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items)
    ? parsed.items
    : Array.isArray(parsed?.products)
    ? parsed.products
    : Array.isArray(parsed?.data)
    ? parsed.data
    : null;

  if (!arr || arr.length === 0) {
    throw new Error('ملف JSON لا يحتوي على مصفوفة سجلات صالحة');
  }
  const headerSet = new Set<string>();
  for (const obj of arr) {
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(obj)) headerSet.add(k);
    }
  }
  const headers = Array.from(headerSet);
  const rows: string[][] = [headers];
  for (const obj of arr) {
    rows.push(headers.map((h) => (obj[h] !== undefined && obj[h] !== null ? String(obj[h]) : '')));
  }
  return [{ name: 'JSON Data', rows }];
}

export function parseUploadedFile(fileName: string, base64Content: string): {
  fileType: string;
  sheets: ParsedSheet[];
} {
  const buf = Buffer.from(base64Content, 'base64');
  const ext = (fileName.split('.').pop() || '').toLowerCase();

  if (ext === 'mdb' || ext === 'accdb') {
    throw new Error(
      'قراءة ملفات Access (.mdb/.accdb) مباشرة تتطلب محرك Microsoft Access Database Engine على جهاز Windows. يرجى تصدير الجدول من Access إلى Excel (.xlsx) أو CSV ثم رفعه هنا.'
    );
  }

  if (ext === 'dbf') {
    return { fileType: 'DBF', sheets: parseDbfBuffer(buf) };
  }

  if (ext === 'json') {
    return { fileType: 'JSON', sheets: parseJsonBuffer(buf) };
  }

  if (ext === 'xml') {
    return { fileType: 'XML', sheets: parseXmlBuffer(buf) };
  }

  if (ext === 'csv' || ext === 'txt') {
    const text = decodeSmartText(buf);
    const wb = XLSX.read(text, { type: 'string' });
    const sheets: ParsedSheet[] = wb.SheetNames.map((name) => {
      const sheet = wb.Sheets[name];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      return {
        name,
        rows: rawRows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : [])),
      };
    });
    return { fileType: ext.toUpperCase(), sheets };
  }

  if (ext === 'xlsx' || ext === 'xls') {
    const wb = XLSX.read(buf, { type: 'buffer' });
    const sheets: ParsedSheet[] = wb.SheetNames.map((name) => {
      const sheet = wb.Sheets[name];
      const rawRows = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      return {
        name,
        rows: rawRows.map((r) => (Array.isArray(r) ? r.map((c) => String(c ?? '').trim()) : [])),
      };
    });
    return { fileType: ext.toUpperCase(), sheets };
  }

  throw new Error(`صيغة الملف (${ext}) غير مدعومة للاستيراد المباشر. الصيغ المدعومة: XLSX, XLS, CSV, TXT, DBF, XML, JSON`);
}

export function detectHeaderRowIndex(rows: string[][]): number {
  const maxScan = Math.min(rows.length, 20);
  let bestIdx = 0;
  let bestScore = -1;

  const allSynonyms = new Set(
    Object.values(SYNONYMS)
      .flat()
      .map((s) => normalizeHeader(s))
  );

  for (let i = 0; i < maxScan; i++) {
    const row = rows[i] || [];
    const nonEmpty = row.filter((c) => c.trim() !== '');
    if (nonEmpty.length < 2) continue;

    let score = 0;
    for (const cell of nonEmpty) {
      const norm = normalizeHeader(cell);
      if (allSynonyms.has(norm)) {
        score += 10;
      } else {
        for (const syn of allSynonyms) {
          if (norm.includes(syn) || (norm.length >= 3 && syn.includes(norm))) {
            score += 4;
            break;
          }
        }
      }
    }
    score += nonEmpty.length * 0.5;
    if (score > bestScore) {
      bestScore = score;
      bestIdx = i;
    }
  }
  return bestIdx;
}

export function autoMapColumns(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {
    code: null,
    name: null,
    alt_name: null,
    barcode: null,
    category: null,
    unit: null,
    purchase_price: null,
    sale_price: null,
    wholesale_price: null,
    special_price: null,
    quantity: null,
    min_stock: null,
    reorder_level: null,
    notes: null,
  };

  const usedIndices = new Set<number>();

  // Pass 1: exact normalized match
  for (const field of TARGET_FIELDS) {
    const syns = SYNONYMS[field.key].map(normalizeHeader);
    for (let i = 0; i < headers.length; i++) {
      if (usedIndices.has(i)) continue;
      const normH = normalizeHeader(headers[i]);
      if (!normH) continue;
      if (syns.includes(normH)) {
        mapping[field.key] = i;
        usedIndices.add(i);
        break;
      }
    }
  }

  // Pass 2: partial match
  for (const field of TARGET_FIELDS) {
    if (mapping[field.key] !== null) continue;
    const syns = SYNONYMS[field.key].map(normalizeHeader);
    for (let i = 0; i < headers.length; i++) {
      if (usedIndices.has(i)) continue;
      const normH = normalizeHeader(headers[i]);
      if (!normH || normH.length < 2) continue;
      if (syns.some((s) => normH.includes(s) || s.includes(normH))) {
        mapping[field.key] = i;
        usedIndices.add(i);
        break;
      }
    }
  }

  return mapping;
}
