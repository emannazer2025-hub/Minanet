import { execSync } from 'child_process';
import crypto from 'crypto';
import * as esbuild from 'esbuild';
import fs from 'fs';
import JavaScriptObfuscator from 'javascript-obfuscator';
import path from 'path';
import {
  computePubKeySha256,
  encodeBakedPublicKey,
  getOrCreateOwnerVault,
  readDistributionPolicy,
} from './licenseCrypto.ts';
import {
  sanitizeMinaIndustryId,
  sanitizeMinaLayoutId,
  sanitizeMinaThemeId,
  type MinaIndustryId,
  type MinaLayoutId,
  type MinaThemeId,
} from '../shared/themes.ts';

function obfuscateNodeCode(code: string): string {
  return JavaScriptObfuscator.obfuscate(code, {
    compact: true,
    controlFlowFlattening: true,
    controlFlowFlatteningThreshold: 0.55,
    deadCodeInjection: true,
    deadCodeInjectionThreshold: 0.2,
    stringArray: true,
    stringArrayEncoding: ['rc4'],
    stringArrayThreshold: 0.85,
    splitStrings: true,
    splitStringsChunkLength: 6,
    selfDefending: true,
    identifierNamesGenerator: 'hexadecimal',
  }).getObfuscatedCode();
}

function stampStyleIntoHtml(
  html: string,
  layoutId: MinaLayoutId,
  themeId: MinaThemeId,
  industryId: MinaIndustryId
): string {
  return html.replace(/<html([^>]*)>/i, (_full, attrs: string) => {
    const cleaned = attrs
      .replace(/\sdata-mina-industry="[^"]*"/gi, '')
      .replace(/\sdata-mina-layout="[^"]*"/gi, '')
      .replace(/\sdata-mina-theme="[^"]*"/gi, '')
      .replace(/\sdata-mina-client-pkg="[^"]*"/gi, '');
    return `<html${cleaned} data-mina-industry="${industryId}" data-mina-layout="${layoutId}" data-mina-theme="${themeId}" data-mina-client-pkg="1">`;
  });
}

function signIntegrityManifest(
  targetRoot: string,
  distOutDir: string,
  runtimeDir: string,
  strictActivation: boolean,
  pubKeySha256: string,
  privateKeyPem: string
): void {
  const filesMap: Record<string, string> = {};
  const hashRelFile = (relFromOutRoot: string) => {
    const abs = path.join(targetRoot, relFromOutRoot);
    filesMap[relFromOutRoot.replace(/\\/g, '/')] = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
  };
  hashRelFile('runtime/core.cjs');
  hashRelFile('dist/index.html');
  const distAssetsDir = path.join(distOutDir, 'assets');
  if (fs.existsSync(distAssetsDir)) {
    for (const f of fs.readdirSync(distAssetsDir)) {
      if (f.endsWith('.js') || f.endsWith('.css')) {
        hashRelFile(`dist/assets/${f}`);
      }
    }
  }

  const sortedFiles: Record<string, string> = {};
  for (const k of Object.keys(filesMap).sort()) sortedFiles[k] = filesMap[k];
  const manifestPayload = {
    version: 1,
    strictActivation: Boolean(strictActivation),
    pubKeySha256,
    files: sortedFiles,
    issuedAt: new Date().toISOString(),
  };
  const canonicalManifest = JSON.stringify(manifestPayload);
  const signature = crypto.sign(null, Buffer.from(canonicalManifest, 'utf-8'), privateKeyPem).toString('base64');
  fs.writeFileSync(
    path.join(runtimeDir, 'app.integrity.json'),
    JSON.stringify({ payload: manifestPayload, signature, algorithm: 'Ed25519' }, null, 2),
    'utf-8'
  );
}

export function compileHardenedDirectHtml(
  force = false,
  rawTheme?: string,
  rawLayout?: string,
  rawIndustry?: string
): string {
  const rootDir = process.cwd();
  const industryId = sanitizeMinaIndustryId(rawIndustry);
  const layoutId = sanitizeMinaLayoutId(rawLayout);
  const themeId = sanitizeMinaThemeId(rawTheme);
  const vault = getOrCreateOwnerVault();
  const policy = readDistributionPolicy();
  const pubKeySha256 = computePubKeySha256(vault.publicKeyPem);
  const directHtmlPath = path.join(rootDir, 'dist-direct', 'index.html');
  const metaPath = path.join(rootDir, 'dist-direct', '.direct-meta.json');

  let baseReady = false;
  if (!force && fs.existsSync(directHtmlPath) && fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
        compatVersion?: number;
        strictActivation?: boolean;
        pubKeySha256?: string;
        industryId?: string;
        layoutId?: string;
        themeId?: string;
      };
      if (
        meta.compatVersion === 2 &&
        meta.strictActivation === policy.strictActivation &&
        meta.pubKeySha256 === pubKeySha256 &&
        meta.industryId === 'general-classic' &&
        meta.layoutId === 'mina-classic' &&
        meta.themeId === 'mina-classic'
      ) {
        baseReady = true;
      }
    } catch {
      baseReady = false;
    }
  }

  if (!baseReady) {
    execSync('npx vite build --config vite.direct.config.ts', {
      cwd: rootDir,
      stdio: 'pipe',
      env: {
        ...process.env,
        NODE_ENV: 'production',
        VITE_STRICT_ACTIVATION: policy.strictActivation ? 'true' : 'false',
      },
    });

    if (fs.existsSync(directHtmlPath)) {
      const rawHtml = fs.readFileSync(directHtmlPath, 'utf-8');
      const noCrossorigin = rawHtml.replace(/<script type="module"\s+crossorigin>/gi, '<script type="module">');
      let stamped = stampStyleIntoHtml(noCrossorigin, 'mina-classic', 'mina-classic', 'general-classic');
      if (!stamped.includes('name="mina-update-url"')) {
        stamped = stamped.replace(
          /<\/head>/i,
          `<meta name="mina-update-url" content="https://ais-pre-li3xayi7s4u2zgsr4pym46-33756488626.europe-west2.run.app" />\n</head>`
        );
      }
      fs.writeFileSync(directHtmlPath, stamped, 'utf-8');
    }

    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          compatVersion: 2,
          strictActivation: policy.strictActivation,
          pubKeySha256,
          industryId: 'general-classic',
          layoutId: 'mina-classic',
          themeId: 'mina-classic',
          builtAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf-8'
    );
  }

  if (industryId === 'general-classic' && layoutId === 'mina-classic' && themeId === 'mina-classic') {
    return directHtmlPath;
  }

  const variantKey = `${industryId}__${layoutId}__${themeId}`;
  const themedDir = path.join(rootDir, 'dist-direct-themes', variantKey);
  const themedHtmlPath = path.join(themedDir, 'index.html');
  const themedMetaPath = path.join(themedDir, '.direct-meta.json');
  const baseHash = crypto.createHash('sha256').update(fs.readFileSync(directHtmlPath)).digest('hex');

  if (!force && fs.existsSync(themedHtmlPath) && fs.existsSync(themedMetaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(themedMetaPath, 'utf-8')) as {
        strictActivation?: boolean;
        pubKeySha256?: string;
        industryId?: string;
        layoutId?: string;
        themeId?: string;
        baseHash?: string;
      };
      if (
        meta.strictActivation === policy.strictActivation &&
        meta.pubKeySha256 === pubKeySha256 &&
        meta.industryId === industryId &&
        meta.layoutId === layoutId &&
        meta.themeId === themeId &&
        meta.baseHash === baseHash
      ) {
        return themedHtmlPath;
      }
    } catch {
      // rebuild variant
    }
  }

  fs.mkdirSync(themedDir, { recursive: true });
  const stampedHtml = stampStyleIntoHtml(fs.readFileSync(directHtmlPath, 'utf-8'), layoutId, themeId, industryId);
  fs.writeFileSync(themedHtmlPath, stampedHtml, 'utf-8');
  fs.writeFileSync(
    themedMetaPath,
    JSON.stringify(
      {
        strictActivation: policy.strictActivation,
        pubKeySha256,
        industryId,
        layoutId,
        themeId,
        baseHash,
        builtAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf-8'
  );
  return themedHtmlPath;
}

export function compileHardenedClientDist(
  force = false,
  rawTheme?: string,
  rawLayout?: string,
  rawIndustry?: string
): string {
  const rootDir = process.cwd();
  const industryId = sanitizeMinaIndustryId(rawIndustry);
  const layoutId = sanitizeMinaLayoutId(rawLayout);
  const themeId = sanitizeMinaThemeId(rawTheme);
  const outRoot = path.join(rootDir, 'dist-client');
  const runtimeDir = path.join(outRoot, 'runtime');
  const distOutDir = path.join(outRoot, 'dist');
  const metaPath = path.join(runtimeDir, '.build-meta.json');

  const vault = getOrCreateOwnerVault();
  const policy = readDistributionPolicy();
  const pubKeySha256 = computePubKeySha256(vault.publicKeyPem);

  let baseReady = false;
  if (
    !force &&
    fs.existsSync(metaPath) &&
    fs.existsSync(path.join(runtimeDir, 'launcher.cjs')) &&
    fs.existsSync(path.join(runtimeDir, 'core.cjs')) &&
    fs.existsSync(path.join(runtimeDir, 'app.integrity.json')) &&
    fs.existsSync(path.join(distOutDir, 'index.html'))
  ) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as {
        compatVersion?: number;
        strictActivation?: boolean;
        pubKeySha256?: string;
        industryId?: string;
        layoutId?: string;
        themeId?: string;
      };
      if (
        meta.compatVersion === 2 &&
        meta.strictActivation === policy.strictActivation &&
        meta.pubKeySha256 === pubKeySha256 &&
        meta.industryId === 'general-classic' &&
        meta.layoutId === 'mina-classic' &&
        meta.themeId === 'mina-classic'
      ) {
        baseReady = true;
      }
    } catch {
      baseReady = false;
    }
  }

  if (!baseReady) {
    const mainDist = path.join(rootDir, 'dist');
    if (!fs.existsSync(path.join(mainDist, 'index.html')) || force) {
      execSync('npx vite build', {
        cwd: rootDir,
        stdio: 'pipe',
        env: {
          ...process.env,
          NODE_ENV: 'production',
          VITE_STRICT_ACTIVATION: policy.strictActivation ? 'true' : 'false',
        },
      });
    }

    if (fs.existsSync(outRoot)) fs.rmSync(outRoot, { recursive: true, force: true });
    fs.mkdirSync(runtimeDir, { recursive: true });
    fs.mkdirSync(distOutDir, { recursive: true });

    const copyDistClean = (srcDir: string, dstDir: string) => {
      for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
        if (entry.name === 'license-manager.html' || entry.name.startsWith('licenseManager') || entry.name === 'aistudio') continue;
        const srcPath = path.join(srcDir, entry.name);
        const dstPath = path.join(dstDir, entry.name);
        if (entry.isDirectory()) {
          fs.mkdirSync(dstPath, { recursive: true });
          copyDistClean(srcPath, dstPath);
        } else if (entry.isFile()) {
          fs.copyFileSync(srcPath, dstPath);
        }
      }
    };
    copyDistClean(mainDist, distOutDir);

    const baseHtmlPath = path.join(distOutDir, 'index.html');
    fs.writeFileSync(
      baseHtmlPath,
      stampStyleIntoHtml(fs.readFileSync(baseHtmlPath, 'utf-8'), 'mina-classic', 'mina-classic', 'general-classic'),
      'utf-8'
    );

    const encodedKey = encodeBakedPublicKey(vault.publicKeyPem);
    const bakedCfgJson = JSON.stringify({
      baked: true,
      ...encodedKey,
      strictActivation: policy.strictActivation,
      integrityRequired: true,
    });

    const coreBuilt = esbuild.buildSync({
      entryPoints: [path.join(rootDir, 'server', 'clientRuntimeEntry.ts')],
      bundle: true,
      write: false,
      platform: 'node',
      target: 'node12',
      format: 'cjs',
      minify: true,
      external: ['better-sqlite3', 'express', 'bcryptjs', 'xlsx', 'adm-zip', 'dotenv'],
      define: {
        __MINA_BAKED_CFG__: JSON.stringify(bakedCfgJson),
      },
    });
    const obfuscatedCore = obfuscateNodeCode(coreBuilt.outputFiles[0].text);
    const corePath = path.join(runtimeDir, 'core.cjs');
    fs.writeFileSync(corePath, obfuscatedCore, 'utf-8');

    signIntegrityManifest(
      outRoot,
      distOutDir,
      runtimeDir,
      policy.strictActivation,
      encodedKey.pubKeySha256,
      vault.privateKeyPem
    );

    const launcherBuilt = esbuild.buildSync({
      entryPoints: [path.join(rootDir, 'server', 'clientLauncherEntry.ts')],
      bundle: true,
      write: false,
      platform: 'node',
      target: 'node12',
      format: 'cjs',
      minify: true,
      external: ['./core.cjs'],
      define: {
        __MINA_BAKED_CFG__: JSON.stringify(bakedCfgJson),
      },
    });
    const obfuscatedLauncher = obfuscateNodeCode(launcherBuilt.outputFiles[0].text);
    fs.writeFileSync(path.join(runtimeDir, 'launcher.cjs'), obfuscatedLauncher, 'utf-8');

    fs.writeFileSync(
      metaPath,
      JSON.stringify(
        {
          compatVersion: 2,
          strictActivation: policy.strictActivation,
          pubKeySha256,
          industryId: 'general-classic',
          layoutId: 'mina-classic',
          themeId: 'mina-classic',
          builtAt: new Date().toISOString(),
        },
        null,
        2
      ),
      'utf-8'
    );
  }

  if (industryId === 'general-classic' && layoutId === 'mina-classic' && themeId === 'mina-classic') {
    return outRoot;
  }

  const variantKey = `${industryId}__${layoutId}__${themeId}`;
  const themedRoot = path.join(rootDir, 'dist-client-themes', variantKey);
  const themedRuntimeDir = path.join(themedRoot, 'runtime');
  const themedDistDir = path.join(themedRoot, 'dist');
  const themedMetaPath = path.join(themedRuntimeDir, '.build-meta.json');
  const baseCoreHash = crypto.createHash('sha256').update(fs.readFileSync(path.join(runtimeDir, 'core.cjs'))).digest('hex');

  if (
    !force &&
    fs.existsSync(themedMetaPath) &&
    fs.existsSync(path.join(themedRuntimeDir, 'app.integrity.json')) &&
    fs.existsSync(path.join(themedDistDir, 'index.html'))
  ) {
    try {
      const meta = JSON.parse(fs.readFileSync(themedMetaPath, 'utf-8')) as {
        strictActivation?: boolean;
        pubKeySha256?: string;
        industryId?: string;
        layoutId?: string;
        themeId?: string;
        baseCoreHash?: string;
      };
      if (
        meta.strictActivation === policy.strictActivation &&
        meta.pubKeySha256 === pubKeySha256 &&
        meta.industryId === industryId &&
        meta.layoutId === layoutId &&
        meta.themeId === themeId &&
        meta.baseCoreHash === baseCoreHash
      ) {
        return themedRoot;
      }
    } catch {
      // rebuild variant
    }
  }

  if (fs.existsSync(themedRoot)) fs.rmSync(themedRoot, { recursive: true, force: true });
  fs.cpSync(outRoot, themedRoot, { recursive: true, force: true });

  const themedHtmlPath = path.join(themedDistDir, 'index.html');
  fs.writeFileSync(
    themedHtmlPath,
    stampStyleIntoHtml(fs.readFileSync(themedHtmlPath, 'utf-8'), layoutId, themeId, industryId),
    'utf-8'
  );

  signIntegrityManifest(
    themedRoot,
    themedDistDir,
    themedRuntimeDir,
    policy.strictActivation,
    pubKeySha256,
    vault.privateKeyPem
  );

  fs.writeFileSync(
    themedMetaPath,
    JSON.stringify(
      {
        strictActivation: policy.strictActivation,
        pubKeySha256,
        industryId,
        layoutId,
        themeId,
        baseCoreHash,
        builtAt: new Date().toISOString(),
      },
      null,
      2
    ),
    'utf-8'
  );

  return themedRoot;
}
