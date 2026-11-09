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
 * `release-assets.githubusercontent.com`, a host that is often blocked,
 * rate-limited or killed mid-transfer on Indian ISPs / office proxies /
 * antivirus web filters. When that happens the build dies **after**
 * `signing with signtool.exe … resources\elevate.exe` with a Go stack trace
 * such as:
 *
 *   ⨯ Get "https://release-assets.githubusercontent.com/…nsis-resources-3.4.1.7z…": EOF
 *
 * This script fetches the toolchain *before* the (slow) build, retries, and can
 * use a mirror, so a failure happens in seconds with a clear message instead of
 * after minutes of compiling.
 *
 * CACHE LAYOUT (app-builder)
 * --------------------------
 * app-builder groups artifacts by the text before the **first** hyphen, so
 * BOTH of these live in the same `nsis` folder:
 *
 *   <Cache>\nsis\nsis-3.0.4.1\            (Bin\makensis.exe …)
 *   <Cache>\nsis\nsis-resources-3.4.1\    (plugins\x86-unicode\*.dll …)
 *
 * `<Cache>` is `%LOCALAPPDATA%\electron-builder\Cache` on Windows,
 * `~/Library/Caches/electron-builder` on macOS and
 * `${XDG_CACHE_HOME:-~/.cache}/electron-builder` on Linux, or whatever
 * `ELECTRON_BUILDER_CACHE` points at.
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
 * machine, then copy the cache folder over (see table in docs/ELECTRON.md).
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
  },
  {
    name: 'nsis-resources-3.4.1',
    // sha512 exactly as pinned in app-builder-lib/src/targets/nsis/NsisTarget.ts
    sha512: 'Dqd6g+2buwwvoG1Vyf6BHR1b+25QMmPcwZx40atOT57gH27rkjOei1L0JTldxZu4NFoEmW4kJgZ3DlSWVON3+Q==',
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

/**
 * Mirrors app-builder's GetCacheDirectoryForArtifact(): the group folder is the
 * text before the FIRST hyphen, then the full artifact name.
 *   nsis-3.0.4.1         → <cache>/nsis/nsis-3.0.4.1
 *   nsis-resources-3.4.1 → <cache>/nsis/nsis-resources-3.4.1
 */
function expectedPath(name) {
  const hyphen = name.indexOf('-');
  const group = hyphen > 0 ? name.slice(0, hyphen) : name;
  return path.join(cacheRoot(), group, name);
}

/** app-builder treats "directory exists" as cached; require it to be non-empty. */
function isUsableDir(dir) {
  try {
    if (!fs.statSync(dir).isDirectory()) return false;
    return fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
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

/** Is the artifact already unpacked in the cache? */
function findCached(artifact) {
  const expected = expectedPath(artifact.name);
  if (isUsableDir(expected)) return expected;
  // tolerate a cache filled in by hand or by another electron-builder version
  const found = findDirNamed(cacheRoot(), artifact.name);
  if (found && isUsableDir(found)) return found;
  return null;
}

function appBuilderBinary() {
  const base = path.join(repoRoot, 'node_modules', 'app-builder-bin');
  const exe = process.platform === 'win32' ? 'app-builder.exe' : 'app-builder';
  const arch = process.arch;
  const candidates = [];
  if (process.platform === 'win32') candidates.push(path.join(base, 'win', arch, exe));
  else if (process.platform === 'darwin') {
    candidates.push(path.join(base, 'mac', `${exe}_${arch === 'arm64' ? 'arm64' : 'amd64'}`));
  } else candidates.push(path.join(base, 'linux', arch, exe), path.join(base, 'linux', 'x64', exe));
  // electron-builder may hoist app-builder-bin into its own node_modules
  candidates.push(
    path.join(repoRoot, 'node_modules', 'electron-builder', 'node_modules', 'app-builder-bin', 'win', arch, exe),
    path.join(repoRoot, 'node_modules', 'electron-builder', 'node_modules', 'app-builder-bin', 'linux', arch, exe),
    path.join(repoRoot, 'node_modules', 'electron-builder', 'node_modules', 'app-builder-bin', 'mac', `${exe}_amd64`),
  );
  for (const c of candidates) {
    try {
      if (fs.statSync(c).isFile()) return c;
    } catch {
      /* keep looking */
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
    const overrideBase = override ? override.replace(/\/?$/, '/') : null;
    const url =
      overrideBase && base === overrideBase
        ? `${base}${artifact.name}.7z`
        : `${base}${artifact.name}/${artifact.name}.7z`;
    if (!urls.includes(url)) urls.push(url);
  }
  return urls;
}

/**
 * Runs `app-builder download-artifact`. On success app-builder prints the final
 * folder (no newline) on stdout — that path is authoritative, so it is used
 * instead of guessing the layout.
 */
function tryDownload(appBuilder, artifact, url) {
  const res = spawnSync(
    appBuilder,
    ['download-artifact', '--name', artifact.name, '--url', url, '--sha512', artifact.sha512],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true },
  );
  if (res.error) return { ok: false, message: res.error.message };
  const stdout = (res.stdout || '').trim();
  if (res.status === 0) {
    const reported = stdout.split('\n').map((l) => l.trim()).filter(Boolean).pop() || null;
    return { ok: true, dirPath: reported };
  }
  const out = `${stdout}${res.stderr || ''}`.trim();
  return { ok: false, message: out.split('\n').slice(0, 2).join(' ').slice(0, 400) };
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeQuiet(p) {
  try {
    fs.rmSync(p, { recursive: true, force: true });
  } catch {
    /* ignore — a locked file will fail later with a clearer message */
  }
}

function main() {
  log(`electron-builder cache: ${cacheRoot()}`);

  // app-builder is only needed to *download*; `--check` must work even in a
  // fresh checkout without node_modules.
  let appBuilder = null;
  const ensureAppBuilder = () => {
    if (appBuilder) return appBuilder;
    appBuilder = appBuilderBinary();
    if (!appBuilder) {
      log('');
      log('✖ app-builder binary not found — dependencies are not installed.');
      log('  Run `npm install` at the repository root, then retry.');
      process.exit(1);
    }
    return appBuilder;
  };

  let missing = 0;
  for (const artifact of ARTIFACTS) {
    const expected = expectedPath(artifact.name);
    if (FORCE) removeQuiet(expected);

    if (!FORCE) {
      const cached = findCached(artifact);
      if (cached) {
        log(`✔ ${artifact.name} (cached)  ${cached}`);
        continue;
      }
    }

    missing++;
    if (CHECK_ONLY) {
      log(`✖ ${artifact.name} (missing)  expected ${expected}`);
      continue;
    }

    // A previously interrupted extraction leaves an empty folder behind and
    // app-builder would then treat it as cached — clear it first.
    if (fs.existsSync(expected) && !isUsableDir(expected)) {
      log(`  ! removing incomplete cache folder ${expected}`);
      removeQuiet(expected);
    }

    ensureAppBuilder();
    const urls = downloadUrls(artifact);
    let cachedPath = null;

    for (let attempt = 1; attempt <= urls.length * 2 && !cachedPath; attempt++) {
      const url = urls[Math.min(attempt - 1, urls.length - 1)];
      log(`↓ ${artifact.name}  ${attempt > 1 ? `(attempt ${attempt}) ` : ''}${url}`);
      const result = tryDownload(appBuilder, artifact, url);

      if (result.ok) {
        const reported = result.dirPath;
        if (reported && isUsableDir(reported)) cachedPath = reported;
        else cachedPath = findCached(artifact);

        if (cachedPath) {
          log(`✔ ${artifact.name}  ${cachedPath}`);
          break;
        }
        // The archive unpacked somewhere we cannot see: retrying the same
        // command cannot help (app-builder would skip the existing folder).
        log(`  ✖ app-builder reported "${reported || 'no path'}" but that folder is missing or empty`);
        break;
      }

      log(`  ✖ ${result.message || 'download failed'}`);
      if (attempt < urls.length * 2) sleep(Math.min(1500 * attempt, 6000));
    }

    if (!cachedPath) {
      log('');
      log(`✖ Could not download ${artifact.name}.`);
      log('  The NSIS toolchain is hosted on GitHub release assets, which is often');
      log('  blocked by ISPs / proxies / antivirus. Options:');
      log('    1. Use a mirror:');
      log('         npm run tools:fetch -- --mirror https://npmmirror.com/mirrors/electron-builder-binaries/');
      log('    2. Set it permanently in the environment or .npmrc:');
      log('         ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/');
      log('    3. Download the .7z elsewhere, unpack it and place the folder here:');
      log(`         ${expected}`);
      log('       (folder must contain the unpacked contents, e.g. Bin\\makensis.exe or plugins\\)');
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
