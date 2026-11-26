import crypto from 'crypto';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import JavaScriptObfuscator from 'javascript-obfuscator';
import path from 'path';
import { defineConfig, type Plugin } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { WIN7_COMPAT_HEAD_SCRIPT, win7CompatCssPlugin } from './vite.win7Compat.ts';

function win7DirectHtmlPlugin(): Plugin {
  return {
    name: 'mina-win7-direct-html',
    apply: 'build',
    transformIndexHtml(html) {
      let out = html
        .replace(/<link[^>]*fonts\.googleapis\.com[^>]*>/gi, '')
        .replace(/<link[^>]*fonts\.gstatic\.com[^>]*>/gi, '');

      // Prepend Mark of the Web so Internet Explorer / legacy Windows WebBrowser controls allow local JS diagnostics instead of a blank blocked page
      if (!/saved from url=/i.test(out)) {
        out = '<!-- saved from url=(0014)about:internet -->\n' + out;
      }

      out = out.replace(
        /<div id="root"><\/div>/i,
        '<div id="root"><div dir="rtl" style="font-family:Tahoma,Segoe UI,Arial,sans-serif;text-align:center;padding:48px 20px;color:#1e293b;font-weight:bold;font-size:14px;">جاري تشغيل برنامج Mina Net ERP...</div></div>'
      );

      const headClose = out.indexOf('</head>');
      if (headClose !== -1) {
        out = out.slice(0, headClose) + WIN7_COMPAT_HEAD_SCRIPT + out.slice(headClose);
      }

      const scriptMatch = /<script\b([^>]*?)type=["']module["']([^>]*?)><\/script>/i.exec(out);
      if (scriptMatch) {
        const cleanedTag = `<script${scriptMatch[1].replace(/\s*crossorigin\b/gi, '')}${scriptMatch[2].replace(/\s*crossorigin\b/gi, '')}></script>`;
        out = out.replace(scriptMatch[0], '');
        const bodyClose = out.lastIndexOf('</body>');
        if (bodyClose !== -1) {
          out = out.slice(0, bodyClose) + cleanedTag + out.slice(bodyClose);
        } else {
          out += cleanedTag;
        }
      }
      return out;
    },
  };
}

const OBFUSCATED_DIRECT_TARGETS = [
  'browserLicenseCrypto.ts',
  'browserLicenseGuard.ts',
  'browserDb.ts',
  'erpRoutes.ts',
  'importAndReportRoutes.ts',
  'ActivationGateModal.tsx',
  'App.tsx',
  'SettingsBackupView.tsx',
];

const pubKeyPath = path.resolve(import.meta.dirname, 'data', 'client_public_key.pem');
const publicKeyPem = fs.existsSync(pubKeyPath) ? fs.readFileSync(pubKeyPath, 'utf-8').trim().replace(/\r\n/g, '\n') : '';
const pubKeyDigest = publicKeyPem ? crypto.createHash('sha512').update(publicKeyPem, 'utf-8').digest('hex') : '';

const policyPath = path.resolve(import.meta.dirname, 'owner_vault', 'distribution_policy.json');
let strictActivation = 'false';
if (process.env.VITE_STRICT_ACTIVATION !== undefined) {
  strictActivation = process.env.VITE_STRICT_ACTIVATION === 'true' ? 'true' : 'false';
} else if (fs.existsSync(policyPath)) {
  try {
    const p = JSON.parse(fs.readFileSync(policyPath, 'utf-8')) as { strictActivation?: boolean };
    strictActivation = p.strictActivation === true ? 'true' : 'false';
  } catch {
    strictActivation = 'false';
  }
}

export default defineConfig({
  plugins: [
    {
      name: 'mina-desktop-node-shims',
      enforce: 'pre',
      resolveId(source) {
        if (source === './db.ts' || source === '../server/db.ts' || source.endsWith('/server/db.ts')) {
          return path.resolve(import.meta.dirname, 'src/desktop/browserDb.ts');
        }
        if (
          source === './licenseCrypto.ts' ||
          source === '../server/licenseCrypto.ts' ||
          source.endsWith('/server/licenseCrypto.ts')
        ) {
          return path.resolve(import.meta.dirname, 'src/desktop/browserLicenseCrypto.ts');
        }
        if (
          source === './licenseGuard.ts' ||
          source === '../server/licenseGuard.ts' ||
          source.endsWith('/server/licenseGuard.ts')
        ) {
          return path.resolve(import.meta.dirname, 'src/desktop/browserLicenseGuard.ts');
        }
        return null;
      },
    },
    react(),
    tailwindcss(),
    {
      name: 'mina-obfuscate-direct-modules',
      apply: 'build',
      enforce: 'post',
      transform(code, id) {
        const cleanId = id.split('?')[0];
        if (!OBFUSCATED_DIRECT_TARGETS.some((t) => cleanId.endsWith('/' + t) || cleanId.endsWith('\\' + t))) {
          return null;
        }
        const obf = JavaScriptObfuscator.obfuscate(code, {
          compact: true,
          controlFlowFlattening: true,
          controlFlowFlatteningThreshold: 0.5,
          deadCodeInjection: true,
          deadCodeInjectionThreshold: 0.2,
          stringArray: true,
          stringArrayEncoding: ['rc4'],
          stringArrayThreshold: 0.8,
          splitStrings: true,
          splitStringsChunkLength: 6,
          selfDefending: false,
          identifierNamesGenerator: 'hexadecimal',
          ignoreImports: true,
        });
        return { code: obf.getObfuscatedCode(), map: null };
      },
    },
    win7CompatCssPlugin(),
    viteSingleFile({ removeViteModuleLoader: true }),
    win7DirectHtmlPlugin(),
  ],
  define: {
    'import.meta.env.VITE_DIRECT_STANDALONE': JSON.stringify('true'),
    'import.meta.env.VITE_CLIENT_PUBLIC_KEY_PEM': JSON.stringify(publicKeyPem),
    'import.meta.env.VITE_PUBKEY_DIGEST': JSON.stringify(pubKeyDigest),
    'import.meta.env.VITE_STRICT_ACTIVATION': JSON.stringify(strictActivation),
    'import.meta.url': JSON.stringify('http://127.0.0.1/'),
    'import.meta.resolve': 'undefined',
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, '.'),
      express: path.resolve(import.meta.dirname, 'src/desktop/expressShim.ts'),
      fs: path.resolve(import.meta.dirname, 'src/desktop/fsAndPathShim.ts'),
      path: path.resolve(import.meta.dirname, 'src/desktop/pathShim.ts'),
      'better-sqlite3': path.resolve(import.meta.dirname, 'src/desktop/sqljsAdapter.ts'),
    },
  },
  build: {
    target: ['chrome70', 'edge79', 'firefox68'],
    cssTarget: ['chrome80', 'edge80', 'firefox78'],
    outDir: 'dist-direct',
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      output: {
        format: 'iife',
        name: 'MinaNetDirectApp',
      },
    },
  },
});
