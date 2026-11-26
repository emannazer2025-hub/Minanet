import type { Plugin } from 'vite';

/**
 * Unwraps CSS `@layer ... { ... }` blocks and strips `@layer name;` declarations
 * while keeping exact cascade order and preserving all other `@` at-rules (`@media`, `@supports`, `@keyframes`, `@property`).
 * Ensures Tailwind CSS v4 styles render properly in Windows 7 browsers (Chrome < 99, Edge < 99, Firefox < 97).
 */
export function unwrapCssLayers(css: string): string {
  const len = css.length;
  let out = '';
  let i = 0;

  const skipQuoted = (quote: string): string => {
    let s = quote;
    i++;
    while (i < len) {
      const ch = css[i];
      s += ch;
      if (ch === '\\' && i + 1 < len) {
        i++;
        s += css[i];
        i++;
        continue;
      }
      i++;
      if (ch === quote) break;
    }
    return s;
  };

  const skipComment = (): string => {
    let s = '/*';
    i += 2;
    while (i < len) {
      if (css[i] === '*' && css[i + 1] === '/') {
        s += '*/';
        i += 2;
        break;
      }
      s += css[i++];
    }
    return s;
  };

  const extractBalancedBlock = (): string => {
    // Assumes css[i] === '{'
    i++; // consume opening '{'
    let depth = 1;
    let inner = '';
    while (i < len && depth > 0) {
      const ch = css[i];
      if (ch === '"' || ch === "'") {
        inner += skipQuoted(ch);
      } else if (ch === '/' && css[i + 1] === '*') {
        inner += skipComment();
      } else if (ch === '{') {
        depth++;
        inner += ch;
        i++;
      } else if (ch === '}') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
        inner += ch;
        i++;
      } else {
        inner += ch;
        i++;
      }
    }
    return inner;
  };

  while (i < len) {
    const ch = css[i];
    if (ch === '"' || ch === "'") {
      out += skipQuoted(ch);
      continue;
    }
    if (ch === '/' && css[i + 1] === '*') {
      out += skipComment();
      continue;
    }
    if (
      ch === '@' &&
      css.slice(i, i + 6) === '@layer' &&
      (i + 6 >= len || /[\s{;]/.test(css[i + 6]))
    ) {
      let j = i + 6;
      while (j < len && css[j] !== '{' && css[j] !== ';') {
        j++;
      }
      if (j < len && css[j] === ';') {
        i = j + 1;
        continue;
      }
      if (j < len && css[j] === '{') {
        i = j;
        const inner = extractBalancedBlock();
        out += unwrapCssLayers(inner);
        continue;
      }
    }
    out += ch;
    i++;
  }

  return out;
}

export function applyWin7CssCompat(css: string): string {
  let out = unwrapCssLayers(css);
  // Tailwind v4 emits `--tw-gradient-position: to bottom in oklab;` which breaks gradients in Win7 Chrome <= 109 & Firefox <= 112
  out = out.replace(
    /\s+in\s+(?:oklab|oklch|lab|lch|srgb(?:-linear)?|hsl|hwb)(?:\s+(?:shorter|longer|increasing|decreasing)\s+hue)?(?=[;},)])/gi,
    ''
  );
  // Unwrap :where(...) selectors for Win7 Chrome < 88 / Firefox < 78 compatibility
  for (let pass = 0; pass < 3; pass++) {
    const next = out.replace(/:where\(((?:[^()]+|\([^()]*\))*)\)/g, '$1');
    if (next === out) break;
    out = next;
  }
  // Ensure -webkit-backdrop-filter prefix exists for Chromium 76-109
  out = out.replace(/(?<!-webkit-)backdrop-filter\s*:([^;}\r\n]+)/gi, '-webkit-backdrop-filter:$1;backdrop-filter:$1');
  return out;
}

export const WIN7_COMPAT_HEAD_SCRIPT = `<script>(function(){
  try {
    if (typeof globalThis === 'undefined') {
      if (typeof window !== 'undefined') window.globalThis = window;
    }
    if (typeof queueMicrotask === 'undefined') {
      window.queueMicrotask = function(cb) {
        if (typeof Promise !== 'undefined') {
          Promise.resolve().then(cb);
        } else {
          setTimeout(cb, 0);
        }
      };
    }
    if (typeof ResizeObserver === 'undefined') {
      window.ResizeObserver = function() {
        this.observe = function() {};
        this.unobserve = function() {};
        this.disconnect = function() {};
      };
    }
    if (!String.prototype.replaceAll) {
      String.prototype.replaceAll = function(search, replacement) {
        var str = String(this);
        if (search instanceof RegExp) {
          if (!search.global) throw new TypeError('replaceAll must be called with a global RegExp');
          return str.replace(search, replacement);
        }
        return str.split(String(search)).join(typeof replacement === 'function' ? replacement(String(search)) : String(replacement));
      };
    }
    if (!Array.prototype.at) {
      Array.prototype.at = function(n) {
        var i = Math.trunc(n) || 0;
        if (i < 0) i += this.length;
        if (i < 0 || i >= this.length) return undefined;
        return this[i];
      };
    }
    if (!Array.prototype.findLast) {
      Array.prototype.findLast = function(pred, thisArg) {
        for (var i = this.length - 1; i >= 0; i--) {
          if (pred.call(thisArg, this[i], i, this)) return this[i];
        }
        return undefined;
      };
    }
    if (!Array.prototype.findLastIndex) {
      Array.prototype.findLastIndex = function(pred, thisArg) {
        for (var i = this.length - 1; i >= 0; i--) {
          if (pred.call(thisArg, this[i], i, this)) return i;
        }
        return -1;
      };
    }
    if (!String.prototype.at) {
      String.prototype.at = function(n) {
        var i = Math.trunc(n) || 0;
        if (i < 0) i += this.length;
        if (i < 0 || i >= this.length) return undefined;
        return String(this).charAt(i);
      };
    }
    if (!Object.hasOwn) {
      Object.hasOwn = function(obj, prop) {
        return Object.prototype.hasOwnProperty.call(obj, prop);
      };
    }
    if (!Object.fromEntries) {
      Object.fromEntries = function(entries) {
        var res = {};
        if (entries) {
          var arr = Array.from(entries);
          for (var i = 0; i < arr.length; i++) res[arr[i][0]] = arr[i][1];
        }
        return res;
      };
    }
    if (!Array.prototype.flat) {
      Array.prototype.flat = function(depth) {
        var d = depth === undefined ? 1 : Number(depth);
        return (function flatten(arr, cur) {
          var out = [];
          for (var i = 0; i < arr.length; i++) {
            if (Array.isArray(arr[i]) && cur > 0) out.push.apply(out, flatten(arr[i], cur - 1));
            else out.push(arr[i]);
          }
          return out;
        })(this, d);
      };
    }
    if (!Array.prototype.flatMap) {
      Array.prototype.flatMap = function(fn, thisArg) {
        return this.map(fn, thisArg).flat(1);
      };
    }
    if (typeof Promise !== 'undefined' && !Promise.allSettled) {
      Promise.allSettled = function(promises) {
        return Promise.all(Array.from(promises).map(function(p) {
          return Promise.resolve(p).then(
            function(v) { return { status: 'fulfilled', value: v }; },
            function(e) { return { status: 'rejected', reason: e }; }
          );
        }));
      };
    }
    if (typeof structuredClone === 'undefined') {
      window.structuredClone = function(val) {
        return val === undefined ? undefined : JSON.parse(JSON.stringify(val));
      };
    }
    if (typeof crypto !== 'undefined' && !crypto.randomUUID) {
      crypto.randomUUID = function() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          var r = (Math.random() * 16) | 0;
          var v = c === 'x' ? r : (r & 0x3) | 0x8;
          return v.toString(16);
        });
      };
    }

    function showCompatError(title, detail) {
      var render = function() {
        var root = document.getElementById('root') || document.body;
        if (!root || root.getAttribute('data-mina-mounted') === '1') return;
        root.setAttribute('data-mina-error', '1');
        root.innerHTML =
          '<div dir="rtl" style="font-family:Tahoma,Segoe UI,Arial,sans-serif;background:#1b2b4b;color:#111827;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;">' +
            '<div style="background:#ece9d8;border:2px solid #991b1b;max-width:580px;width:100%;padding:24px;box-shadow:0 12px 30px rgba(0,0,0,0.35);">' +
              '<h2 style="margin:0 0 12px 0;color:#991b1b;font-size:18px;">' + title + '</h2>' +
              '<p style="margin:0 0 12px 0;font-size:14px;line-height:1.7;font-weight:bold;">' + detail + '</p>' +
              '<div style="background:#fff;border:1px solid #cbd5e1;padding:12px;margin:0 0 14px 0;font-size:12px;color:#1e293b;line-height:1.8;">' +
                '<strong>حل التشغيل الفوري على ويندوز 7 (Windows 7):</strong><br>' +
                '1. ثبّت متصفح <strong>Google Chrome</strong> (أو متصفح <strong>Supermium</strong> أو <strong>Firefox 115 ESR</strong> لويندوز 7).<br>' +
                '2. بعد التثبيت، اضغط مرتين على أيقونة <strong>Mina Net ERP</strong> على سطح المكتب ليفتح البرنامج كنافذة مستقلة تماماً بدون متصفح.<br>' +
                '<span style="color:#475569;">للدعم الفني: اسامه جرجس - 01153672084</span>' +
              '</div>' +
              '<button type="button" onclick="window.location.reload()" style="padding:8px 18px;font-family:Tahoma,sans-serif;font-weight:bold;cursor:pointer;background:#214283;color:#fff;border:1px solid #12264d;">إعادة المحاولة</button>' +
            '</div>' +
          '</div>';
      };
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', render);
      else render();
    }

    if (
      document.documentMode ||
      typeof BigInt === 'undefined' ||
      typeof BigInt64Array === 'undefined' ||
      typeof WebAssembly === 'undefined' ||
      typeof TextDecoder === 'undefined'
    ) {
      window.__MINA_UNSUPPORTED_BROWSER__ = true;
      showCompatError(
        'المتصفح الحالي على ويندوز 7 قديم ولا يدعم تشغيل Mina Net',
        'تم فتح الملف عبر متصفح قديم (مثل Internet Explorer أو إصدار متصفح أقدم من المطلوب) على ويندوز 7.'
      );
      return;
    }

    window.addEventListener('error', function(ev) {
      var root = document.getElementById('root');
      if (root && root.getAttribute('data-mina-mounted') !== '1') {
        showCompatError(
          'تعذر تحميل واجهة Mina Net في هذا المتصفح',
          (ev && ev.message ? String(ev.message) : 'خطأ غير متوقع أثناء بدء التشغيل')
        );
      }
    });

    window.addEventListener('unhandledrejection', function(ev) {
      var root = document.getElementById('root');
      if (root && root.getAttribute('data-mina-mounted') !== '1') {
        var msg = ev && ev.reason ? (ev.reason.message || String(ev.reason)) : 'خطأ غير متوقع أثناء تحميل قاعدة البيانات';
        showCompatError('تعذر بدء تشغيل نظام Mina Net', msg);
      }
    });

    setTimeout(function() {
      var root = document.getElementById('root');
      if (root && root.getAttribute('data-mina-mounted') !== '1' && root.getAttribute('data-mina-error') !== '1') {
        showCompatError(
          'المتصفح لم يكمل تحميل واجهة Mina Net',
          'قد يكون المتصفح الحالي على ويندوز 7 قديماً جداً لتشغيل حزمة النظام أو محجوباً عن تشغيل السكربتات المحلية.'
        );
      }
    }, 8000);
  } catch (e) {}
})();</script>`;

export function win7CompatCssPlugin(): Plugin {
  return {
    name: 'mina-win7-css-unwrap',
    apply: 'build',
    enforce: 'post',
    generateBundle(_options, bundle) {
      for (const fileName of Object.keys(bundle)) {
        if (!fileName.endsWith('.css')) continue;
        const asset = bundle[fileName];
        if (asset && asset.type === 'asset' && typeof asset.source === 'string') {
          asset.source = applyWin7CssCompat(asset.source);
        }
      }
    },
  };
}
