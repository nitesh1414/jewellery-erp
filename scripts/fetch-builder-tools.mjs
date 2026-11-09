#!/usr/bin/env node
/**
 * fetch-builder-tools.mjs — pre-download the electron-builder helper binaries
 * (NSIS toolchain) into the local electron-builder cache.
 *
 * WHY THIS EXISTS
 * ---------------
 * `electron-builder --win nsis` downloads two small archives the first time it
 * builds an NSIS installer:
 *
 *   nsis-3.0.4.1.7z            (~1.3 MB)  the script compiler (makensis)
 *   nsis-resources-3.4.1.7z    (~0.7 MB)  plugins (StdUtils, UAC, …)
 *
 * Those files live on GitHub *release assets* — the download is redirected to
 * `release-assets.githubusercontent.com`, a host that is very often blocked,
 * rate-limited or killed mid-transfer on Indian ISPs / office proxies /
 * antivirus web filters. When that happens the build dies **after**
 * `signing with signtool.exe … resources\elevate.exe` with a Go stack trace
 * such as:
 *
 *   ⨯ Get "https://release-assets.githubusercontent.com/…nsis-resources-3.4.1.7z…": EOF
 *
 * Nothing is wrong with the project at that point — the toolchain simply could
 * not be fetched. This script fetches it *before* the (slow) build, retries,
 * and can use a mirror, so the failure — if any — happens in 5 seconds with a
 * clear message instead of after 4 minutes of compiling.
 *
 * USAGE
 *   node scripts/fetch-builder-tools.mjs             # download if missing
 *   node scripts/fetch-builder-tools.mjs --check     # only report status
 *   node scripts/fetch-builder-tools.mjs --force     # re-download everything
 *   node scripts/fetch-builder-tools.mjs --mirror https://npmmirror.com/mirrors/electron-builder-binaries/
 *
 * MIRRORS (also honoured from the environment / .npmrc):
 *   ELECTRON_BUILDER_BINARIES_MIRROR
 *   ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL
 *
 * Building on a machine without internet? Run this once on a connected
 * machine, then copy the cache folder over:
 *   Windows  %LOCALAPPDATA%\electron-builder\Cache
 *   macOS    ~/Library/Caches/electron-builder
 *   Linux    ~/.cache/electron-builder
 * …or point ELECTRON_BUILDER_CACHE at a shared folder.
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const getOpt = (name) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};

const CHECK_ONLY = hasFlag('--check') || hasFlag('--verify');
const FORCE = hasFlag('--force');
const EXPLICIT_MIRROR = getOpt('--mirror');

/** Archives the Windows installer needs (versions pinned by electron-builder 25.x). */
const ARTIFACTS = [
  {
    name: 'nsis-3.0.4.1',
    // sha512 exactly as pinned in app-builder-lib/src/targets/nsis/nsisUtil.ts
    sha512: 'VKMiizYdmNdJOWpRGz4trl4lD++BvYP2irAXpMilheUP0pc93iKlWAoP843Vlraj8YG19CVn0j+dCo/hURz9+Q==',
    probe: (dir) => findFile(dir, /^makensis(\.exe)?$/i),
  },
  {
    name: 'nsis-resources-3.4.1',
    // sha512 exactly as pinned in app-builder-lib/src/targets/nsis/NsisTarget.ts
    sha512: 'Dqd6g+2buwwvoG1Vyf6BHR1b+25QMmPcwZx40atOT57gH27rkjOei1L0JTldxZu4NFoEmW4kJgZ3DlSWVON3+Q==',
    probe: (dir) => findFile(dir, /^StdUtils\.nsh$/i),
  },
];

const DEFAULT_GITHUB = 'https://github.com/electron-userland/electron-builder-binaries/releases/download/';
const PUBLIC_MIRRORS = [
  'https://npmmirror.com/mirrors/electron-builder-binaries/',
  'https://registry.npmmirror.com/-/binary/electron-builder-binaries/',
];

function log(msg = '') {
  process.stdout.write(msg + '\n');
}

function findFile(dir, re, depth = 4) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isFile() && re.test(e.name)) return p;
    if (e.isDirectory() && depth > 0) {
      const found = findFile(p, re, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

/** Same default electron-builder uses; ELECTRON_BUILDER_CACHE wins. */
function cacheRoot() {
  if (process.env.ELECTRON_BUILDER_CACHE) return process.env.ELECTRON_BUILDER_CACHE;
  const home = os.homedir();
  if (process.platform === 'win32') {
    return path.join(process.env.LOCALAPPDATA || path.join(home, 'AppData', 'Local'), 'electron-builder', 'Cache');
  }
  if (process.platform === 'darwin') return path.join(home, 'Library', 'Caches', 'electron-builder');
  return path.join(process.env.XDG_CACHE_HOME || path.join(home, '.cache'), 'electron-builder');
}

function appBuilderBinary() {
  const base = path.join(repoRoot, 'node_modules', 'app-builder-bin');
  const exe = process.platform === 'win32' ? 'app-builder.exe' : 'app-builder';
  const arch = process.arch;
  const candidates = [];
  if (process.platform === 'win32') candidates.push(path.join(base, 'win', arch, exe));
  else if (process.platform === 'darwin') candidates.push(path.join(base, 'mac', `${exe}_${arch === 'arm64' ? 'arm64' : 'amd64'}`));
  else candidates.push(path.join(base, 'linux', arch, exe), path.join(base, 'linux', 'x64', exe));
  // electron-builder may hoist app-builder-bin into its own node_modules
  candidates.push(path.join(repoRoot, 'node_modules', 'electron-builder', 'node_modules', 'app-builder-bin'));
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

/** Is the artifact already unpacked in the cache? */
function findCached(artifact) {
  const root = cacheRoot();
  const direct = path.join(root, artifact.name.split('-').slice(0, -1).join('-'), artifact.name);
  const attempts = [direct, path.join(root, artifact.name)];
  for (const dir of attempts) {
    if (artifact.probe(dir)) return dir;
  }
  // unknown layout (custom cache) — deep scan by folder name
  const byName = findDirNamed(root, artifact.name);
  if (byName && artifact.probe(byName)) return byName;
  return null;
}

function findDirNamed(root, name, depth = 3) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return null;
  }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const p = path.join(root, e.name);
    if (e.name === name) return p;
    if (depth > 0) {
      const found = findDirNamed(p, name, depth - 1);
      if (found) return found;
    }
  }
  return null;
}

function downloadUrls(artifact) {
  const override = process.env.ELECTRON_BUILDER_BINARIES_DOWNLOAD_OVERRIDE_URL;
  const envMirror = process.env.ELECTRON_BUILDER_BINARIES_MIRROR;
  const mirrors = [EXPLICIT_MIRROR, override, envMirror, DEFAULT_GITHUB, ...PUBLIC_MIRRORS]
    .filter(Boolean)
    .map((m) => (m.endsWith('/') ? m : m + '/'));
  const urls = [];
  for (const base of mirrors) {
    const url = override && base === override.replace(/\/?$/, '/')
      ? `${base}${artifact.name}.7z`
      : `${base}${artifact.name}/${artifact.name}.7z`;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

function tryDownload(appBuilder, artifact, url) {
  const res = spawnSync(
    appBuilder,
    ['download-artifact', '--name', artifact.name, '--url', url, '--sha512', artifact.sha512],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  if (res.error) return { ok: false, message: res.error.message };
  if (res.status === 0) return { ok: true };
  const out = `${res.stdout || ''}${res.stderr || ''}`.trim();
  return { ok: false, message: out.split('\n').slice(0, 2).join(' ').slice(0, 400) };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function main() {
  log(`electron-builder cache: ${cacheRoot()}`);

  const appBuilder = appBuilderBinary();
  if (!appBuilder) {
    log('');
    log('✖ app-builder binary not found — dependencies are not installed.');
    log('  Run `npm install` at the repository root, then retry.');
    process.exit(1);
  }

  let missing = 0;
  for (const artifact of ARTIFACTS) {
    const cached = FORCE ? null : findCached(artifact);
    if (cached) {
      log(`✔ ${artifact.name} (cached)`);
      continue;
    }
    missing++;
    if (CHECK_ONLY) {
      log(`✖ ${artifact.name} (missing)`);
      continue;
    }

    const urls = downloadUrls(artifact);
    let done = false;
    for (let attempt = 1; attempt <= urls.length * 2 && !done; attempt++) {
      const url = urls[Math.min(attempt - 1, urls.length - 1)];
      log(`↓ ${artifact.name}  ${attempt > 1 ? `(attempt ${attempt}) ` : ''}${url}`);
      const result = tryDownload(appBuilder, artifact, url);
      if (result.ok && findCached(artifact)) {
        log(`✔ ${artifact.name}`);
        done = true;
        break;
      }
      if (result.ok) {
        log(`  ✖ archive unpacked but not found in cache — retrying`);
      } else {
        log(`  ✖ ${result.message || 'download failed'}`);
      }
      if (attempt < urls.length * 2) sleep(Math.min(1500 * attempt, 6000));
    }

    if (!done) {
      log('');
      log(`✖ Could not download ${artifact.name}.`);
      log('  The NSIS toolchain is hosted on GitHub release assets, which is often');
      log('  blocked by ISPs / proxies / antivirus. Options:');
      log('    1. Use a mirror:');
      log('         npm run tools:fetch -- --mirror https://npmmirror.com/mirrors/electron-builder-binaries/');
      log('    2. Set it permanently in the environment or .npmrc:');
      log('         ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/');
      log('    3. Download the .7z on a machine that has access, then copy the');
      log(`       unpacked folder into the cache (${path.join(cacheRoot(), artifact.name.split('-').slice(0, -1).join('-'), artifact.name)}).`);
      log('    4. Temporarily disable the antivirus/proxy web filter for node.exe.');
      process.exit(1);
    }
  }

  if (CHECK_ONLY && missing > 0) {
    log('');
    log(`✖ ${missing} required tool archive(s) missing — run: npm run tools:fetch`);
    process.exit(1);
  }
  log('');
  log('✔ NSIS toolchain ready — electron-builder will not need the network.');
}

main();
