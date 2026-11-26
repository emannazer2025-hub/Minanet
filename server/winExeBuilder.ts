import fs from 'fs';
import path from 'path';

// Pure TypeScript Universal Win32 (PE32 x86) GUI Executable Generator
// Machine = 0x014C (I386), OS/Subsystem = 5.1 (Windows XP / Vista / 7 / 8 / 8.1 / 10 / 11 - 32-bit, 64-bit WOW64 & ARM64)
// Embedded multi-resolution Mina Net icon (plaza.ico) and VS_VERSION_INFO metadata.

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

interface ExeLauncherConfig {
  productName: string;
  fileDescription: string;
  internalName: string;
  originalFilename: string;
  directHtmlFilename: string;
  profileDirName: string;
  nodeRunArgs: string;
  nodeHealthUrl: string;
  localServerUrl: string;
  windowSize: string;
}

function buildVersionResourceBuffer(cfg: ExeLauncherConfig): Buffer {
  const writePaddedBlock = (
    key: string,
    value: Buffer | null,
    type: number,
    children: Buffer[]
  ): Buffer => {
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
    makeString('FileDescription', cfg.fileDescription),
    makeString('FileVersion', '1.0.0.0'),
    makeString('InternalName', cfg.internalName),
    makeString('OriginalFilename', cfg.originalFilename),
    makeString('ProductName', cfg.productName),
    makeString('ProductVersion', '1.0.0.0'),
  ]);

  const stringFileInfo = writePaddedBlock('StringFileInfo', null, 1, [stringTable]);

  const translation = Buffer.alloc(4);
  translation.writeUInt16LE(0x0409, 0);
  translation.writeUInt16LE(0x04b0, 2);
  const varEntry = writePaddedBlock('Translation', translation, 0, []);
  const varFileInfo = writePaddedBlock('VarFileInfo', null, 1, [varEntry]);

  const fixed = Buffer.alloc(52, 0);
  fixed.writeUInt32LE(0xfeef04bd, 0); // dwSignature
  fixed.writeUInt32LE(0x00010000, 4); // dwStrucVersion
  fixed.writeUInt32LE(0x00010000, 8); // dwFileVersionMS
  fixed.writeUInt32LE(0x00000000, 12); // dwFileVersionLS
  fixed.writeUInt32LE(0x00010000, 16); // dwProductVersionMS
  fixed.writeUInt32LE(0x00000000, 20); // dwProductVersionLS
  fixed.writeUInt32LE(0x0000003f, 24); // dwFileFlagsMask
  fixed.writeUInt32LE(0x00000000, 28); // dwFileFlags
  fixed.writeUInt32LE(0x00040004, 32); // dwFileOS (VOS_NT_WINDOWS32)
  fixed.writeUInt32LE(0x00000001, 36); // dwFileType (VFT_APP)
  fixed.writeUInt32LE(0x00000000, 40); // dwFileSubtype

  return writePaddedBlock('VS_VERSION_INFO', fixed, 0, [stringFileInfo, varFileInfo]);
}

function buildResourceSection(rsrcRva: number, icoEntries: IcoEntry[], cfg: ExeLauncherConfig): Buffer {
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
  leaves.push({ typeId: 16, nameId: 1, langId: 0x0409, data: buildVersionResourceBuffer(cfg) });

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

class X86Emitter {
  private buf: number[] = [];
  private labels = new Map<string, number>();
  private labelFixups: Array<{ instrEnd: number; patchOffset: number; label: string }> = [];
  private imageBase: number;

  constructor(imageBase: number) {
    this.imageBase = imageBase >>> 0;
  }

  private va(rva: number): number {
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
  pushMemDwordVa(rva: number): this {
    return this.emit(0xff, 0x35).emitU32(this.va(rva));
  }
  callIat(iatRva: number): this {
    return this.emit(0xff, 0x15).emitU32(this.va(iatRva));
  }
  cld(): this {
    return this.emit(0xfc);
  }
  xorEaxEax(): this {
    return this.emit(0x31, 0xc0);
  }
  xorEbxEbx(): this {
    return this.emit(0x31, 0xdb);
  }
  incEbx(): this {
    return this.emit(0x43);
  }
  movEdiVa(rva: number): this {
    return this.emit(0xbf).emitU32(this.va(rva));
  }
  movEcxImm32(v: number): this {
    return this.emit(0xb9).emitU32(v);
  }
  repStosd(): this {
    return this.emit(0xf3, 0xab);
  }
  movMemVaDwordImm32(rva: number, imm32: number): this {
    return this.emit(0xc7, 0x05).emitU32(this.va(rva)).emitU32(imm32);
  }
  cmpMemVaDwordImm8(rva: number, imm8: number): this {
    return this.emit(0x83, 0x3d).emitU32(this.va(rva)).emit(imm8 & 0xff);
  }
  cmpMemVaWordImm16(rva: number, imm16: number): this {
    return this.emit(0x66, 0x81, 0x3d).emitU32(this.va(rva)).emit(imm16 & 0xff, (imm16 >> 8) & 0xff);
  }
  testEaxEax(): this {
    return this.emit(0x85, 0xc0);
  }
  testAlImm8(v: number): this {
    return this.emit(0xa8, v & 0xff);
  }
  cmpEaxMinusOne(): this {
    return this.emit(0x83, 0xf8, 0xff);
  }
  cmpEaxImm8(v: number): this {
    return this.emit(0x83, 0xf8, v & 0xff);
  }
  leaEdxEax2Disp(rva: number, deltaBytes = 0): this {
    // lea edx, [eax*2 + va(rva) + deltaBytes]
    return this.emit(0x8d, 0x14, 0x45).emitU32((this.va(rva) + deltaBytes) >>> 0);
  }
  cmpEdxVa(rva: number): this {
    return this.emit(0x81, 0xfa).emitU32(this.va(rva));
  }
  cmpWordPtrEdxBackslash(): this {
    return this.emit(0x66, 0x81, 0x3a, 0x5c, 0x00);
  }
  subEdx2(): this {
    return this.emit(0x83, 0xea, 0x02);
  }
  movWordPtrEdxPlus2Zero(): this {
    return this.emit(0x66, 0xc7, 0x42, 0x02, 0x00, 0x00);
  }
  movEaxTableIndexedByEbx(tableRva: number): this {
    // mov eax, dword ptr [ebx*4 + va(tableRva)]
    return this.emit(0x8b, 0x04, 0x9d).emitU32(this.va(tableRva));
  }
  addEaxVa(rva: number): this {
    return this.emit(0x05).emitU32(this.va(rva));
  }

  private emitJmpRel32(opcodeBytes: number[], label: string): this {
    this.emit(...opcodeBytes);
    const patchOffset = this.buf.length;
    this.emitI32(0);
    this.labelFixups.push({ instrEnd: this.buf.length, patchOffset, label });
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
  jb(label: string): this {
    return this.emitJmpRel32([0x0f, 0x82], label);
  }
  ja(label: string): this {
    return this.emitJmpRel32([0x0f, 0x87], label);
  }
  jns(label: string): this {
    return this.emitJmpRel32([0x0f, 0x89], label);
  }
  jz(label: string): this {
    return this.je(label);
  }
  jnz(label: string): this {
    return this.jne(label);
  }

  finalize(): Buffer {
    const out = Buffer.from(this.buf);
    for (const lx of this.labelFixups) {
      const targetOff = this.labels.get(lx.label);
      if (targetOff === undefined) {
        throw new Error(`Undefined assembler label: ${lx.label}`);
      }
      out.writeInt32LE(targetOff - lx.instrEnd, lx.patchOffset);
    }
    return out;
  }
}

export function buildWindowsLauncherExe(cfg: ExeLauncherConfig): Buffer {
  const icoPath = path.join(process.cwd(), 'public', 'plaza.ico');
  const icoEntries = parseIcoFile(icoPath);

  // PE32 (Win32 x86) constants - Fixed base 0x00400000 (no DYNAMIC_BASE), runs on XP/Vista/7/8/8.1/10/11 (32-bit, 64-bit WOW64 & ARM64)
  const IMAGE_BASE = 0x00400000;
  const SECTION_ALIGN = 0x1000;
  const FILE_ALIGN = 0x200;
  const TEXT_RVA = 0x1000;
  const RDATA_RVA = 0x2000;

  // ---------------------------------------------------
  // 1. Build .rdata (Strings, Browser Table, Import Dir, IAT)
  // ---------------------------------------------------
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

  // UTF-16LE Strings
  const strNodeModules = allocRdata(utf16leNull('node_modules'));
  const strNodeExe = allocRdata(utf16leNull('node.exe'));
  const strQuote = allocRdata(utf16leNull('"'));
  const strNodeRunLauncher = allocRdata(utf16leNull(`" ${cfg.nodeRunArgs}`));
  // Pure built-in http check (compatible with every Node.js version from Windows 7's Node 12/14 through Node 24)
  const strNodeWaitArgs = allocRdata(
    utf16leNull(
      `" -e "const h=require('http');let n=30;(function t(){const q=h.get('${cfg.nodeHealthUrl}',r=>{r.resume();if(r.statusCode<400)process.exit(0);else if(--n>0)setTimeout(t,350);else process.exit(1)});q.on('error',()=>{if(--n>0)setTimeout(t,350);else process.exit(1)})})();"`
    )
  );
  const strLocalhostUrl = allocRdata(utf16leNull(cfg.localServerUrl));
  const strDirectHtmlSuffix = allocRdata(utf16leNull(cfg.directHtmlFilename));
  const strProfileEnv = allocRdata(utf16leNull(`%LocalAppData%\\${cfg.profileDirName}`));
  const strProfileFallback = allocRdata(utf16leNull(cfg.profileDirName));
  const strUserDataMid = allocRdata(utf16leNull('" --user-data-dir="'));
  const strUserDataOnlyPrefix = allocRdata(utf16leNull('--user-data-dir="'));
  const strAppArgMid = allocRdata(utf16leNull('" --app="'));
  // Note: DO NOT pass --new-window with --app=; on Win7 Chrome 70-109 it breaks standalone --app mode into a regular browser window.
  const strAppArgEnd = allocRdata(
    utf16leNull(`" --window-size=${cfg.windowSize} --no-first-run --no-default-browser-check`)
  );
  const strOpen = allocRdata(utf16leNull('open'));
  const strMsEdgeExe = allocRdata(utf16leNull('msedge.exe'));
  const strChromeExe = allocRdata(utf16leNull('chrome.exe'));
  const strBraveExe = allocRdata(utf16leNull('brave.exe'));
  const strOperaExe = allocRdata(utf16leNull('opera.exe'));
  const strTitle = allocRdata(utf16leNull(cfg.productName));
  const strMissingMsg = allocRdata(
    utf16leNull(
      `ملف التشغيل ${cfg.directHtmlFilename} غير موجود في نفس المجلد.\nيرجى استخراج جميع ملفات الضغط كاملةً في مجلد واحد ثم إعادة المحاولة.`
    )
  );

  // Browser candidate paths covering 64-bit (%ProgramW6432%), 32-bit (%ProgramFiles%), WOW64 (%ProgramFiles(x86)%), User (%LocalAppData%), & XP/Win7 paths (including Supermium, Opera, Thorium)
  const browserTemplates = [
    '%ProgramW6432%\\Microsoft\\Edge\\Application\\msedge.exe',
    '%ProgramFiles(x86)%\\Microsoft\\Edge\\Application\\msedge.exe',
    '%ProgramFiles%\\Microsoft\\Edge\\Application\\msedge.exe',
    '%LocalAppData%\\Microsoft\\Edge\\Application\\msedge.exe',
    '%ProgramW6432%\\Google\\Chrome\\Application\\chrome.exe',
    '%ProgramFiles%\\Google\\Chrome\\Application\\chrome.exe',
    '%ProgramFiles(x86)%\\Google\\Chrome\\Application\\chrome.exe',
    '%LocalAppData%\\Google\\Chrome\\Application\\chrome.exe',
    '%UserProfile%\\Local Settings\\Application Data\\Google\\Chrome\\Application\\chrome.exe',
    '%LocalAppData%\\Google\\Chrome SxS\\Application\\chrome.exe',
    '%LocalAppData%\\Supermium\\Application\\chrome.exe',
    '%ProgramW6432%\\Supermium\\Application\\chrome.exe',
    '%ProgramFiles%\\Supermium\\Application\\chrome.exe',
    '%ProgramFiles(x86)%\\Supermium\\Application\\chrome.exe',
    '%ProgramW6432%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    '%ProgramFiles%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    '%ProgramFiles(x86)%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    '%LocalAppData%\\BraveSoftware\\Brave-Browser\\Application\\brave.exe',
    '%LocalAppData%\\Chromium\\Application\\chrome.exe',
    '%ProgramFiles%\\Chromium\\Application\\chrome.exe',
    '%ProgramFiles(x86)%\\Chromium\\Application\\chrome.exe',
    '%LocalAppData%\\Thorium\\Application\\thorium.exe',
    '%LocalAppData%\\Programs\\Opera\\opera.exe',
    '%ProgramW6432%\\Opera\\opera.exe',
    '%ProgramFiles%\\Opera\\opera.exe',
    '%ProgramFiles(x86)%\\Opera\\opera.exe',
    '%LocalAppData%\\Vivaldi\\Application\\vivaldi.exe',
    '%ProgramFiles%\\Vivaldi\\Application\\vivaldi.exe',
    '%ProgramFiles(x86)%\\Vivaldi\\Application\\vivaldi.exe',
    '%LocalAppData%\\Yandex\\YandexBrowser\\Application\\browser.exe',
  ];
  const tableBuf = Buffer.alloc((browserTemplates.length + 1) * 4, 0);
  const browserOffsetTableRva = allocRdata(tableBuf, 4);
  const browserStrRvas = browserTemplates.map((t) => allocRdata(utf16leNull(t)));
  browserStrRvas.forEach((rva, idx) => {
    tableBuf.writeUInt32LE(rva - browserOffsetTableRva, idx * 4);
  });

  // Import Directory definition
  const importsSpec: Array<{ dll: string; funcs: string[] }> = [
    {
      dll: 'KERNEL32.dll',
      funcs: [
        'GetModuleFileNameW',
        'SetCurrentDirectoryW',
        'GetFileAttributesW',
        'SearchPathW',
        'ExpandEnvironmentStringsW',
        'CreateProcessW',
        'WaitForSingleObject',
        'GetExitCodeProcess',
        'CloseHandle',
        'lstrcpyW',
        'lstrcatW',
        'ExitProcess',
      ],
    },
    { dll: 'USER32.dll', funcs: ['MessageBoxW'] },
    { dll: 'SHELL32.dll', funcs: ['ShellExecuteW'] },
    { dll: 'SHLWAPI.dll', funcs: ['UrlCreateFromPathW'] },
  ];

  const dllNameRvas = importsSpec.map((imp) => allocRdata(asciiNull(imp.dll), 2));
  const hintNameRvas = importsSpec.map((imp) =>
    imp.funcs.map((fn) => {
      const ascii = asciiNull(fn);
      const entry = Buffer.alloc(2 + ascii.length + ((ascii.length & 1) ? 1 : 0), 0);
      entry.writeUInt16LE(0, 0);
      ascii.copy(entry, 2);
      return allocRdata(entry, 2);
    })
  );

  // PE32 ILT and IAT (4 bytes per entry!)
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
    importDescBuf.writeUInt32LE(0, off + 4);
    importDescBuf.writeUInt32LE(0, off + 8);
    importDescBuf.writeUInt32LE(dllNameRvas[dIdx], off + 12);
    importDescBuf.writeUInt32LE(iatRvas[dIdx], off + 16);
  });
  const importDirRva = allocRdata(importDescBuf, 4);
  const importDirSize = importDescBuf.length;

  const rdataRaw = Buffer.concat(rdataChunks);
  const rdataVirtualSize = rdataRaw.length;
  const DATA_RVA = RDATA_RVA + alignUp(Math.max(1, rdataVirtualSize), SECTION_ALIGN);

  // ---------------------------------------------------
  // 2. Layout .data (zero-initialized writable buffers)
  // ---------------------------------------------------
  let dataCursor = 0;
  const allocData = (bytes: number, align = 8): number => {
    dataCursor = alignUp(dataCursor, align);
    const rva = DATA_RVA + dataCursor;
    dataCursor += bytes;
    return rva;
  };

  const bufDirPath = allocData(2048, 8);
  const bufHtmlPath = allocData(2048, 8);
  const bufUrl = allocData(4096, 8);
  const bufNodeModPath = allocData(2048, 8);
  const bufNodeExe = allocData(2048, 8);
  const bufBrowserPath = allocData(2048, 8);
  const bufProfileDir = allocData(2048, 8);
  const bufCmdLine = allocData(8192, 8);
  const bufStartupInfo = allocData(80, 4); // 32-bit STARTUPINFOW = 68 bytes
  const bufProcInfo = allocData(16, 4); // 32-bit PROCESS_INFORMATION = 16 bytes (hProcess @ +0, hThread @ +4)
  const varUrlLen = allocData(4, 4);
  const varExitCode = allocData(4, 4);

  const dataVirtualSize = dataCursor;
  const dataRaw = Buffer.alloc(alignUp(dataVirtualSize, FILE_ALIGN), 0);
  const RSRC_RVA = DATA_RVA + alignUp(dataVirtualSize, SECTION_ALIGN);

  // ---------------------------------------------------
  // 3. Emit x86 Win32 stdcall machine code in .text
  // ---------------------------------------------------
  const asm = new X86Emitter(IMAGE_BASE);

  const emitZeroStartupInfo = () => {
    asm
      .cld()
      .xorEaxEax()
      .movEdiVa(bufStartupInfo)
      .movEcxImm32(24) // 24 * 4 = 96 bytes covers bufStartupInfo (80) + bufProcInfo (16)
      .repStosd()
      .movMemVaDwordImm32(bufStartupInfo, 68); // 32-bit STARTUPINFOW.cb = 68
  };

  // GetModuleFileNameW(NULL, bufDirPath, 1024)
  asm
    .pushImm32(1024)
    .pushVa(bufDirPath)
    .pushImm8(0)
    .callIat(iatRvaMap.GetModuleFileNameW)
    .testEaxEax()
    .je('showMissingHtml');

  // Strip executable filename after last '\' preserving trailing '\' so drive roots like D:\ work
  asm
    .leaEdxEax2Disp(bufDirPath, -2)
    .mark('stripLoop')
    .cmpEdxVa(bufDirPath)
    .jb('stripDone')
    .cmpWordPtrEdxBackslash()
    .je('foundSlash')
    .subEdx2()
    .jmp('stripLoop')
    .mark('foundSlash')
    .movWordPtrEdxPlus2Zero()
    .mark('stripDone');

  // SetCurrentDirectoryW(bufDirPath)
  asm.pushVa(bufDirPath).callIat(iatRvaMap.SetCurrentDirectoryW);

  // Check if <dir>node_modules exists (directory) AND node.exe is in PATH
  asm
    .pushVa(bufDirPath)
    .pushVa(bufNodeModPath)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(strNodeModules)
    .pushVa(bufNodeModPath)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(bufNodeModPath)
    .callIat(iatRvaMap.GetFileAttributesW)
    .cmpEaxMinusOne()
    .je('tryDirectMode')
    .testAlImm8(0x10)
    .jz('tryDirectMode');

  // SearchPathW(NULL, L"node.exe", NULL, 1024, bufNodeExe, NULL)
  asm
    .pushImm8(0)
    .pushVa(bufNodeExe)
    .pushImm32(1024)
    .pushImm8(0)
    .pushVa(strNodeExe)
    .pushImm8(0)
    .callIat(iatRvaMap.SearchPathW)
    .testEaxEax()
    .je('tryDirectMode');

  // Launch Node server hidden: "<nodeExe>" <nodeRunArgs>
  emitZeroStartupInfo();
  asm
    .pushVa(strQuote)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(bufNodeExe)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(strNodeRunLauncher)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW);

  // CreateProcessW(NULL, bufCmdLine, NULL, NULL, FALSE, CREATE_NO_WINDOW, NULL, bufDirPath, &si, &pi)
  asm
    .pushVa(bufProcInfo)
    .pushVa(bufStartupInfo)
    .pushVa(bufDirPath)
    .pushImm8(0)
    .pushImm32(0x08000000) // CREATE_NO_WINDOW
    .pushImm8(0)
    .pushImm8(0)
    .pushImm8(0)
    .pushVa(bufCmdLine)
    .pushImm8(0)
    .callIat(iatRvaMap.CreateProcessW)
    .testEaxEax()
    .je('tryDirectMode')
    .pushMemDwordVa(bufProcInfo)
    .callIat(iatRvaMap.CloseHandle)
    .pushMemDwordVa(bufProcInfo + 4)
    .callIat(iatRvaMap.CloseHandle);

  // Wait for localhost readiness via Node http probe
  emitZeroStartupInfo();
  asm
    .pushVa(strQuote)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(bufNodeExe)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(strNodeWaitArgs)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW);

  asm
    .pushVa(bufProcInfo)
    .pushVa(bufStartupInfo)
    .pushVa(bufDirPath)
    .pushImm8(0)
    .pushImm32(0x08000000)
    .pushImm8(0)
    .pushImm8(0)
    .pushImm8(0)
    .pushVa(bufCmdLine)
    .pushImm8(0)
    .callIat(iatRvaMap.CreateProcessW)
    .testEaxEax()
    .je('tryDirectMode')
    .pushImm32(15000)
    .pushMemDwordVa(bufProcInfo)
    .callIat(iatRvaMap.WaitForSingleObject)
    .movMemVaDwordImm32(varExitCode, 1)
    .pushVa(varExitCode)
    .pushMemDwordVa(bufProcInfo)
    .callIat(iatRvaMap.GetExitCodeProcess)
    .pushMemDwordVa(bufProcInfo)
    .callIat(iatRvaMap.CloseHandle)
    .pushMemDwordVa(bufProcInfo + 4)
    .callIat(iatRvaMap.CloseHandle)
    .cmpMemVaDwordImm8(varExitCode, 0)
    .jne('tryDirectMode')
    .pushVa(strLocalhostUrl)
    .pushVa(bufUrl)
    .callIat(iatRvaMap.lstrcpyW)
    .jmp('launchBrowser');

  // Direct zero-install desktop HTML mode
  asm
    .mark('tryDirectMode')
    .pushVa(bufDirPath)
    .pushVa(bufHtmlPath)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(strDirectHtmlSuffix)
    .pushVa(bufHtmlPath)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(bufHtmlPath)
    .callIat(iatRvaMap.GetFileAttributesW)
    .cmpEaxMinusOne()
    .je('showMissingHtml')
    .testAlImm8(0x10)
    .jnz('showMissingHtml');

  // UrlCreateFromPathW(bufHtmlPath, bufUrl, &varUrlLen, 0)
  asm
    .movMemVaDwordImm32(varUrlLen, 2048)
    .pushImm8(0)
    .pushVa(varUrlLen)
    .pushVa(bufUrl)
    .pushVa(bufHtmlPath)
    .callIat(iatRvaMap.UrlCreateFromPathW)
    .testEaxEax()
    .jns('launchBrowser')
    .pushVa(bufHtmlPath)
    .pushVa(bufUrl)
    .callIat(iatRvaMap.lstrcpyW);

  // Resolve isolated profile directory (%LocalAppData%\MinaNetProfile, fallback <exeDir>MinaNetProfile)
  // Using a dedicated --user-data-dir guarantees standalone --app desktop window even if user's browser is already running on Win7.
  asm
    .mark('launchBrowser')
    .pushImm32(1024)
    .pushVa(bufProfileDir)
    .pushVa(strProfileEnv)
    .callIat(iatRvaMap.ExpandEnvironmentStringsW)
    .cmpMemVaWordImm16(bufProfileDir, 0x0025)
    .jne('profileReady')
    .pushVa(bufDirPath)
    .pushVa(bufProfileDir)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(strProfileFallback)
    .pushVa(bufProfileDir)
    .callIat(iatRvaMap.lstrcatW)
    .mark('profileReady')
    .xorEbxEbx()
    .mark('browserLoop')
    .movEaxTableIndexedByEbx(browserOffsetTableRva)
    .testEaxEax()
    .je('fallbackShellOpen')
    .addEaxVa(browserOffsetTableRva)
    .pushImm32(1024)
    .pushVa(bufBrowserPath)
    .pushEax()
    .callIat(iatRvaMap.ExpandEnvironmentStringsW)
    .pushVa(bufBrowserPath)
    .callIat(iatRvaMap.GetFileAttributesW)
    .cmpEaxMinusOne()
    .je('nextBrowser')
    .testAlImm8(0x10)
    .jnz('nextBrowser');

  asm
    .pushVa(strQuote)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(bufBrowserPath)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(strUserDataMid)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(bufProfileDir)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(strAppArgMid)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(bufUrl)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(strAppArgEnd)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW);

  emitZeroStartupInfo();
  asm
    .pushVa(bufProcInfo)
    .pushVa(bufStartupInfo)
    .pushImm8(0) // NULL lpCurrentDirectory for browser
    .pushImm8(0)
    .pushImm8(0)
    .pushImm8(0)
    .pushImm8(0)
    .pushImm8(0)
    .pushVa(bufCmdLine)
    .pushVa(bufBrowserPath)
    .callIat(iatRvaMap.CreateProcessW)
    .testEaxEax()
    .je('nextBrowser')
    .pushMemDwordVa(bufProcInfo)
    .callIat(iatRvaMap.CloseHandle)
    .pushMemDwordVa(bufProcInfo + 4)
    .callIat(iatRvaMap.CloseHandle)
    .pushImm8(0)
    .callIat(iatRvaMap.ExitProcess);

  asm.mark('nextBrowser').incEbx().jmp('browserLoop');

  // Registry App Paths / PATH lookup via ShellExecuteW so custom Chrome/Edge/Brave/Opera installs on Win7 still open in standalone --app mode
  asm
    .mark('fallbackShellOpen')
    .pushVa(strUserDataOnlyPrefix)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcpyW)
    .pushVa(bufProfileDir)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(strAppArgMid)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(bufUrl)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW)
    .pushVa(strAppArgEnd)
    .pushVa(bufCmdLine)
    .callIat(iatRvaMap.lstrcatW);

  for (const appExeRva of [strMsEdgeExe, strChromeExe, strBraveExe, strOperaExe]) {
    asm
      .pushImm8(1) // SW_SHOWNORMAL
      .pushImm8(0) // NULL lpDirectory
      .pushVa(bufCmdLine) // lpParameters: --user-data-dir="..." --app="..."
      .pushVa(appExeRva) // lpFile: resolved via App Paths registry / PATH
      .pushVa(strOpen)
      .pushImm8(0)
      .callIat(iatRvaMap.ShellExecuteW)
      .cmpEaxImm8(32)
      .ja('exitSuccess');
  }

  // Default browser fallback via ShellExecuteW (try URL first, then raw Windows file path)
  asm
    .pushImm8(1) // SW_SHOWNORMAL
    .pushImm8(0) // NULL lpDirectory
    .pushImm8(0)
    .pushVa(bufUrl)
    .pushVa(strOpen)
    .pushImm8(0)
    .callIat(iatRvaMap.ShellExecuteW)
    .cmpEaxImm8(32)
    .ja('exitSuccess')
    .pushImm8(1)
    .pushImm8(0)
    .pushImm8(0)
    .pushVa(bufHtmlPath)
    .pushVa(strOpen)
    .pushImm8(0)
    .callIat(iatRvaMap.ShellExecuteW)
    .cmpEaxImm8(32)
    .ja('exitSuccess')
    .jmp('showMissingHtml')
    .mark('exitSuccess')
    .pushImm8(0)
    .callIat(iatRvaMap.ExitProcess);

  // Error dialog if MINA_NET_DIRECT.html missing or cannot be opened
  asm
    .mark('showMissingHtml')
    .pushImm8(0x10) // MB_ICONERROR
    .pushVa(strTitle)
    .pushVa(strMissingMsg)
    .pushImm8(0)
    .callIat(iatRvaMap.MessageBoxW)
    .pushImm8(1)
    .callIat(iatRvaMap.ExitProcess);

  const textRaw = asm.finalize();
  if (textRaw.length > SECTION_ALIGN) {
    throw new Error(`Code exceeds 1 page (${textRaw.length} bytes)`);
  }

  // ---------------------------------------------------
  // 4. Build .rsrc section
  // ---------------------------------------------------
  const rsrcRaw = buildResourceSection(RSRC_RVA, icoEntries, cfg);

  // ---------------------------------------------------
  // 5. Assemble PE32 (Win32 x86) Headers & Sections
  // ---------------------------------------------------
  const HEADERS_SIZE = 0x400;
  const textRawSize = alignUp(textRaw.length, FILE_ALIGN);
  const rdataRawSize = alignUp(rdataRaw.length, FILE_ALIGN);
  const dataRawSize = dataRaw.length;
  const rsrcRawSize = alignUp(rsrcRaw.length, FILE_ALIGN);

  const textFileOff = HEADERS_SIZE;
  const rdataFileOff = textFileOff + textRawSize;
  const dataFileOff = rdataFileOff + rdataRawSize;
  const rsrcFileOff = dataFileOff + dataRawSize;
  const totalFileSize = rsrcFileOff + rsrcRawSize;

  const sizeOfImage = RSRC_RVA + alignUp(rsrcRaw.length, SECTION_ALIGN);
  const pe = Buffer.alloc(totalFileSize, 0);

  // DOS Header
  pe.write('MZ', 0, 'ascii');
  pe.writeUInt32LE(0x80, 0x3c); // e_lfanew = 0x80

  // PE Signature
  pe.write('PE\0\0', 0x80, 'ascii');

  // COFF Header (at 0x84, 20 bytes)
  const coff = 0x84;
  pe.writeUInt16LE(0x014c, coff); // Machine = IMAGE_FILE_MACHINE_I386 (universal x86/x64/ARM64 Windows)
  pe.writeUInt16LE(4, coff + 2); // NumberOfSections
  pe.writeUInt32LE(Math.floor(Date.now() / 1000), coff + 4);
  pe.writeUInt16LE(0x00e0, coff + 16); // SizeOfOptionalHeader = 224 (PE32)
  pe.writeUInt16LE(0x0102, coff + 18); // EXECUTABLE_IMAGE | 32BIT_MACHINE

  // Optional Header PE32 (at 0x98, 224 bytes)
  const opt = 0x98;
  pe.writeUInt16LE(0x010b, opt); // PE32 Magic
  pe.writeUInt8(14, opt + 2); // MajorLinkerVersion
  pe.writeUInt32LE(textRawSize, opt + 4); // SizeOfCode
  pe.writeUInt32LE(rdataRawSize + dataRawSize + rsrcRawSize, opt + 8); // SizeOfInitializedData
  pe.writeUInt32LE(TEXT_RVA, opt + 16); // AddressOfEntryPoint
  pe.writeUInt32LE(TEXT_RVA, opt + 20); // BaseOfCode
  pe.writeUInt32LE(RDATA_RVA, opt + 24); // BaseOfData
  pe.writeUInt32LE(IMAGE_BASE, opt + 28); // ImageBase (fixed 0x00400000)
  pe.writeUInt32LE(SECTION_ALIGN, opt + 32);
  pe.writeUInt32LE(FILE_ALIGN, opt + 36);
  pe.writeUInt16LE(5, opt + 40); // MajorOSVersion = 5 (XP/Vista/7/8/8.1/10/11)
  pe.writeUInt16LE(1, opt + 42); // MinorOSVersion = 1
  pe.writeUInt16LE(1, opt + 44); // MajorImageVersion
  pe.writeUInt16LE(5, opt + 48); // MajorSubsystemVersion = 5
  pe.writeUInt16LE(1, opt + 50); // MinorSubsystemVersion = 1
  pe.writeUInt32LE(sizeOfImage, opt + 56);
  pe.writeUInt32LE(HEADERS_SIZE, opt + 60);
  pe.writeUInt16LE(2, opt + 68); // IMAGE_SUBSYSTEM_WINDOWS_GUI
  pe.writeUInt16LE(0x8100, opt + 70); // NX_COMPAT | TERMINAL_SERVER_AWARE (fixed ImageBase)
  pe.writeUInt32LE(0x100000, opt + 72); // SizeOfStackReserve
  pe.writeUInt32LE(0x1000, opt + 76); // SizeOfStackCommit
  pe.writeUInt32LE(0x100000, opt + 80); // SizeOfHeapReserve
  pe.writeUInt32LE(0x1000, opt + 84); // SizeOfHeapCommit
  pe.writeUInt32LE(16, opt + 92); // NumberOfRvaAndSizes

  // Data Directories (at opt + 96 in PE32)
  const dd = opt + 96;
  pe.writeUInt32LE(importDirRva, dd + 1 * 8);
  pe.writeUInt32LE(importDirSize, dd + 1 * 8 + 4);
  pe.writeUInt32LE(RSRC_RVA, dd + 2 * 8);
  pe.writeUInt32LE(rsrcRaw.length, dd + 2 * 8 + 4);
  pe.writeUInt32LE(iatStartRva, dd + 12 * 8);
  pe.writeUInt32LE(iatTotalSize, dd + 12 * 8 + 4);

  // Section Table (at opt + 224 = 0x178, 4 * 40 = 160 bytes -> ends at 0x218 < 0x400)
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
    pe.write(name.slice(0, 8), sh, 'ascii');
    pe.writeUInt32LE(virtualSize, sh + 8);
    pe.writeUInt32LE(virtualAddr, sh + 12);
    pe.writeUInt32LE(rawSize, sh + 16);
    pe.writeUInt32LE(rawPtr, sh + 20);
    pe.writeUInt32LE(characteristics, sh + 36);
  };

  writeSection(0, '.text', textRaw.length, TEXT_RVA, textRawSize, textFileOff, 0x60000020);
  writeSection(1, '.rdata', rdataVirtualSize, RDATA_RVA, rdataRawSize, rdataFileOff, 0x40000040);
  writeSection(2, '.data', dataVirtualSize, DATA_RVA, dataRawSize, dataFileOff, 0xc0000040);
  writeSection(3, '.rsrc', rsrcRaw.length, RSRC_RVA, rsrcRawSize, rsrcFileOff, 0x40000040);

  textRaw.copy(pe, textFileOff);
  rdataRaw.copy(pe, rdataFileOff);
  dataRaw.copy(pe, dataFileOff);
  rsrcRaw.copy(pe, rsrcFileOff);

  return pe;
}

export function buildMinaNetWindowsExe(): Buffer {
  return buildWindowsLauncherExe({
    productName: 'Mina Net ERP',
    fileDescription: 'Mina Net ERP Desktop Application (All Windows Editions)',
    internalName: 'MINA_NET',
    originalFilename: 'MINA_NET.exe',
    directHtmlFilename: 'MINA_NET_DIRECT.html',
    profileDirName: 'MinaNetProfile',
    nodeRunArgs: 'runtime\\launcher.cjs',
    nodeHealthUrl: 'http://127.0.0.1:3000/api/license/status',
    localServerUrl: 'http://127.0.0.1:3000',
    windowSize: '1366,820',
  });
}

export function buildLicenseManagerWindowsExe(): Buffer {
  return buildWindowsLauncherExe({
    productName: 'Mina Net License Manager',
    fileDescription: 'Mina Net License Manager - أداة إصدار وتوقيع التراخيص (All Windows Editions)',
    internalName: 'LICENSE_MANAGER',
    originalFilename: 'LICENSE_MANAGER.exe',
    directHtmlFilename: 'OPEN_LICENSE_MANAGER_DIRECT.html',
    profileDirName: 'MinaLicenseProfile',
    nodeRunArgs: 'node_modules\\tsx\\dist\\cli.mjs tools\\license-manager-server.ts',
    nodeHealthUrl: 'http://127.0.0.1:3099/api/license-manager/vault',
    localServerUrl: 'http://127.0.0.1:3099',
    windowSize: '1180,780',
  });
}
