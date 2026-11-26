import fs from 'fs';
import path from 'path';
import { compileHardenedClientDist, compileHardenedDirectHtml } from './clientBundleCompiler.ts';
import { buildMinaNetWindowsExe } from './winExeBuilder.ts';
import { getMasterInitialUpdateState } from './masterUpdatePublisher.ts';
import { DEFAULT_PUBLIC_UPDATE_URL } from './updateService.ts';
import {
  getMinaIndustryById,
  getMinaLayoutById,
  getMinaThemeById,
  sanitizeMinaIndustryId,
  sanitizeMinaLayoutId,
  sanitizeMinaThemeId,
} from '../shared/themes.ts';

// Pure TypeScript Universal Win32 (PE32 x86) Single-File Installer Generator (MINA_NET_SETUP.exe)
// Machine = 0x014C (I386), OS/Subsystem = 5.1 (Windows XP / Vista / 7 / 8 / 8.1 / 10 / 11 - 32-bit, 64-bit WOW64 & ARM64)
// Installs without requiring Admin elevation (%LocalAppData%\MinaNetERP fallback %AppData%\MinaNetERP -> C:\MinaNetERP),
// creates Desktop & Start Menu (.lnk) shortcuts via native COM IShellLinkW, registers in Add/Remove Programs (HKCU),
// extracts all runtime, dist, MINA_NET_DIRECT.html, MINA_NET.exe, and UNINSTALL_MINA_NET.bat, and launches MINA_NET.exe.

function alignUp(val: number, align: number): number {
  return (val + align - 1) & ~(align - 1);
}

function utf16leNull(str: string): Buffer {
  return Buffer.from(`${str}\0`, 'utf16le');
}

function asciiNull(str: string): Buffer {
  return Buffer.from(`${str}\0`, 'ascii');
}

interface IcoEntry {
  width: number;
  height: number;
  colorCount: number;
  reserved: number;
  planes: number;
  bitCount: number;
  bytesInRes: number;
  data: Buffer;
}

function parseIcoFile(icoPath: string): IcoEntry[] {
  if (!fs.existsSync(icoPath)) return [];
  const buf = fs.readFileSync(icoPath);
  if (buf.length < 6) return [];
  const count = buf.readUInt16LE(4);
  const entries: IcoEntry[] = [];
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16;
    if (off + 16 > buf.length) break;
    const width = buf.readUInt8(off);
    const height = buf.readUInt8(off + 1);
    const colorCount = buf.readUInt8(off + 2);
    const reserved = buf.readUInt8(off + 3);
    const planes = buf.readUInt16LE(off + 4);
    const bitCount = buf.readUInt16LE(off + 6);
    const bytesInRes = buf.readUInt32LE(off + 8);
    const imageOffset = buf.readUInt32LE(off + 12);
    if (imageOffset + bytesInRes <= buf.length) {
      entries.push({
        width,
        height,
        colorCount,
        reserved,
        planes,
        bitCount,
        bytesInRes,
        data: buf.subarray(imageOffset, imageOffset + bytesInRes),
      });
    }
  }
  return entries;
}

function buildSetupVersionResourceBuffer(): Buffer {
  const writePaddedBlock = (key: string, value: Buffer | null, type: number, children: Buffer[]): Buffer => {
    const keyBuf = utf16leNull(key);
    const headerLen = 6 + keyBuf.length;
    const valueOffset = alignUp(headerLen, 4);
    const valueLenBytes = value ? value.length : 0;
    const childrenStart = alignUp(valueOffset + valueLenBytes, 4);

    let totalLen = childrenStart;
    const childOffsets: number[] = [];
    for (const c of children) {
      totalLen = alignUp(totalLen, 4);
      childOffsets.push(totalLen);
      totalLen += c.length;
    }

    const out = Buffer.alloc(totalLen, 0);
    out.writeUInt16LE(totalLen, 0);
    const reportedValLen = type === 1 && value ? Math.floor(value.length / 2) : valueLenBytes;
    out.writeUInt16LE(reportedValLen, 2);
    out.writeUInt16LE(type, 4);
    keyBuf.copy(out, 6);
    if (value) value.copy(out, valueOffset);
    children.forEach((c, idx) => c.copy(out, childOffsets[idx]));
    return out;
  };

  const makeString = (k: string, v: string) => writePaddedBlock(k, utf16leNull(v), 1, []);
  const stringTable = writePaddedBlock('040904B0', null, 1, [
    makeString('CompanyName', 'اسامه جرجس - 01153672084'),
    makeString('FileDescription', 'Mina Net ERP Windows Installer (All Windows Versions)'),
    makeString('FileVersion', '1.0.0.0'),
    makeString('InternalName', 'MINA_NET_SETUP'),
    makeString('OriginalFilename', 'MINA_NET_SETUP.exe'),
    makeString('ProductName', 'Mina Net ERP Setup'),
    makeString('ProductVersion', '1.0.0.0'),
  ]);
  const stringFileInfo = writePaddedBlock('StringFileInfo', null, 1, [stringTable]);

  const translation = Buffer.alloc(4);
  translation.writeUInt16LE(0x0409, 0);
  translation.writeUInt16LE(0x04b0, 2);
  const varEntry = writePaddedBlock('Translation', translation, 0, []);
  const varFileInfo = writePaddedBlock('VarFileInfo', null, 1, [varEntry]);

  const fixed = Buffer.alloc(52, 0);
  fixed.writeUInt32LE(0xfeef04bd, 0);
  fixed.writeUInt32LE(0x00010000, 4);
  fixed.writeUInt32LE(0x00010000, 8);
  fixed.writeUInt32LE(0x00000000, 12);
  fixed.writeUInt32LE(0x00010000, 16);
  fixed.writeUInt32LE(0x00000000, 20);
  fixed.writeUInt32LE(0x0000003f, 24);
  fixed.writeUInt32LE(0x00000000, 28);
  fixed.writeUInt32LE(0x00040004, 32);
  fixed.writeUInt32LE(0x00000001, 36);
  fixed.writeUInt32LE(0x00000000, 40);

  return writePaddedBlock('VS_VERSION_INFO', fixed, 0, [stringFileInfo, varFileInfo]);
}

function buildResourceSection(rsrcRva: number, icoEntries: IcoEntry[]): Buffer {
  interface ResLeaf {
    typeId: number;
    nameId: number;
    langId: number;
    data: Buffer;
  }

  const leaves: ResLeaf[] = [];
  if (icoEntries.length > 0) {
    icoEntries.forEach((entry, i) => {
      leaves.push({ typeId: 3, nameId: i + 1, langId: 0x0409, data: entry.data });
    });
    const grpBuf = Buffer.alloc(6 + icoEntries.length * 14, 0);
    grpBuf.writeUInt16LE(0, 0);
    grpBuf.writeUInt16LE(1, 2);
    grpBuf.writeUInt16LE(icoEntries.length, 4);
    icoEntries.forEach((entry, i) => {
      const off = 6 + i * 14;
      grpBuf.writeUInt8(entry.width, off);
      grpBuf.writeUInt8(entry.height, off + 1);
      grpBuf.writeUInt8(entry.colorCount, off + 2);
      grpBuf.writeUInt8(entry.reserved, off + 3);
      grpBuf.writeUInt16LE(entry.planes, off + 4);
      grpBuf.writeUInt16LE(entry.bitCount, off + 6);
      grpBuf.writeUInt32LE(entry.bytesInRes, off + 8);
      grpBuf.writeUInt16LE(i + 1, off + 12);
    });
    leaves.push({ typeId: 14, nameId: 1, langId: 0x0409, data: grpBuf });
  }
  leaves.push({ typeId: 16, nameId: 1, langId: 0x0409, data: buildSetupVersionResourceBuffer() });

  const typeIds = Array.from(new Set(leaves.map((l) => l.typeId))).sort((a, b) => a - b);
  const lvl1Size = 16 + typeIds.length * 8;

  let lvl2Offset = lvl1Size;
  const lvl2Offsets = new Map<number, number>();
  const namesByType = new Map<number, number[]>();
  for (const tid of typeIds) {
    const names = Array.from(new Set(leaves.filter((l) => l.typeId === tid).map((l) => l.nameId))).sort((a, b) => a - b);
    namesByType.set(tid, names);
    lvl2Offsets.set(tid, lvl2Offset);
    lvl2Offset += 16 + names.length * 8;
  }

  let lvl3Offset = lvl2Offset;
  const lvl3Offsets = new Map<string, number>();
  for (const tid of typeIds) {
    for (const nid of namesByType.get(tid)!) {
      lvl3Offsets.set(`${tid}:${nid}`, lvl3Offset);
      lvl3Offset += 16 + 8;
    }
  }

  const dataEntriesStart = lvl3Offset;
  let dataPayloadStart = alignUp(dataEntriesStart + leaves.length * 16, 8);

  const leafDataOffsets: number[] = [];
  for (const leaf of leaves) {
    leafDataOffsets.push(dataPayloadStart);
    dataPayloadStart = alignUp(dataPayloadStart + leaf.data.length, 8);
  }

  const out = Buffer.alloc(dataPayloadStart, 0);
  const writeDirHeader = (offset: number, idCount: number) => {
    out.writeUInt16LE(0, offset + 12);
    out.writeUInt16LE(idCount, offset + 14);
  };

  writeDirHeader(0, typeIds.length);
  typeIds.forEach((tid, idx) => {
    const eOff = 16 + idx * 8;
    out.writeUInt32LE(tid, eOff);
    out.writeUInt32LE((0x80000000 | lvl2Offsets.get(tid)!) >>> 0, eOff + 4);
  });

  for (const tid of typeIds) {
    const dirOff = lvl2Offsets.get(tid)!;
    const names = namesByType.get(tid)!;
    writeDirHeader(dirOff, names.length);
    names.forEach((nid, idx) => {
      const eOff = dirOff + 16 + idx * 8;
      out.writeUInt32LE(nid, eOff);
      out.writeUInt32LE((0x80000000 | lvl3Offsets.get(`${tid}:${nid}`)!) >>> 0, eOff + 4);
    });
  }

  leaves.forEach((leaf, leafIdx) => {
    const l3Off = lvl3Offsets.get(`${leaf.typeId}:${leaf.nameId}`)!;
    writeDirHeader(l3Off, 1);
    out.writeUInt32LE(leaf.langId, l3Off + 16);
    const dataEntryOff = dataEntriesStart + leafIdx * 16;
    out.writeUInt32LE(dataEntryOff, l3Off + 20);

    const payloadOff = leafDataOffsets[leafIdx];
    out.writeUInt32LE(rsrcRva + payloadOff, dataEntryOff);
    out.writeUInt32LE(leaf.data.length, dataEntryOff + 4);
    out.writeUInt32LE(0, dataEntryOff + 8);
    out.writeUInt32LE(0, dataEntryOff + 12);
    leaf.data.copy(out, payloadOff);
  });

  return out;
}

class SetupX86Asm {
  private buf: number[] = [];
  private labels = new Map<string, number>();
  private fixups: Array<{ instrEnd: number; patchOffset: number; label: string }> = [];
  private imageBase: number;

  constructor(imageBase: number) {
    this.imageBase = imageBase >>> 0;
  }

  va(rva: number): number {
    return (this.imageBase + rva) >>> 0;
  }

  emit(...bytes: number[]): this {
    for (const b of bytes) this.buf.push(b & 0xff);
    return this;
  }

  emitU32(val: number): this {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(val >>> 0, 0);
    return this.emit(b[0], b[1], b[2], b[3]);
  }

  emitI32(val: number): this {
    const b = Buffer.alloc(4);
    b.writeInt32LE(val | 0, 0);
    return this.emit(b[0], b[1], b[2], b[3]);
  }

  mark(label: string): this {
    this.labels.set(label, this.buf.length);
    return this;
  }

  pushImm32(val: number): this {
    return this.emit(0x68).emitU32(val);
  }
  pushVa(rva: number): this {
    return this.pushImm32(this.va(rva));
  }
  pushImm8(v: number): this {
    return this.emit(0x6a, v & 0xff);
  }
  pushEax(): this {
    return this.emit(0x50);
  }
  pushEcx(): this {
    return this.emit(0x51);
  }
  pushEbx(): this {
    return this.emit(0x53);
  }
  pushMemDwordVa(rva: number): this {
    return this.emit(0xff, 0x35).emitU32(this.va(rva));
  }
  callIat(iatRva: number): this {
    return this.emit(0xff, 0x15).emitU32(this.va(iatRva));
  }
  callComVtbl(objVarRva: number, vtblOffset: number): this {
    // Expects args already pushed (excluding `this`). Pushes `this` last (first C param) and calls vtbl[vtblOffset]
    this.movEaxMemVa(objVarRva);
    this.pushEax();
    this.emit(0x8b, 0x08); // mov ecx, [eax]
    return this.emit(0xff, 0x51, vtblOffset & 0xff); // call dword ptr [ecx + vtblOffset]
  }
  cld(): this {
    return this.emit(0xfc);
  }
  xorEaxEax(): this {
    return this.emit(0x31, 0xc0);
  }
  incEax(): this {
    return this.emit(0x40);
  }
  shlEax1(): this {
    return this.emit(0xd1, 0xe0);
  }
  movEaxImm32(v: number): this {
    return this.emit(0xb8).emitU32(v);
  }
  movEcxImm32(v: number): this {
    return this.emit(0xb9).emitU32(v);
  }
  movEdiVa(rva: number): this {
    return this.emit(0xbf).emitU32(this.va(rva));
  }
  movEsiVa(rva: number): this {
    return this.emit(0xbe).emitU32(this.va(rva));
  }
  movEaxMemVa(rva: number): this {
    return this.emit(0xa1).emitU32(this.va(rva));
  }
  movMemVaEax(rva: number): this {
    return this.emit(0xa3).emitU32(this.va(rva));
  }
  movEcxMemVa(rva: number): this {
    return this.emit(0x8b, 0x0d).emitU32(this.va(rva));
  }
  movMemVaDwordImm32(rva: number, imm32: number): this {
    return this.emit(0xc7, 0x05).emitU32(this.va(rva)).emitU32(imm32);
  }
  repStosd(): this {
    return this.emit(0xf3, 0xab);
  }
  testEaxEax(): this {
    return this.emit(0x85, 0xc0);
  }
  cmpEaxImm8(v: number): this {
    return this.emit(0x83, 0xf8, v & 0xff);
  }
  cmpEaxMinusOne(): this {
    return this.emit(0x83, 0xf8, 0xff);
  }
  cmpEaxMemVa(rva: number): this {
    return this.emit(0x3b, 0x05).emitU32(this.va(rva));
  }
  cmpEaxEcx(): this {
    return this.emit(0x39, 0xc8);
  }
  subEaxEcx(): this {
    return this.emit(0x29, 0xc8);
  }
  cmpMemVaDwordImm32(rva: number, imm32: number): this {
    return this.emit(0x81, 0x3d).emitU32(this.va(rva)).emitU32(imm32);
  }
  cmpMemVaWordImm16(rva: number, imm16: number): this {
    return this.emit(0x66, 0x81, 0x3d).emitU32(this.va(rva)).emit(imm16 & 0xff, (imm16 >> 8) & 0xff);
  }
  movAxWordPtrEsi(): this {
    return this.emit(0x66, 0x8b, 0x06);
  }
  testAxAx(): this {
    return this.emit(0x66, 0x85, 0xc0);
  }
  cmpAxImm16(v: number): this {
    return this.emit(0x66, 0x3d, v & 0xff, (v >> 8) & 0xff);
  }
  movWordPtrEsiZero(): this {
    return this.emit(0x66, 0xc7, 0x06, 0x00, 0x00);
  }
  movWordPtrEsiBackslash(): this {
    return this.emit(0x66, 0xc7, 0x06, 0x5c, 0x00);
  }
  cmpEsiVa(rva: number): this {
    return this.emit(0x81, 0xfe).emitU32(this.va(rva));
  }
  addEsi2(): this {
    return this.emit(0x83, 0xc6, 0x02);
  }
  decMemVaDword(rva: number): this {
    return this.emit(0xff, 0x0d).emitU32(this.va(rva));
  }

  private emitJmpRel32(opcodeBytes: number[], label: string): this {
    this.emit(...opcodeBytes);
    const patchOffset = this.buf.length;
    this.emitI32(0);
    this.fixups.push({ instrEnd: this.buf.length, patchOffset, label });
    return this;
  }

  jmp(label: string): this {
    return this.emitJmpRel32([0xe9], label);
  }
  je(label: string): this {
    return this.emitJmpRel32([0x0f, 0x84], label);
  }
  jne(label: string): this {
    return this.emitJmpRel32([0x0f, 0x85], label);
  }
  ja(label: string): this {
    return this.emitJmpRel32([0x0f, 0x87], label);
  }
  jbe(label: string): this {
    return this.emitJmpRel32([0x0f, 0x86], label);
  }
  js(label: string): this {
    return this.emitJmpRel32([0x0f, 0x88], label);
  }
  jz(label: string): this {
    return this.je(label);
  }

  finalize(): Buffer {
    const out = Buffer.from(this.buf);
    for (const fx of this.fixups) {
      const target = this.labels.get(fx.label);
      if (target === undefined) throw new Error(`Undefined label in setup asm: ${fx.label}`);
      out.writeInt32LE(target - fx.instrEnd, fx.patchOffset);
    }
    return out;
  }
}

interface EmbeddedFileEntry {
  relWinPath: string; // e.g. 'runtime\\launcher.cjs'
  data: Buffer;
}

function collectInstallFiles(
  rawTheme?: string,
  rawLayout?: string,
  rawIndustry?: string,
  updateServerUrl?: string
): {
  entries: EmbeddedFileEntry[];
  industryNameAr: string;
  layoutNameAr: string;
  themeNameAr: string;
} {
  const rootDir = process.cwd();
  const industryId = sanitizeMinaIndustryId(rawIndustry);
  const layoutId = sanitizeMinaLayoutId(rawLayout);
  const themeId = sanitizeMinaThemeId(rawTheme);
  const industryMeta = getMinaIndustryById(industryId);
  const layoutMeta = getMinaLayoutById(layoutId);
  const themeMeta = getMinaThemeById(themeId);

  const hardenedRoot = compileHardenedClientDist(false, themeId, layoutId, industryId);
  const directHtmlPath = compileHardenedDirectHtml(false, themeId, layoutId, industryId);

  const entries: EmbeddedFileEntry[] = [];

  const addTree = (baseDir: string, relDir: string, excludeNames: Set<string>, excludePrefixes: string[] = []) => {
    const absDir = path.join(baseDir, relDir);
    if (!fs.existsSync(absDir)) return;
    for (const item of fs.readdirSync(absDir, { withFileTypes: true })) {
      if (excludeNames.has(item.name)) continue;
      if (excludePrefixes.some((p) => item.name.startsWith(p))) continue;
      const rel = relDir ? `${relDir}\\${item.name}` : item.name;
      const abs = path.join(absDir, item.name);
      if (item.isDirectory()) {
        addTree(baseDir, rel, excludeNames, excludePrefixes);
      } else if (item.isFile()) {
        entries.push({ relWinPath: rel, data: fs.readFileSync(abs) });
      }
    }
  };

  for (const f of ['metadata.json', '.env.example']) {
    const abs = path.join(rootDir, f);
    if (fs.existsSync(abs)) {
      entries.push({ relWinPath: f, data: fs.readFileSync(abs) });
    }
  }

  const runtimePkg = {
    name: 'mina-net-erp',
    private: true,
    version: '1.0.0',
    scripts: {
      start: 'node runtime/launcher.cjs',
      dev: 'node runtime/launcher.cjs',
    },
    dependencies: {
      'adm-zip': '^0.6.1',
      bcryptjs: '^3.0.3',
      'better-sqlite3': '^13.2.0',
      dotenv: '^17.2.3',
      express: '^4.21.2',
      xlsx: '^0.18.5',
    },
  };
  entries.push({ relWinPath: 'package.json', data: Buffer.from(JSON.stringify(runtimePkg, null, 2), 'utf-8') });

  addTree(hardenedRoot, 'runtime', new Set(['.build-meta.json']));
  const updateConfig = {
    updateServerUrl: (updateServerUrl || DEFAULT_PUBLIC_UPDATE_URL).replace(/\/+$/, ''),
    updatedAt: new Date().toISOString(),
  };
  const updateState = getMasterInitialUpdateState();
  entries.push({
    relWinPath: 'runtime\\update-config.json',
    data: Buffer.from(JSON.stringify(updateConfig, null, 2), 'utf-8'),
  });
  entries.push({
    relWinPath: 'runtime\\update-state.json',
    data: Buffer.from(JSON.stringify(updateState, null, 2), 'utf-8'),
  });
  addTree(hardenedRoot, 'dist', new Set(['license-manager.html']), ['licenseManager']);

  if (fs.existsSync(directHtmlPath)) {
    entries.push({ relWinPath: 'MINA_NET_DIRECT.html', data: fs.readFileSync(directHtmlPath) });
  }

  addTree(rootDir, 'public', new Set(['assets']));
  entries.push({ relWinPath: 'MINA_NET.exe', data: buildMinaNetWindowsExe() });

  const uninstallBat = `@echo off
chcp 65001 >nul
echo جاري إزالة تثبيت برنامج Mina Net ERP...
taskkill /F /IM node.exe >nul 2>nul
del /q "%USERPROFILE%\\Desktop\\Mina Net ERP.lnk" >nul 2>nul
del /q "%USERPROFILE%\\OneDrive\\Desktop\\Mina Net ERP.lnk" >nul 2>nul
del /q "%APPDATA%\\Microsoft\\Windows\\Start Menu\\Programs\\Mina Net ERP.lnk" >nul 2>nul
powershell -NoProfile -Command "$d=[Environment]::GetFolderPath('Desktop'); Remove-Item -Force -ErrorAction SilentlyContinue (Join-Path $d 'Mina Net ERP.lnk')" >nul 2>nul
reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MinaNetERP" /f >nul 2>nul
echo تم إزالة اختصارات البرنامج وتسجيل النظام بنجاح. لحذف مجلد التثبيت بالكامل احذف: "%~dp0"
pause
`;
  entries.push({ relWinPath: 'UNINSTALL_MINA_NET.bat', data: Buffer.from(uninstallBat, 'utf-8') });

  return {
    entries,
    industryNameAr: industryMeta.nameAr,
    layoutNameAr: layoutMeta.nameAr,
    themeNameAr: themeMeta.nameAr,
  };
}

function buildPayloadArchive(entries: EmbeddedFileEntry[]): Buffer {
  // Archive Format:
  // [4B Magic 'KPNM' = 0x4D4E504B][4B FileCount]
  // Each entry: [4B relWinPathUtf16NullBytes][4B fileDataBytes][relWinPath UTF-16LE + \0][fileData bytes]
  const hdr = Buffer.alloc(8);
  hdr.writeUInt32LE(0x4d4e504b, 0);
  hdr.writeUInt32LE(entries.length, 4);

  const chunks: Buffer[] = [hdr];
  for (const e of entries) {
    const pathBuf = utf16leNull(e.relWinPath);
    const meta = Buffer.alloc(8);
    meta.writeUInt32LE(pathBuf.length, 0);
    meta.writeUInt32LE(e.data.length, 4);
    chunks.push(meta, pathBuf, e.data);
  }
  return Buffer.concat(chunks);
}

export function buildMinaNetSetupExe(
  rawTheme?: string,
  rawLayout?: string,
  rawIndustry?: string,
  updateServerUrl?: string
): Buffer {
  const { entries, layoutNameAr, themeNameAr } = collectInstallFiles(
    rawTheme,
    rawLayout,
    rawIndustry,
    updateServerUrl
  );
  const payloadArchive = buildPayloadArchive(entries);

  const icoPath = path.join(process.cwd(), 'public', 'plaza.ico');
  const icoEntries = parseIcoFile(icoPath);

  const IMAGE_BASE = 0x00400000;
  const SECTION_ALIGN = 0x1000;
  const FILE_ALIGN = 0x200;
  const TEXT_RVA = 0x1000;
  const RDATA_RVA = 0x2000;

  // 1. .rdata
  const rdataChunks: Buffer[] = [];
  let rdataCursor = 0;
  const allocRdata = (data: Buffer, align = 2): number => {
    const pad = alignUp(rdataCursor, align) - rdataCursor;
    if (pad > 0) {
      rdataChunks.push(Buffer.alloc(pad, 0));
      rdataCursor += pad;
    }
    const rva = RDATA_RVA + rdataCursor;
    rdataChunks.push(data);
    rdataCursor += data.length;
    return rva;
  };

  // Patched at the end with exact PE overlay offset
  const overlayOffsetFilePosInRdata = rdataCursor; // aligned 4 since cursor=0
  const rvaOverlayOffset = allocRdata(Buffer.alloc(4, 0), 4);

  // GUIDs for COM IShellLinkW
  const clsidShellLink = Buffer.from([
    0x01, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46,
  ]);
  const iidIShellLinkW = Buffer.from([
    0xf9, 0x14, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46,
  ]);
  const iidIPersistFile = Buffer.from([
    0x0b, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xc0, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46,
  ]);
  const rvaClsidShellLink = allocRdata(clsidShellLink, 4);
  const rvaIidShellLinkW = allocRdata(iidIShellLinkW, 4);
  const rvaIidPersistFile = allocRdata(iidIPersistFile, 4);

  const strTitle = allocRdata(utf16leNull('تثبيت برنامج Mina Net ERP'));
  const strWelcomeMsg = allocRdata(
    utf16leNull(
      `مرحبًا بك في معالج تثبيت برنامج Mina Net ERP\n\nمتوافق مع جميع إصدارات ويندوز (Windows XP / 7 / 8 / 10 / 11 — 32 و 64 بت).\n\nهل تريد بدء التثبيت الآن وإنشاء أيقونة التشغيل على سطح المكتب؟`
    )
  );
  void layoutNameAr;
  void themeNameAr;
  const strSuccessPrefix = allocRdata(
    utf16leNull('تم تثبيت برنامج Mina Net ERP بنجاح على جهازك!\n\nمسار التثبيت:\n')
  );
  const strSuccessSuffix = allocRdata(
    utf16leNull('\n\nتم إنشاء اختصار على سطح المكتب وقائمة ابدأ.\nاضغط موافق لتشغيل البرنامج الآن.')
  );
  const strErrorMsg = allocRdata(
    utf16leNull('تعذر إتمام التثبيت أو قراءة بيانات الحزمة. تأكد من صلاحية المجلد وحاول مرة أخرى.')
  );

  const strLocalAppSub = allocRdata(utf16leNull('%LocalAppData%\\MinaNetERP\\'));
  const strAppDataSub = allocRdata(utf16leNull('%AppData%\\MinaNetERP\\'));
  const strRootFallback = allocRdata(utf16leNull('C:\\MinaNetERP\\'));
  const strExeName = allocRdata(utf16leNull('MINA_NET.exe'));
  const strUninstallBat = allocRdata(utf16leNull('UNINSTALL_MINA_NET.bat'));
  const strQuote = allocRdata(utf16leNull('"'));
  const strLnkSuffix = allocRdata(utf16leNull('\\Mina Net ERP.lnk'));
  const strAppDesc = allocRdata(utf16leNull('Mina Net ERP - نظام إدارة المحلات والمخازن والشركات'));

  // Registry Uninstall keys (HKCU)
  const strRegSubkey = allocRdata(
    utf16leNull('Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\MinaNetERP')
  );
  const strValDisplayName = allocRdata(utf16leNull('DisplayName'));
  const strValDisplayData = allocRdata(utf16leNull('Mina Net ERP'));
  const strValPublisher = allocRdata(utf16leNull('Publisher'));
  const strValPubData = allocRdata(utf16leNull('اسامه جرجس - 01153672084'));
  const strValVersion = allocRdata(utf16leNull('DisplayVersion'));
  const strValVerData = allocRdata(utf16leNull('1.0.0'));
  const strValInstallLoc = allocRdata(utf16leNull('InstallLocation'));
  const strValDisplayIcon = allocRdata(utf16leNull('DisplayIcon'));
  const strValUninstall = allocRdata(utf16leNull('UninstallString'));

  // Import Directory
  const importsSpec: Array<{ dll: string; funcs: string[] }> = [
    {
      dll: 'KERNEL32.dll',
      funcs: [
        'GetModuleFileNameW',
        'CreateFileW',
        'SetFilePointer',
        'ReadFile',
        'WriteFile',
        'CloseHandle',
        'CreateDirectoryW',
        'ExpandEnvironmentStringsW',
        'CreateProcessW',
        'VirtualAlloc',
        'VirtualFree',
        'lstrcpyW',
        'lstrcatW',
        'lstrlenW',
        'ExitProcess',
      ],
    },
    { dll: 'USER32.dll', funcs: ['MessageBoxW'] },
    { dll: 'SHELL32.dll', funcs: ['SHGetSpecialFolderPathW'] },
    { dll: 'OLE32.dll', funcs: ['CoInitialize', 'CoCreateInstance', 'CoUninitialize'] },
    { dll: 'ADVAPI32.dll', funcs: ['RegCreateKeyExW', 'RegSetValueExW', 'RegCloseKey'] },
  ];

  const dllNameRvas = importsSpec.map((imp) => allocRdata(asciiNull(imp.dll), 2));
  const hintNameRvas = importsSpec.map((imp) =>
    imp.funcs.map((fn) => {
      const ascii = asciiNull(fn);
      const entry = Buffer.alloc(2 + ascii.length + (ascii.length & 1 ? 1 : 0), 0);
      ascii.copy(entry, 2);
      return allocRdata(entry, 2);
    })
  );

  const iatRvaMap: Record<string, number> = {};
  const iltBuffers = importsSpec.map((imp, dIdx) => {
    const b = Buffer.alloc((imp.funcs.length + 1) * 4, 0);
    imp.funcs.forEach((_fn, fIdx) => b.writeUInt32LE(hintNameRvas[dIdx][fIdx], fIdx * 4));
    return b;
  });
  const iltRvas = iltBuffers.map((b) => allocRdata(b, 4));

  const iatBuffers = importsSpec.map((imp, dIdx) => {
    const b = Buffer.alloc((imp.funcs.length + 1) * 4, 0);
    imp.funcs.forEach((_fn, fIdx) => b.writeUInt32LE(hintNameRvas[dIdx][fIdx], fIdx * 4));
    return b;
  });
  const iatStartCursor = alignUp(rdataCursor, 4);
  const iatStartRva = RDATA_RVA + iatStartCursor;
  const iatRvas = iatBuffers.map((b) => allocRdata(b, 4));
  const iatTotalSize = RDATA_RVA + rdataCursor - iatStartRva;

  importsSpec.forEach((imp, dIdx) => {
    imp.funcs.forEach((fn, fIdx) => {
      iatRvaMap[fn] = iatRvas[dIdx] + fIdx * 4;
    });
  });

  const importDescBuf = Buffer.alloc((importsSpec.length + 1) * 20, 0);
  importsSpec.forEach((_imp, dIdx) => {
    const off = dIdx * 20;
    importDescBuf.writeUInt32LE(iltRvas[dIdx], off);
    importDescBuf.writeUInt32LE(dllNameRvas[dIdx], off + 12);
    importDescBuf.writeUInt32LE(iatRvas[dIdx], off + 16);
  });
  const importDirRva = allocRdata(importDescBuf, 4);
  const importDirSize = importDescBuf.length;

  const rdataRaw = Buffer.concat(rdataChunks);
  const rdataVirtualSize = rdataRaw.length;
  const DATA_RVA = RDATA_RVA + alignUp(Math.max(1, rdataVirtualSize), SECTION_ALIGN);

  // 2. .data layout
  let dataCursor = 0;
  const allocData = (bytes: number, align = 8): number => {
    dataCursor = alignUp(dataCursor, align);
    const rva = DATA_RVA + dataCursor;
    dataCursor += bytes;
    return rva;
  };

  const bufSelfPath = allocData(2048);
  const bufInstallDir = allocData(2048);
  const bufRelPath = allocData(2048);
  const bufDestPath = allocData(4096);
  const bufExePath = allocData(4096);
  const bufUninstallPath = allocData(4096);
  const bufShortcutPath = allocData(2048);
  const bufMsg = allocData(8192);
  const bufHeader = allocData(8, 4); // [0]: magic / relLen, [4]: fileCount / fileLen
  const bufStartupInfo = allocData(80, 4);
  const bufProcInfo = allocData(16, 4);
  const varSetupHandle = allocData(4, 4);
  const varOutHandle = allocData(4, 4);
  const varCopyBuf = allocData(4, 4);
  const varFilesRemaining = allocData(4, 4);
  const varFileRemaining = allocData(4, 4);
  const varChunkSize = allocData(4, 4);
  const varBytesIo = allocData(4, 4);
  const varShellLink = allocData(4, 4);
  const varPersistFile = allocData(4, 4);
  const varRegKey = allocData(4, 4);

  const dataVirtualSize = dataCursor;
  const dataRaw = Buffer.alloc(alignUp(dataVirtualSize, FILE_ALIGN), 0);
  const RSRC_RVA = DATA_RVA + alignUp(dataVirtualSize, SECTION_ALIGN);

  // 3. Emit x86 Win32 setup installer machine code
  const asm = new SetupX86Asm(IMAGE_BASE);

  // Step 1: Confirmation prompt (MB_YESNO | MB_ICONQUESTION = 0x24)
  asm
    .pushImm8(0x24)
    .pushVa(strTitle)
    .pushVa(strWelcomeMsg)
    .pushImm8(0)
    .callIat(iatRvaMap.MessageBoxW)
    .cmpEaxImm8(6) // IDYES
    .je('startInstall')
    .pushImm8(0)
    .callIat(iatRvaMap.ExitProcess);

  // Step 2: Resolve writable install folder (%LocalAppData%\MinaNetERP\ -> %AppData%\MinaNetERP\ -> C:\MinaNetERP\)
  asm
    .mark('startInstall')
    .pushImm32(1024)
    .pushVa(bufInstallDir)
    .pushVa(strLocalAppSub)
    .callIat(iatRvaMap.ExpandEnvironmentStringsW)
    .cmpMemVaWordImm16(bufInstallDir, 0x0025) // literal '%' means env var not defined
    .jne('dirResolved')
    .pushImm32(1024)
    .pushVa(bufInstallDir)
    .pushVa(strAppDataSub)
    .callIat(iatRvaMap.ExpandEnvironmentStringsW)
    .cmpMemVaWordImm16(bufInstallDir, 0x0025)
    .jne('dirResolved')
    .pushVa(strRootFallback)
    .pushVa(bufInstallDir)
    .callIat(iatRvaMap.lstrcpyW);

  asm
    .mark('dirResolved')
    .pushImm8(0)
    .pushVa(bufInstallDir)
    .callIat(iatRvaMap.CreateDirectoryW);

  // Step 3: Open own EXE & seek to overlay
  asm
    .pushImm32(1024)
    .pushVa(bufSelfPath)
    .pushImm8(0)
    .callIat(iatRvaMap.GetModuleFileNameW)
    .testEaxEax()
    .je('showError');

  asm
    .pushImm8(0)
    .pushImm32(0x80)
    .pushImm8(3) // OPEN_EXISTING
    .pushImm8(0)
    .pushImm8(1) // FILE_SHARE_READ
    .pushImm32(0x80000000) // GENERIC_READ
    .pushVa(bufSelfPath)
    .callIat(iatRvaMap.CreateFileW)
    .cmpEaxMinusOne()
    .je('showError')
    .movMemVaEax(varSetupHandle);

  asm
    .pushImm8(0) // FILE_BEGIN
    .pushImm8(0)
    .pushMemDwordVa(rvaOverlayOffset)
    .pushMemDwordVa(varSetupHandle)
    .callIat(iatRvaMap.SetFilePointer)
    .cmpEaxMinusOne()
    .je('showError');

  // Read archive header: 8 bytes (magic 'KPNM', fileCount)
  asm
    .pushImm8(0)
    .pushVa(varBytesIo)
    .pushImm8(8)
    .pushVa(bufHeader)
    .pushMemDwordVa(varSetupHandle)
    .callIat(iatRvaMap.ReadFile)
    .testEaxEax()
    .je('showError')
    .cmpMemVaDwordImm32(bufHeader, 0x4d4e504b)
    .jne('showError')
    .movEaxMemVa(bufHeader + 4)
    .movMemVaEax(varFilesRemaining);

  // Allocate 1 MB copy buffer
  asm
    .pushImm8(0x04) // PAGE_READWRITE
    .pushImm32(0x3000) // MEM_COMMIT | MEM_RESERVE
    .pushImm32(0x100000) // 1 MB
    .pushImm8(0)
    .callIat(iatRvaMap.VirtualAlloc)
    .testEaxEax()
    .je('showError')
    .movMemVaEax(varCopyBuf);

  // Step 4: Extract files loop
  asm
    .mark('extractLoop')
    .movEaxMemVa(varFilesRemaining)
    .testEaxEax()
    .jz('extractDone');

  // Read entry header: [relLen, fileLen]
  asm
    .pushImm8(0)
    .pushVa(varBytesIo)
    .pushImm8(8)
    .pushVa(bufHeader)
    .pushMemDwordVa(varSetupHandle)
    .callIat(iatRvaMap.ReadFile)
    .testEaxEax()
    .je('showError');

  // Read relative path UTF-16LE into bufRelPath
  asm
    .pushImm8(0)
    .pushVa(varBytesIo)
    .pushMemDwordVa(bufHeader)
    .pushVa(bufRelPath)
    .pushMemDwordVa(varSetupHandle)
    .callIat(iatRvaMap.ReadFile)
    .testEaxEax()
    .je('showError');

  // Build bufDestPath = bufInstallDir + bufRelPath
  asm
    .pushVa(bufInstallDir)
    .pushVa(bufDestPath)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(bufRelPath)
    .pushVa(bufDestPath)
    .callIat(iatRvaMap.lstrcatW);

  // Recursively ensure parent directories exist for bufDestPath
  asm
    .movEsiVa(bufDestPath)
    .mark('dirScanLoop')
    .movAxWordPtrEsi()
    .testAxAx()
    .jz('dirScanDone')
    .cmpAxImm16(0x005c) // '\\'
    .jne('dirScanNext')
    .cmpEsiVa(bufDestPath + 4) // skip drive root C:\
    .jbe('dirScanNext')
    .movWordPtrEsiZero()
    .pushImm8(0)
    .pushVa(bufDestPath)
    .callIat(iatRvaMap.CreateDirectoryW)
    .movWordPtrEsiBackslash()
    .mark('dirScanNext')
    .addEsi2()
    .jmp('dirScanLoop')
    .mark('dirScanDone');

  // Open destination file (CREATE_ALWAYS)
  asm
    .pushImm8(0)
    .pushImm32(0x80)
    .pushImm8(2) // CREATE_ALWAYS
    .pushImm8(0)
    .pushImm8(0)
    .pushImm32(0x40000000) // GENERIC_WRITE
    .pushVa(bufDestPath)
    .callIat(iatRvaMap.CreateFileW)
    .cmpEaxMinusOne()
    .je('showError')
    .movMemVaEax(varOutHandle);

  // Copy file payload in <= 1 MB chunks
  asm
    .movEaxMemVa(bufHeader + 4)
    .movMemVaEax(varFileRemaining)
    .mark('chunkLoop')
    .movEaxMemVa(varFileRemaining)
    .testEaxEax()
    .jz('fileCopyDone')
    .movEcxImm32(0x100000)
    .cmpEaxEcx()
    .ja('chunkUseCap')
    .movMemVaEax(varChunkSize)
    .jmp('chunkDoIo')
    .mark('chunkUseCap')
    .movMemVaDwordImm32(varChunkSize, 0x100000)
    .mark('chunkDoIo')
    .pushImm8(0)
    .pushVa(varBytesIo)
    .pushMemDwordVa(varChunkSize)
    .pushMemDwordVa(varCopyBuf)
    .pushMemDwordVa(varSetupHandle)
    .callIat(iatRvaMap.ReadFile)
    .testEaxEax()
    .je('showError')
    .pushImm8(0)
    .pushVa(varBytesIo)
    .pushMemDwordVa(varChunkSize)
    .pushMemDwordVa(varCopyBuf)
    .pushMemDwordVa(varOutHandle)
    .callIat(iatRvaMap.WriteFile)
    .testEaxEax()
    .je('showError')
    .movEaxMemVa(varFileRemaining)
    .movEcxMemVa(varChunkSize)
    .subEaxEcx()
    .movMemVaEax(varFileRemaining)
    .jmp('chunkLoop');

  asm
    .mark('fileCopyDone')
    .pushMemDwordVa(varOutHandle)
    .callIat(iatRvaMap.CloseHandle)
    .decMemVaDword(varFilesRemaining)
    .jmp('extractLoop');

  asm
    .mark('extractDone')
    .pushMemDwordVa(varSetupHandle)
    .callIat(iatRvaMap.CloseHandle)
    .pushImm32(0x8000)
    .pushImm8(0)
    .pushMemDwordVa(varCopyBuf)
    .callIat(iatRvaMap.VirtualFree);

  // Build bufExePath = bufInstallDir + "MINA_NET.exe"
  // Build bufUninstallPath = bufInstallDir + "UNINSTALL_MINA_NET.bat"
  asm
    .pushVa(bufInstallDir)
    .pushVa(bufExePath)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(strExeName)
    .pushVa(bufExePath)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(bufInstallDir)
    .pushVa(bufUninstallPath)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(strUninstallBat)
    .pushVa(bufUninstallPath)
    .callIat(iatRvaMap.lstrcatW);

  // Step 5: Create Desktop & Start Menu (.lnk) shortcuts via COM IShellLinkW
  asm.pushImm8(0).callIat(iatRvaMap.CoInitialize);

  const emitCreateShortcutForCsidl = (csidl: number, idxLabel: string) => {
    asm
      .pushImm8(1)
      .pushImm8(csidl)
      .pushVa(bufShortcutPath)
      .pushImm8(0)
      .callIat(iatRvaMap.SHGetSpecialFolderPathW)
      .testEaxEax()
      .jz(`skipShortcut_${idxLabel}`)
      .pushVa(strLnkSuffix)
      .pushVa(bufShortcutPath)
      .callIat(iatRvaMap.lstrcatW);

    asm
      .pushVa(varShellLink)
      .pushVa(rvaIidShellLinkW)
      .pushImm8(1) // CLSCTX_INPROC_SERVER
      .pushImm8(0)
      .pushVa(rvaClsidShellLink)
      .callIat(iatRvaMap.CoCreateInstance)
      .testEaxEax()
      .js(`skipShortcut_${idxLabel}`);

    // SetPath, SetWorkingDirectory, SetIconLocation, SetDescription
    asm
      .pushVa(bufExePath)
      .callComVtbl(varShellLink, 0x50)
      .pushVa(bufInstallDir)
      .callComVtbl(varShellLink, 0x24)
      .pushImm8(0)
      .pushVa(bufExePath)
      .callComVtbl(varShellLink, 0x44)
      .pushVa(strAppDesc)
      .callComVtbl(varShellLink, 0x1c);

    // QueryInterface(IID_IPersistFile, &varPersistFile)
    asm
      .pushVa(varPersistFile)
      .pushVa(rvaIidPersistFile)
      .callComVtbl(varShellLink, 0x00)
      .testEaxEax()
      .js(`releaseSL_${idxLabel}`)
      .pushImm8(1)
      .pushVa(bufShortcutPath)
      .callComVtbl(varPersistFile, 0x18) // Save
      .callComVtbl(varPersistFile, 0x08); // Release

    asm
      .mark(`releaseSL_${idxLabel}`)
      .callComVtbl(varShellLink, 0x08) // Release IShellLinkW
      .mark(`skipShortcut_${idxLabel}`);
  };

  emitCreateShortcutForCsidl(0x0010, 'desktop'); // CSIDL_DESKTOPDIRECTORY
  emitCreateShortcutForCsidl(0x0002, 'programs'); // CSIDL_PROGRAMS (Start Menu)

  asm.callIat(iatRvaMap.CoUninitialize);

  // Step 6: Register Add/Remove Programs under HKCU (zero UAC admin required)
  const emitSetRegStr = (nameRva: number, valRva: number) => {
    asm
      .pushVa(valRva)
      .callIat(iatRvaMap.lstrlenW)
      .incEax()
      .shlEax1() // (len + 1) * 2
      .pushEax() // cbData
      .pushVa(valRva) // lpData
      .pushImm8(1) // REG_SZ
      .pushImm8(0)
      .pushVa(nameRva)
      .pushMemDwordVa(varRegKey)
      .callIat(iatRvaMap.RegSetValueExW);
  };

  asm
    .pushImm8(0)
    .pushVa(varRegKey)
    .pushImm8(0)
    .pushImm32(0x20006) // KEY_WRITE
    .pushImm8(0)
    .pushImm8(0)
    .pushImm8(0)
    .pushVa(strRegSubkey)
    .pushImm32(0x80000001) // HKEY_CURRENT_USER
    .callIat(iatRvaMap.RegCreateKeyExW)
    .testEaxEax()
    .jne('skipReg');

  // Quote UninstallString in bufMsg temporarily for spaces-safe Windows Settings/Control Panel uninstall
  asm
    .pushVa(strQuote)
    .pushVa(bufMsg)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(bufUninstallPath)
    .pushVa(bufMsg)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(strQuote)
    .pushVa(bufMsg)
    .callIat(iatRvaMap.lstrcatW);

  emitSetRegStr(strValDisplayName, strValDisplayData);
  emitSetRegStr(strValPublisher, strValPubData);
  emitSetRegStr(strValVersion, strValVerData);
  emitSetRegStr(strValInstallLoc, bufInstallDir);
  emitSetRegStr(strValDisplayIcon, bufExePath);
  emitSetRegStr(strValUninstall, bufMsg);

  asm.pushMemDwordVa(varRegKey).callIat(iatRvaMap.RegCloseKey).mark('skipReg');

  // Step 7: Show Completion Message & Launch Installed MINA_NET.exe
  asm
    .pushVa(strSuccessPrefix)
    .pushVa(bufMsg)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(bufInstallDir)
    .pushVa(bufMsg)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(strSuccessSuffix)
    .pushVa(bufMsg)
    .callIat(iatRvaMap.lstrcatW)
    .pushImm8(0x40) // MB_ICONINFORMATION
    .pushVa(strTitle)
    .pushVa(bufMsg)
    .pushImm8(0)
    .callIat(iatRvaMap.MessageBoxW);

  // Zero STARTUPINFOW & PROCESS_INFORMATION
  asm
    .cld()
    .xorEaxEax()
    .movEdiVa(bufStartupInfo)
    .movEcxImm32(24)
    .repStosd()
    .movMemVaDwordImm32(bufStartupInfo, 68);

  asm
    .pushVa(bufProcInfo)
    .pushVa(bufStartupInfo)
    .pushVa(bufInstallDir)
    .pushImm8(0)
    .pushImm8(0)
    .pushImm8(0)
    .pushImm8(0)
    .pushImm8(0)
    .pushImm8(0)
    .pushVa(bufExePath)
    .callIat(iatRvaMap.CreateProcessW)
    .testEaxEax()
    .jz('finishExit')
    .pushMemDwordVa(bufProcInfo)
    .callIat(iatRvaMap.CloseHandle)
    .pushMemDwordVa(bufProcInfo + 4)
    .callIat(iatRvaMap.CloseHandle)
    .mark('finishExit')
    .pushImm8(0)
    .callIat(iatRvaMap.ExitProcess);

  asm
    .mark('showError')
    .pushImm8(0x10)
    .pushVa(strTitle)
    .pushVa(strErrorMsg)
    .pushImm8(0)
    .callIat(iatRvaMap.MessageBoxW)
    .pushImm8(1)
    .callIat(iatRvaMap.ExitProcess);

  const textRaw = asm.finalize();
  if (textRaw.length > SECTION_ALIGN) {
    throw new Error(`Setup machine code exceeds 1 page (${textRaw.length} bytes)`);
  }

  // 4. .rsrc
  const rsrcRaw = buildResourceSection(RSRC_RVA, icoEntries);

  // 5. Assemble PE32 + Overlay
  const HEADERS_SIZE = 0x400;
  const textRawSize = alignUp(textRaw.length, FILE_ALIGN);
  const rdataRawSize = alignUp(rdataRaw.length, FILE_ALIGN);
  const dataRawSize = dataRaw.length;
  const rsrcRawSize = alignUp(rsrcRaw.length, FILE_ALIGN);

  const textFileOff = HEADERS_SIZE;
  const rdataFileOff = textFileOff + textRawSize;
  const dataFileOff = rdataFileOff + rdataRawSize;
  const rsrcFileOff = dataFileOff + dataRawSize;
  const overlayFileOff = rsrcFileOff + rsrcRawSize;

  // Patch exact overlay offset directly into .rdata before writing PE
  rdataRaw.writeUInt32LE(overlayFileOff, overlayOffsetFilePosInRdata);

  const sizeOfImage = RSRC_RVA + alignUp(rsrcRaw.length, SECTION_ALIGN);
  const peHead = Buffer.alloc(overlayFileOff, 0);

  peHead.write('MZ', 0, 'ascii');
  peHead.writeUInt32LE(0x80, 0x3c);
  peHead.write('PE\0\0', 0x80, 'ascii');

  const coff = 0x84;
  peHead.writeUInt16LE(0x014c, coff); // I386 universal (XP/Vista/7/8/10/11 32-bit, 64-bit, ARM64)
  peHead.writeUInt16LE(4, coff + 2);
  peHead.writeUInt32LE(Math.floor(Date.now() / 1000), coff + 4);
  peHead.writeUInt16LE(0x00e0, coff + 16);
  peHead.writeUInt16LE(0x0102, coff + 18);

  const opt = 0x98;
  peHead.writeUInt16LE(0x010b, opt);
  peHead.writeUInt8(14, opt + 2);
  peHead.writeUInt32LE(textRawSize, opt + 4);
  peHead.writeUInt32LE(rdataRawSize + dataRawSize + rsrcRawSize, opt + 8);
  peHead.writeUInt32LE(TEXT_RVA, opt + 16);
  peHead.writeUInt32LE(TEXT_RVA, opt + 20);
  peHead.writeUInt32LE(RDATA_RVA, opt + 24);
  peHead.writeUInt32LE(IMAGE_BASE, opt + 28);
  peHead.writeUInt32LE(SECTION_ALIGN, opt + 32);
  peHead.writeUInt32LE(FILE_ALIGN, opt + 36);
  peHead.writeUInt16LE(5, opt + 40);
  peHead.writeUInt16LE(1, opt + 42);
  peHead.writeUInt16LE(1, opt + 44);
  peHead.writeUInt16LE(5, opt + 48);
  peHead.writeUInt16LE(1, opt + 50);
  peHead.writeUInt32LE(sizeOfImage, opt + 56);
  peHead.writeUInt32LE(HEADERS_SIZE, opt + 60);
  peHead.writeUInt16LE(2, opt + 68); // GUI subsystem
  peHead.writeUInt16LE(0x8100, opt + 70);
  peHead.writeUInt32LE(0x100000, opt + 72);
  peHead.writeUInt32LE(0x1000, opt + 76);
  peHead.writeUInt32LE(0x100000, opt + 80);
  peHead.writeUInt32LE(0x1000, opt + 84);
  peHead.writeUInt32LE(16, opt + 92);

  const dd = opt + 96;
  peHead.writeUInt32LE(importDirRva, dd + 1 * 8);
  peHead.writeUInt32LE(importDirSize, dd + 1 * 8 + 4);
  peHead.writeUInt32LE(RSRC_RVA, dd + 2 * 8);
  peHead.writeUInt32LE(rsrcRaw.length, dd + 2 * 8 + 4);
  peHead.writeUInt32LE(iatStartRva, dd + 12 * 8);
  peHead.writeUInt32LE(iatTotalSize, dd + 12 * 8 + 4);

  const writeSection = (
    idx: number,
    name: string,
    virtualSize: number,
    virtualAddr: number,
    rawSize: number,
    rawPtr: number,
    characteristics: number
  ) => {
    const sh = opt + 224 + idx * 40;
    peHead.write(name.slice(0, 8), sh, 'ascii');
    peHead.writeUInt32LE(virtualSize, sh + 8);
    peHead.writeUInt32LE(virtualAddr, sh + 12);
    peHead.writeUInt32LE(rawSize, sh + 16);
    peHead.writeUInt32LE(rawPtr, sh + 20);
    peHead.writeUInt32LE(characteristics, sh + 36);
  };

  writeSection(0, '.text', textRaw.length, TEXT_RVA, textRawSize, textFileOff, 0x60000020);
  writeSection(1, '.rdata', rdataVirtualSize, RDATA_RVA, rdataRawSize, rdataFileOff, 0x40000040);
  writeSection(2, '.data', dataVirtualSize, DATA_RVA, dataRawSize, dataFileOff, 0xc0000040);
  writeSection(3, '.rsrc', rsrcRaw.length, RSRC_RVA, rsrcRawSize, rsrcFileOff, 0x40000040);

  textRaw.copy(peHead, textFileOff);
  rdataRaw.copy(peHead, rdataFileOff);
  dataRaw.copy(peHead, dataFileOff);
  rsrcRaw.copy(peHead, rsrcFileOff);

  return Buffer.concat([peHead, payloadArchive]);
}
