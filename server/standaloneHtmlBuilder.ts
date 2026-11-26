import { getPublicKeyShortId, type OwnerVault } from './licenseCrypto.ts';

/**
 * Generates a 100% self-contained single-file HTML tool (`OPEN_LICENSE_MANAGER_DIRECT.html`)
 * that opens directly via double-click (`file://`) in any browser without Node.js or a server.
 * Includes a pure-JS RFC 8032 Ed25519 + SHA-512 implementation so signing works identically
 * to Node's `crypto.sign(null, ..., pkcs8Pem)` even over `file://`.
 */
export function buildDirectOpenLicenseManagerHtml(vault: OwnerVault): string {
  const keyId = getPublicKeyShortId(vault.publicKeyPem);
  const safeVaultJson = JSON.stringify({
    publicKeyPem: vault.publicKeyPem,
    privateKeyPem: vault.privateKeyPem,
    createdAt: vault.createdAt,
  }).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mina Net License Manager — فتح مباشر بدون خادم</title>
  <style>
    * { box-sizing: border-box; font-family: Tahoma, 'Segoe UI', Arial, sans-serif; }
    body {
      margin: 0; padding: 18px; min-height: 100vh;
      background: linear-gradient(125deg, #dce6f3 0%, #b5cbe5 32%, #e6eef7 60%, #9fb9da 100%);
      color: #111827;
    }
    .win-window {
      max-width: 1120px; margin: 0 auto;
      background: #ece9d8; border: 1px solid #4a5568;
      box-shadow: 0 14px 36px rgba(15, 23, 42, 0.35), 0 0 0 1px rgba(255,255,255,0.6) inset;
    }
    .titlebar {
      height: 36px; background: #fff; border-bottom: 1px solid #cbd5e1;
      padding: 0 12px; display: flex; align-items: center; justify-content: space-between;
      font-size: 13px; font-weight: 700;
    }
    .badge {
      background: #214283; color: #fde047; padding: 2px 8px; border-radius: 3px; font-size: 11px;
    }
    .wrap { padding: 14px; font-size: 12px; }
    .banner {
      background: #172554; color: #fff; padding: 12px 14px; border: 1px solid #1e3a8a;
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 10px;
      margin-bottom: 12px;
    }
    .grid { display: grid; grid-template-columns: 5fr 7fr; gap: 14px; }
    @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } }
    .card { background: #fff; border: 1px solid #94a3b8; padding: 12px; }
    .card h2 {
      margin: 0 0 10px 0; font-size: 13px; color: #1e3a8a;
      border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;
    }
    label { display: block; font-weight: 700; margin-bottom: 3px; font-size: 11px; }
    input, select, textarea {
      width: 100%; padding: 6px 8px; border: 1px solid #7f9db9;
      background: #fff; font-size: 12px; margin-bottom: 8px;
    }
    .row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
    .win-btn {
      background: linear-gradient(180deg, #fbfbfb 0%, #e6e6e6 48%, #dcdcdc 52%, #ececec 100%);
      border: 1px solid #8c8c8c; box-shadow: inset 0 1px 0 #fff, 0 1px 2px rgba(0,0,0,0.12);
      color: #111827; padding: 6px 12px; cursor: pointer; font-weight: 700; font-size: 12px;
    }
    .win-btn:hover { background: linear-gradient(180deg, #eef6ff 0%, #d4e6fc 48%, #c2dbfa 52%, #e0edfd 100%); border-color: #3c7fb1; }
    .win-btn-primary {
      background: linear-gradient(180deg, #3c5ca8 0%, #243e82 50%, #1a306b 100%);
      color: #fff; border: 1px solid #1e3a8a; padding: 8px 14px; cursor: pointer; font-weight: 700; font-size: 12px; width: 100%;
    }
    .codebox {
      background: #fffbeb; border: 1px solid #f59e0b; padding: 10px; margin-top: 10px;
    }
    .mono { font-family: Consolas, 'Courier New', monospace; direction: ltr; }
    table { width: 100%; border-collapse: collapse; font-size: 11px; }
    th, td { border: 1px solid #cbd5e1; padding: 6px; text-align: right; }
    th { background: #dce6f2; font-weight: 700; }
    .status-active { background: #dcfce7; color: #166534; padding: 2px 6px; font-weight: 700; }
    .status-revoked { background: #fee2e2; color: #991b1b; padding: 2px 6px; font-weight: 700; }
    .msg { background: #eff6ff; border: 1px solid #60a5fa; color: #1e3a8a; padding: 8px 10px; margin-bottom: 10px; font-weight: 700; display: none; }
  </style>
</head>
<body>
  <div class="win-window">
    <div class="titlebar">
      <div>🔑 Mina Net License Manager — أداة التراخيص المستقلة (اسامه جرجس · 01153672084)</div>
      <span class="badge">Ed25519 · ${keyId}</span>
    </div>
    <div class="wrap">
      <div class="banner">
        <div>
          <div style="font-size:14px;font-weight:700;">مخزن المالك المستقل — المبرمج: اسامه جرجس (01153672084)</div>
          <div style="font-size:11px;color:#bfdbfe;margin-top:2px;">مفاتيح Ed25519 مضمّنة محلياً لإصدار أكواد تفعيل MINA1 وملفات .mnlic — معرف المفتاح: <strong class="mono" style="color:#fde047;">${keyId}</strong></div>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;">
          <button class="win-btn" onclick="downloadPublicKey()">تحميل المفتاح العام (PEM)</button>
          <button class="win-btn" onclick="downloadVaultBackup()">نسخة احتياطية للمخزن (JSON)</button>
          <button class="win-btn" onclick="exportRegistryCsv()">تصدير السجل (CSV)</button>
        </div>
      </div>

      <div id="msgBox" class="msg"></div>

      <div class="grid">
        <div class="card">
          <h2>إصدار ترخيص رسمي جديد</h2>
          <form id="issueForm">
            <label>اسم العميل / المنشأة *</label>
            <input id="custName" required placeholder="مثال: شركة النور للتجارة" />
            <div class="row2">
              <div>
                <label>هاتف العميل</label>
                <input id="custPhone" class="mono" placeholder="01000000000" />
              </div>
              <div>
                <label>بصمة الجهاز (أو MULTI_DEVICE)</label>
                <input id="devFp" class="mono" value="MULTI_DEVICE" />
              </div>
            </div>
            <div class="row2">
              <div>
                <label>نوع الترخيص</label>
                <select id="licType">
                  <option value="YEARLY">سنوي (365 يوم)</option>
                  <option value="MONTHLY">شهري (30 يوم)</option>
                  <option value="LIFETIME">دائم (مدى الحياة)</option>
                  <option value="TRIAL">تجريبي (30 يوم)</option>
                </select>
              </div>
              <div>
                <label>مدة مخصصة (أيام)</label>
                <input id="durDays" type="number" class="mono" value="365" />
              </div>
            </div>
            <div class="row2">
              <div>
                <label>الحد الأقصى للأجهزة</label>
                <input id="maxDev" type="number" min="1" class="mono" value="1" />
              </div>
              <div>
                <label>ملاحظات</label>
                <input id="notes" placeholder="اختياري" />
              </div>
            </div>
            <button type="submit" class="win-btn-primary">توليد وتوقيع الترخيص الآن (Ed25519)</button>
          </form>

          <div id="outputBox" class="codebox" style="display:none;">
            <div style="font-weight:700;color:#92400e;margin-bottom:4px;">تم التوقيع الرقمي بنجاح — <span id="outLicId" class="mono"></span></div>
            <textarea id="outCode" rows="4" readonly class="mono" style="font-size:11px;"></textarea>
            <div style="display:flex;gap:6px;">
              <button class="win-btn" type="button" onclick="copyCode()">نسخ كود التفعيل</button>
              <button class="win-btn" type="button" onclick="downloadMnlic()">تحميل ملف (.mnlic)</button>
            </div>
          </div>
        </div>

        <div class="card">
          <h2>سجل التراخيص المصدرة (محفوظ تلقائياً في المتصفح)</h2>
          <div style="overflow-x:auto;max-height:460px;">
            <table>
              <thead>
                <tr>
                  <th>رقم الترخيص</th>
                  <th>العميل</th>
                  <th>بصمة الجهاز</th>
                  <th>النوع</th>
                  <th>الانتهاء</th>
                  <th>الحالة</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody id="recordsBody"></tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script>
    const EMBEDDED_VAULT = ${safeVaultJson};
    const STORAGE_KEY = 'mina_direct_license_records_v1';
    let lastIssued = null;

    // Pure-JS SHA-512 + RFC 8032 Ed25519 (works 100% over file:// without secure context)
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
      0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an, 0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n
    ];
    const MASK64 = 0xffffffffffffffffn;
    const rotr64 = (x, n) => ((x >> n) | (x << (64n - n))) & MASK64;
    function sha512(bytes) {
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
        0x510e527fade682d1n, 0x9b05688c2b3e6c1fn, 0x1f83d9abfb41bd6bn, 0x5be0cd19137e2179n
      ];
      const W = new Array(80);
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
        H[0]=(H[0]+a)&MASK64; H[1]=(H[1]+b)&MASK64; H[2]=(H[2]+c)&MASK64; H[3]=(H[3]+d)&MASK64;
        H[4]=(H[4]+e)&MASK64; H[5]=(H[5]+f)&MASK64; H[6]=(H[6]+g)&MASK64; H[7]=(H[7]+h)&MASK64;
      }
      const out = new Uint8Array(64);
      const odv = new DataView(out.buffer);
      for (let i = 0; i < 8; i++) odv.setBigUint64(i * 8, H[i], false);
      return out;
    }

    const P = (1n << 255n) - 19n;
    const L = (1n << 252n) + 27742317777372353535851937790883648493n;
    const mod = (a, m = P) => { const r = a % m; return r >= 0n ? r : r + m; };
    function modPow(b, e, m) {
      let r = 1n; b = mod(b, m);
      while (e > 0n) { if (e & 1n) r = (r * b) % m; b = (b * b) % m; e >>= 1n; }
      return r;
    }
    const D_CONST = mod(-121665n * modPow(121666n, P - 2n, P));
    const G_Y = mod(4n * modPow(5n, P - 2n, P));
    const G_X = 15112221349535400772501151409588531511454012693041857206046113283949847762202n;
    const G = [G_X, G_Y, 1n, mod(G_X * G_Y)];
    function ptAdd(p1, p2) {
      const [X1, Y1, Z1, T1] = p1, [X2, Y2, Z2, T2] = p2;
      const A = mod((Y1 - X1) * (Y2 - X2));
      const B = mod((Y1 + X1) * (Y2 + X2));
      const C = mod(2n * T1 * T2 * D_CONST);
      const D = mod(2n * Z1 * Z2);
      const E = mod(B - A), F = mod(D - C), G2 = mod(D + C), H2 = mod(B + A);
      return [mod(E * F), mod(G2 * H2), mod(F * G2), mod(E * H2)];
    }
    function ptMul(pt, k) {
      let q = [0n, 1n, 1n, 0n], p = pt;
      while (k > 0n) { if (k & 1n) q = ptAdd(q, p); p = ptAdd(p, p); k >>= 1n; }
      return q;
    }
    function bytesToLeBigInt(b) {
      let r = 0n;
      for (let i = b.length - 1; i >= 0; i--) r = (r << 8n) | BigInt(b[i]);
      return r;
    }
    function leBigIntToBytes(n, len = 32) {
      const out = new Uint8Array(len);
      let x = n;
      for (let i = 0; i < len; i++) { out[i] = Number(x & 0xffn); x >>= 8n; }
      return out;
    }
    function encodePt(pt) {
      const zi = modPow(pt[2], P - 2n, P);
      const x = mod(pt[0] * zi), y = mod(pt[1] * zi);
      const out = leBigIntToBytes(y, 32);
      if (x & 1n) out[31] |= 0x80;
      return out;
    }
    function extractEd25519SeedFromPem(pem) {
      const b64 = pem.replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\\s+/g, '');
      const bin = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
      return bin.slice(bin.length - 32);
    }
    function signEd25519(msgBytes, privPem) {
      const seed = extractEd25519SeedFromPem(privPem);
      const h = sha512(seed);
      const aBytes = h.slice(0, 32);
      aBytes[0] &= 248; aBytes[31] &= 127; aBytes[31] |= 64;
      const a = bytesToLeBigInt(aBytes);
      const prefix = h.slice(32, 64);
      const A = encodePt(ptMul(G, a));
      const rInput = new Uint8Array(prefix.length + msgBytes.length);
      rInput.set(prefix); rInput.set(msgBytes, prefix.length);
      const r = mod(bytesToLeBigInt(sha512(rInput)), L);
      const R = encodePt(ptMul(G, r));
      const kInput = new Uint8Array(R.length + A.length + msgBytes.length);
      kInput.set(R); kInput.set(A, R.length); kInput.set(msgBytes, R.length + A.length);
      const k = mod(bytesToLeBigInt(sha512(kInput)), L);
      const S = mod(r + k * a, L);
      const sig = new Uint8Array(64);
      sig.set(R); sig.set(leBigIntToBytes(S, 32), 32);
      return btoa(String.fromCharCode(...sig));
    }
    function toBase64UrlUtf8(str) {
      const bytes = new TextEncoder().encode(str);
      let bin = '';
      for (const b of bytes) bin += String.fromCharCode(b);
      return btoa(bin).replace(/\\+/g, '-').replace(/\\//g, '_').replace(/=+$/, '');
    }
    function canonicalPayloadString(p) {
      return JSON.stringify({
        license_id: p.license_id,
        customer_name: p.customer_name,
        customer_phone: p.customer_phone || '',
        device_fingerprint: p.device_fingerprint,
        license_type: p.license_type,
        max_devices: p.max_devices,
        enabled_modules: [...p.enabled_modules].sort(),
        issued_at: p.issued_at,
        expires_at: p.expires_at,
      });
    }

    function showMsg(txt) {
      const el = document.getElementById('msgBox');
      el.textContent = txt;
      el.style.display = 'block';
    }
    function loadRecords() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); } catch { return []; }
    }
    function saveRecords(list) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
    }
    function renderRecords() {
      const tbody = document.getElementById('recordsBody');
      const list = loadRecords();
      if (!list.length) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:#64748b;padding:18px;">لم يتم إصدار تراخيص من هذه الأداة بعد</td></tr>';
        return;
      }
      tbody.innerHTML = list.map((r, i) => \`
        <tr>
          <td class="mono" style="font-weight:700;">\${r.license_id}</td>
          <td>\${r.customer_name}</td>
          <td class="mono">\${r.device_fingerprint}</td>
          <td>\${r.license_type}</td>
          <td class="mono">\${r.expires_at ? r.expires_at.slice(0,10) : 'دائم'}</td>
          <td><span class="\${r.status === 'ACTIVE' ? 'status-active' : 'status-revoked'}">\${r.status === 'ACTIVE' ? 'ساري' : 'ملغي'}</span></td>
          <td>
            <button class="win-btn" style="padding:2px 6px;font-size:11px;" onclick="copyByIdx(\${i})">نسخ</button>
            <button class="win-btn" style="padding:2px 6px;font-size:11px;color:#991b1b;" onclick="toggleRevoke(\${i})">\${r.status === 'ACTIVE' ? 'إبطال' : 'تفعيل'}</button>
          </td>
        </tr>
      \`).join('');
    }
    window.copyByIdx = function(i) {
      const list = loadRecords();
      if (list[i]) {
        navigator.clipboard?.writeText(list[i].activation_code);
        showMsg('تم نسخ كود التفعيل للعميل: ' + list[i].customer_name);
      }
    };
    window.toggleRevoke = function(i) {
      const list = loadRecords();
      if (list[i]) {
        list[i].status = list[i].status === 'ACTIVE' ? 'REVOKED' : 'ACTIVE';
        saveRecords(list);
        renderRecords();
      }
    };

    document.getElementById('licType').addEventListener('change', (e) => {
      const v = e.target.value;
      document.getElementById('durDays').value = v === 'MONTHLY' || v === 'TRIAL' ? 30 : v === 'YEARLY' ? 365 : 0;
    });

    document.getElementById('issueForm').addEventListener('submit', (e) => {
      e.preventDefault();
      const customer_name = document.getElementById('custName').value.trim();
      if (!customer_name) return;
      const customer_phone = document.getElementById('custPhone').value.trim();
      const device_fingerprint = document.getElementById('devFp').value.trim() || 'MULTI_DEVICE';
      const license_type = document.getElementById('licType').value;
      const duration_days = Number(document.getElementById('durDays').value || 365);
      const max_devices = Number(document.getElementById('maxDev').value || 1);
      const notes = document.getElementById('notes').value.trim();

      const license_id = 'MINA-' + new Date().getFullYear() + '-' + Math.floor(10000 + Math.random() * 90000);
      const issued_at = new Date().toISOString();
      let expires_at = null;
      if (license_type === 'TRIAL') expires_at = new Date(Date.now() + 30 * 86400000).toISOString();
      else if (license_type === 'MONTHLY') expires_at = new Date(Date.now() + (duration_days || 30) * 86400000).toISOString();
      else if (license_type === 'YEARLY') expires_at = new Date(Date.now() + (duration_days || 365) * 86400000).toISOString();

      const payload = {
        license_id, customer_name, customer_phone, device_fingerprint,
        license_type, max_devices, enabled_modules: ['ALL'], issued_at, expires_at
      };
      const canonical = canonicalPayloadString(payload);
      const signature = signEd25519(new TextEncoder().encode(canonical), EMBEDDED_VAULT.privateKeyPem);
      const signed = { payload, signature, algorithm: 'Ed25519' };
      const activation_code = 'MINA1-' + toBase64UrlUtf8(JSON.stringify(signed));
      const signed_json = JSON.stringify(signed, null, 2);

      lastIssued = { license_id, customer_name, customer_phone, device_fingerprint, license_type, max_devices, issued_at, expires_at, status: 'ACTIVE', activation_code, signed_json, notes };
      const list = loadRecords();
      list.unshift(lastIssued);
      saveRecords(list);
      renderRecords();

      document.getElementById('outLicId').textContent = license_id;
      document.getElementById('outCode').value = activation_code;
      document.getElementById('outputBox').style.display = 'block';
      showMsg('تم إصدار وتوقيع الترخيص بنجاح: ' + license_id);
    });

    window.copyCode = function() {
      if (!lastIssued) return;
      navigator.clipboard?.writeText(lastIssued.activation_code);
      showMsg('تم نسخ كود التفعيل للحافظة.');
    };
    function downloadText(name, content, type = 'text/plain;charset=utf-8') {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([content], { type }));
      a.download = name;
      a.click();
    }
    window.downloadMnlic = function() {
      if (!lastIssued) return;
      downloadText(lastIssued.license_id + '.mnlic', lastIssued.signed_json, 'application/json');
    };
    window.downloadPublicKey = function() {
      downloadText('client_public_key.pem', EMBEDDED_VAULT.publicKeyPem);
    };
    window.downloadVaultBackup = function() {
      downloadText('owner_license_vault.json', JSON.stringify(EMBEDDED_VAULT, null, 2), 'application/json');
    };
    window.exportRegistryCsv = function() {
      const list = loadRecords();
      const rows = [['رقم الترخيص','العميل','الهاتف','بصمة الجهاز','النوع','الانتهاء','الحالة']];
      for (const r of list) rows.push([r.license_id, r.customer_name, r.customer_phone, r.device_fingerprint, r.license_type, r.expires_at || 'LIFETIME', r.status]);
      const csv = '\\uFEFF' + rows.map(r => r.map(x => '"' + String(x || '').replace(/"/g, '""') + '"').join(',')).join('\\n');
      downloadText('MINA_NET_LICENSES_REGISTRY.csv', csv, 'text/csv;charset=utf-8');
    };

    renderRecords();
  </script>
</body>
</html>`;
}
