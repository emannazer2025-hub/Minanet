// Browser pure-JS Ed25519 verification + device fingerprint for direct standalone Desktop HTML
export interface LicensePayload {
  license_id: string;
  customer_name: string;
  customer_phone?: string;
  device_fingerprint: string;
  license_type: 'TRIAL' | 'MONTHLY' | 'YEARLY' | 'LIFETIME';
  max_devices: number;
  enabled_modules: string[];
  issued_at: string;
  expires_at: string | null;
}

export interface SignedLicenseFile {
  payload: LicensePayload;
  signature: string;
  algorithm: 'Ed25519';
}

const EMBEDDED_PUBLIC_KEY_PEM: string = import.meta.env.VITE_CLIENT_PUBLIC_KEY_PEM || '';
const EMBEDDED_PUBKEY_DIGEST: string = import.meta.env.VITE_PUBKEY_DIGEST || '';
const STRICT_ACTIVATION_FLAG: string = import.meta.env.VITE_STRICT_ACTIVATION || 'false';

export function isStrictActivationRequired(): boolean {
  return STRICT_ACTIVATION_FLAG === 'true';
}

const SHA512_K = [
  0x428a2f98d728ae22n, 0x7137449123ef65cdn, 0xb5c0fbcfec4d3b2fn, 0xe9b5dba58189dbbcn,
  0x3956c25bf348b538n, 0x59f111f1b605d019n, 0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n,
  0xd807aa98a3030242n, 0x12835b0145706fben, 0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n, 0x9bdc06a725c71235n, 0xc19bf174cf692694n,
  0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n, 0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n,
  0x2de92c6f592b0275n, 0x4a7484aa6ea6e483n, 0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
  0x983e5152ee66dfabn, 0xa831c66d2db43210n, 0xb00327c898fb213fn, 0xbf597fc7beef0ee4n,
  0xc6e00bf33da88fc2n, 0xd5a79147930aa725n, 0x06ca6351e003826fn, 0x142929670a0e6e70n,
  0x27b70a8546d22ffcn, 0x2e1b21385c26c926n, 0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
  0x650a73548baf63den, 0x766a0abb3c77b2a8n, 0x81c2c92e47edaee6n, 0x92722c851482353bn,
  0xa2bfe8a14cf10364n, 0xa81a664bbc423001n, 0xc24b8b70d0f89791n, 0xc76c51a30654be30n,
  0xd192e819d6ef5218n, 0xd69906245565a910n, 0xf40e35855771202an, 0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n, 0x2748774cdf8eeb99n, 0x34b0bcb5e19b48a8n,
  0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn, 0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n,
  0x748f82ee5defb2fcn, 0x78a5636f43172f60n, 0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
  0x90befffa23631e28n, 0xa4506cebde82bde9n, 0xbef9a3f7b2c67915n, 0xc67178f2e372532bn,
  0xca273eceea26619cn, 0xd186b8c721c0c207n, 0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n,
  0x06f067aa72176fban, 0x0a637dc5a2c898a6n, 0x113f9804bef90daen, 0x1b710b35131c471bn,
  0x28db77f523047d84n, 0x32caab7b40c72493n, 0x3c9ebe0a15c9bebcn, 0x431d67c49c100d4cn,
  0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an, 0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n,
];
const MASK64 = 0xffffffffffffffffn;
const rotr64 = (x: bigint, n: bigint) => ((x >> n) | (x << (64n - n))) & MASK64;

export function sha512(bytes: Uint8Array): Uint8Array {
  const len = bytes.length;
  const bitLen = BigInt(len) * 8n;
  const padLen = Math.ceil((len + 17) / 128) * 128;
  const buf = new Uint8Array(padLen);
  buf.set(bytes);
  buf[len] = 0x80;
  const dv = new DataView(buf.buffer);
  dv.setBigUint64(padLen - 8, bitLen, false);
  const H = [
    0x6a09e667f3bcc908n, 0xbb67ae8584caa73bn, 0x3c6ef372fe94f82bn, 0xa54ff53a5f1d36f1n,
    0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n,
  ];
  const W = new Array<bigint>(80);
  for (let off = 0; off < padLen; off += 128) {
    for (let i = 0; i < 16; i++) W[i] = dv.getBigUint64(off + i * 8, false);
    for (let i = 16; i < 80; i++) {
      const s0 = rotr64(W[i - 15], 1n) ^ rotr64(W[i - 15], 8n) ^ (W[i - 15] >> 7n);
      const s1 = rotr64(W[i - 2], 19n) ^ rotr64(W[i - 2], 61n) ^ (W[i - 2] >> 6n);
      W[i] = (W[i - 16] + s0 + W[i - 7] + s1) & MASK64;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 80; i++) {
      const S1 = rotr64(e, 14n) ^ rotr64(e, 18n) ^ rotr64(e, 41n);
      const ch = (e & f) ^ ((~e) & g);
      const t1 = (h + S1 + ch + SHA512_K[i] + W[i]) & MASK64;
      const S0 = rotr64(a, 28n) ^ rotr64(a, 34n) ^ rotr64(a, 39n);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) & MASK64;
      h = g; g = f; f = e; e = (d + t1) & MASK64;
      d = c; c = b; b = a; a = (t1 + t2) & MASK64;
    }
    H[0] = (H[0] + a) & MASK64; H[1] = (H[1] + b) & MASK64;
    H[2] = (H[2] + c) & MASK64; H[3] = (H[3] + d) & MASK64;
    H[4] = (H[4] + e) & MASK64; H[5] = (H[5] + f) & MASK64;
    H[6] = (H[6] + g) & MASK64; H[7] = (H[7] + h) & MASK64;
  }
  const out = new Uint8Array(64);
  const odv = new DataView(out.buffer);
  for (let i = 0; i < 8; i++) odv.setBigUint64(i * 8, H[i], false);
  return out;
}

const P = (1n << 255n) - 19n;
const L = (1n << 252n) + 27742317777372353535851937790883648493n;
const mod = (a: bigint, m = P) => {
  const r = a % m;
  return r >= 0n ? r : r + m;
};
function modPow(b: bigint, e: bigint, m: bigint) {
  let r = 1n;
  let base = mod(b, m);
  let exp = e;
  while (exp > 0n) {
    if (exp & 1n) r = (r * base) % m;
    base = (base * base) % m;
    exp >>= 1n;
  }
  return r;
}
const D_CONST = mod(-121665n * modPow(121666n, P - 2n, P));
const SQRT_M1 = modPow(2n, (P - 1n) / 4n, P);
const G_Y = mod(4n * modPow(5n, P - 2n, P));
const G_X = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
type Pt = [bigint, bigint, bigint, bigint];
const G: Pt = [G_X, G_Y, 1n, mod(G_X * G_Y)];

function ptAdd(p1: Pt, p2: Pt): Pt {
  const [X1, Y1, Z1, T1] = p1;
  const [X2, Y2, Z2, T2] = p2;
  const A = mod((Y1 - X1) * (Y2 - X2));
  const B = mod((Y1 + X1) * (Y2 + X2));
  const C = mod(2n * T1 * T2 * D_CONST);
  const D = mod(2n * Z1 * Z2);
  const E = mod(B - A), F = mod(D - C), G2 = mod(D + C), H2 = mod(B + A);
  return [mod(E * F), mod(G2 * H2), mod(F * G2), mod(E * H2)];
}
function ptMul(pt: Pt, k: bigint): Pt {
  let q: Pt = [0n, 1n, 1n, 0n];
  let p = pt;
  let s = k;
  while (s > 0n) {
    if (s & 1n) q = ptAdd(q, p);
    p = ptAdd(p, p);
    s >>= 1n;
  }
  return q;
}
function bytesToLeBigInt(b: Uint8Array): bigint {
  let r = 0n;
  for (let i = b.length - 1; i >= 0; i--) r = (r << 8n) | BigInt(b[i]);
  return r;
}
function decodePt(bytes: Uint8Array): Pt | null {
  if (bytes.length !== 32) return null;
  const copy = new Uint8Array(bytes);
  const sign = (copy[31] & 0x80) !== 0 ? 1n : 0n;
  copy[31] &= 0x7f;
  const y = bytesToLeBigInt(copy);
  if (y >= P) return null;
  const y2 = mod(y * y);
  const u = mod(y2 - 1n);
  const v = mod(D_CONST * y2 + 1n);
  const uv3 = mod(u * modPow(v, 3n, P));
  const uv7 = mod(u * modPow(v, 7n, P));
  let x = mod(uv3 * modPow(uv7, (P - 5n) / 8n, P));
  const vx2 = mod(v * x * x);
  if (vx2 === mod(-u)) x = mod(x * SQRT_M1);
  else if (vx2 !== u) return null;
  if (x === 0n && sign === 1n) return null;
  if ((x & 1n) !== sign) x = mod(P - x);
  return [x, y, 1n, mod(x * y)];
}
function ptEqual(p1: Pt, p2: Pt): boolean {
  return mod(p1[0] * p2[2]) === mod(p2[0] * p1[2]) && mod(p1[1] * p2[2]) === mod(p2[1] * p1[2]);
}
function verifyEd25519(msg: Uint8Array, pubBytes: Uint8Array, sigBytes: Uint8Array): boolean {
  if (sigBytes.length !== 64 || pubBytes.length !== 32) return false;
  const RBytes = sigBytes.slice(0, 32);
  const S = bytesToLeBigInt(sigBytes.slice(32, 64));
  if (S >= L) return false;
  const R = decodePt(RBytes);
  const A = decodePt(pubBytes);
  if (!R || !A) return false;
  const kInput = new Uint8Array(32 + 32 + msg.length);
  kInput.set(RBytes);
  kInput.set(pubBytes, 32);
  kInput.set(msg, 64);
  const k = mod(bytesToLeBigInt(sha512(kInput)), L);
  return ptEqual(ptMul(G, S), ptAdd(R, ptMul(A, k)));
}

function sha512Hex(str: string): string {
  const bytes = sha512(new TextEncoder().encode(str));
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function isEmbeddedKeyValid(): boolean {
  if (!EMBEDDED_PUBLIC_KEY_PEM) return false;
  if (EMBEDDED_PUBKEY_DIGEST) {
    const clean = EMBEDDED_PUBLIC_KEY_PEM.trim().replace(/\r\n/g, '\n');
    return sha512Hex(clean) === EMBEDDED_PUBKEY_DIGEST;
  }
  return true;
}

export function getPublicKeyShortId(): string {
  if (!EMBEDDED_PUBLIC_KEY_PEM) return 'KEY-UNKNOWN';
  const clean = EMBEDDED_PUBLIC_KEY_PEM.trim().replace(/\r\n/g, '\n');
  const hex = sha512Hex(clean).toUpperCase();
  return `KEY-${hex.slice(0, 4)}-${hex.slice(4, 8)}`;
}

function extractRawPubKeyFromPem(pem: string): Uint8Array {
  const b64 = pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s+/g, '');
  const bin = atob(b64);
  const raw = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) raw[i] = bin.charCodeAt(i);
  return raw.slice(raw.length - 32);
}

let memoryFallbackFingerprint: string | null = null;

export function getDeviceFingerprint(): string {
  const key = 'mina_desktop_device_fp';
  let fp: string | null = null;
  try {
    fp = localStorage.getItem(key) || localStorage.getItem('plaza_desktop_device_fp');
  } catch {
    fp = memoryFallbackFingerprint;
  }
  if (!fp) {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'MinaNet';
    const plat = typeof navigator !== 'undefined' ? navigator.platform : 'Win32';
    const scr = typeof screen !== 'undefined' ? `${screen.width}x${screen.height}` : '1366x768';
    const seed = `${ua}|${plat}|${scr}|${Math.random().toString(36)}`;
    const digest = sha512(new TextEncoder().encode(seed));
    const hex = Array.from(digest.slice(0, 8))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    fp = `MINA-${hex.slice(0, 4)}-${hex.slice(4, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
    memoryFallbackFingerprint = fp;
    try {
      localStorage.setItem(key, fp);
    } catch {
      // ignore storage quota or file:/// restriction
    }
  }
  return fp;
}

export function canonicalPayloadString(payload: LicensePayload): string {
  return JSON.stringify({
    license_id: payload.license_id,
    customer_name: payload.customer_name,
    customer_phone: payload.customer_phone || '',
    device_fingerprint: payload.device_fingerprint,
    license_type: payload.license_type,
    max_devices: payload.max_devices,
    enabled_modules: [...payload.enabled_modules].sort(),
    issued_at: payload.issued_at,
    expires_at: payload.expires_at,
  });
}

export function decodeActivationCode(codeOrJson: string): SignedLicenseFile {
  let cleaned = codeOrJson.replace(/[\u200B-\u200F\u202A-\u202E\uFEFF]/g, '').trim();
  if (
    (cleaned.startsWith('"') && cleaned.endsWith('"')) ||
    (cleaned.startsWith("'") && cleaned.endsWith("'"))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned.startsWith('MINA1-') || cleaned.startsWith('PLZ1-')) {
    const prefixLen = cleaned.startsWith('MINA1-') ? 6 : 5;
    let b64 = cleaned.slice(prefixLen).replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return JSON.parse(new TextDecoder('utf-8').decode(bytes)) as SignedLicenseFile;
  }
  return JSON.parse(cleaned) as SignedLicenseFile;
}

export function verifySignedLicense(
  signed: SignedLicenseFile,
  currentFingerprint: string,
  revokedIds: string[] = []
): { valid: boolean; reason?: string } {
  try {
    if (!signed || !signed.payload || !signed.signature) {
      return { valid: false, reason: 'بنية ملف الترخيص غير صالحة' };
    }
    if (!isEmbeddedKeyValid()) {
      return { valid: false, reason: 'تم التعديل على المفتاح العام المضمن للتحقق' };
    }
    const pubBytes = extractRawPubKeyFromPem(EMBEDDED_PUBLIC_KEY_PEM);
    const cleanSig = String(signed.signature).replace(/\s+/g, '');
    const sigBin = atob(cleanSig);
    const sigBytes = new Uint8Array(sigBin.length);
    for (let i = 0; i < sigBin.length; i++) sigBytes[i] = sigBin.charCodeAt(i);
    const canonical = new TextEncoder().encode(canonicalPayloadString(signed.payload));
    const ok = verifyEd25519(canonical, pubBytes, sigBytes);
    if (!ok) {
      return { valid: false, reason: 'التوقيع الرقمي غير صحيح أو تم التعديل على ملف الترخيص' };
    }
    if (revokedIds.includes(signed.payload.license_id)) {
      return { valid: false, reason: 'تم إيقاف أو إلغاء هذا الترخيص في قائمة الإبطال' };
    }
    if (
      signed.payload.device_fingerprint !== 'MULTI_DEVICE' &&
      signed.payload.device_fingerprint !== currentFingerprint
    ) {
      return {
        valid: false,
        reason: `الترخيص مقيد بجهاز آخر (${signed.payload.device_fingerprint}) ولا يطابق بصمة هذا الجهاز`,
      };
    }
    if (signed.payload.expires_at) {
      const exp = new Date(signed.payload.expires_at).getTime();
      if (Date.now() > exp) {
        return { valid: false, reason: 'انتهت صلاحية الترخيص في ' + signed.payload.expires_at.slice(0, 10) };
      }
    }
    return { valid: true };
  } catch {
    return { valid: false, reason: 'تعذر التحقق من صحة الترخيص الرقمي' };
  }
}
