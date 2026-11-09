#!/usr/bin/env node
/**
 * build-desktop.mjs — one safe entry point for building the desktop
 * installers (Windows / macOS / Linux).
 *
 * It exists because the plain `electron-builder` pipeline fails in ways that
 * look like a crash and print nothing actionable:
 *
 *   • the NSIS toolchain cannot be downloaded (blocked GitHub release assets)
 *     → the build stops right after "signing with signtool.exe … elevate.exe"
 *   • the previous build left `release\` files locked (app still running,
 *     Explorer preview, antivirus scan) → EPERM/EBUSY while renaming
 *   • a custom NSIS snippet does not compile → makensis exits with status 1
 *
 * This wrapper
 *   1. checks the environment BEFORE compiling anything (fast failures),
 *   2. pre-downloads the NSIS toolchain (with retries + mirrors),
 *   3. kills stale app instances and removes locked leftovers,
 *   4. runs the real build and tees everything to release/build.log,
 *   5. on failure prints the interesting lines plus a targeted remedy.
 *
 * USAGE
 *   node scripts/build-desktop.mjs            # current OS
 *   node scripts/build-desktop.mjs win
 *   node scripts/build-desktop.mjs mac
 *   node scripts/build-desktop.mjs linux
 *
 * FLAGS
 *   --skip-prepare     reuse packages/desktop-electron/staging
 *   --no-fetch         never touch the network (fail if the toolchain is missing)
 *   --keep-release     do not delete release/<platform>-unpacked before building
 *   --verbose          stream electron-builder DEBUG output
 */
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const pkgDir = path.join(repoRoot, 'packages', 'desktop-electron');
const releaseDir = path.join(pkgDir, 'release');
const logFile = path.join(releaseDir, 'build.log');

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith('--')));
const target = (args.find((a) => !a.startsWith('--')) || detectTarget()).toLowerCase();

const SKIP_PREPARE = flags.has('--skip-prepare');
const NO_FETCH = flags.has('--no-fetch');
const KEEP_RELEASE = flags.has('--keep-release');

const TARGETS = {
  win: { label: 'Windows', builderArgs: ['--win', 'nsis'], unpacked: 'win-unpacked', artifact: /ShriJewellersERP-Setup-.*\.exe$/i },
  win32: { label: 'Windows', builderArgs: ['--win', 'nsis'], unpacked: 'win-unpacked', artifact: /ShriJewellersERP-Setup-.*\.exe$/i },
  mac: { label: 'macOS', builderArgs: ['--mac', 'dmg', 'zip'], unpacked: 'mac', artifact: /ShriJewellersERP-.*\.(dmg|zip)$/i },
  darwin: { label: 'macOS', builderArgs: ['--mac', 'dmg', 'zip'], unpacked: 'mac', artifact: /ShriJewellersERP-.*\.(dmg|zip)$/i },
  linux: { label: 'Linux', builderArgs: ['--linux', 'AppImage', 'deb', 'rpm'], unpacked: 'linux-unpacked', artifact: /\.(AppImage|deb|rpm)$/i },
};

function detectTarget() {
  if (process.platform === 'win32') return 'win';
  if (process.platform === 'darwin') return 'mac';
  return 'linux';
}

function say(msg = '') {
  process.stdout.write(msg + '\n');
}

function step(msg) {
  say('');
  say(`\x1b[36m▶ ${msg}\x1b[0m`);
}

// ---------------------------------------------------------------------------
// 1. Environment pre-flight
// ---------------------------------------------------------------------------
function preflight(cfg) {
  step(`Pre-flight (${cfg.label} / ${process.arch} / node ${process.versions.node})`);

  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) {
    fail(`Node.js ${process.versions.node} is too old — use Node 20 LTS or newer.`);
  }

  if (!fs.existsSync(path.join(repoRoot, 'node_modules', 'electron-builder'))) {
    fail('Dependencies are not installed.\n  Run: npm install');
  }

  // Cross-OS builds are not supported by electron-builder without extra tooling.
  const host = detectTarget();
  if (host !== target && !(target.startsWith('win') && host === 'linux')) {
    say(`  ! You are building ${cfg.label} on ${process.platform}. Each OS is normally built on itself.`);
  }

  // The staging folder must exist before electron-builder runs.
  if (!fs.existsSync(path.join(pkgDir, 'staging', 'backend', 'dist', 'main.js'))) {
    if (SKIP_PREPARE) {
      fail('staging/backend is missing but --skip-prepare was given.\n  Run: npm run prepare:desktop');
    }
    sayOnce('  ! staging/ is not built yet — it will be created by the prepare step.');
  }

  // A stale/locked release folder is the #1 cause of EPERM/EBUSY failures.
  fs.mkdirSync(releaseDir, { recursive: true });
  killStaleApp();
  if (!KEEP_RELEASE) cleanRelease(cfg);

  checkDiskSpace();
}

const saidOnce = new Set();
function sayOnce(msg) {
  if (saidOnce.has(msg)) return;
  saidOnce.add(msg);
  say(msg);
}

function killStaleApp() {
  if (process.platform !== 'win32') return;
  const names = ['Shri Jewellers ERP.exe', 'JewelleryERP.exe'];
  for (const name of names) {
    const res = spawnSync('taskkill', ['/F', '/IM', name], { stdio: 'ignore', windowsHide: true });
    if (res.status === 0) say(`  ! Closed running ${name} (it was locking release files).`);
  }
}

function cleanRelease(cfg) {
  // Remove the unpacked app + partially written installers. Artifacts of other
  // targets are kept so a Windows build does not wipe a Linux build.
  const victims = [
    path.join(releaseDir, cfg.unpacked),
    path.join(releaseDir, '__uninstaller-nsis-shri-jewellers-erp.exe'),
    path.join(releaseDir, 'builder-effective-config.yaml'),
  ];
  for (const item of victims) removeQuiet(item);

  let entries = [];
  try {
    entries = fs.readdirSync(releaseDir);
  } catch {
    return;
  }
  for (const name of entries) {
    if (!cfg.artifact.test(name) && !name.endsWith('.blockmap')) continue;
    removeQuiet(path.join(releaseDir, name));
  }
}

function removeQuiet(p) {
  try {
    if (!fs.existsSync(p)) return;
    fs.rmSync(p, { recursive: true, force: true });
  } catch (err) {
    // A locked file is a very common Windows failure — explain it instead of
    // dying with a raw stack trace.
    if (['EPERM', 'EBUSY', 'ENOTEMPTY'].includes(err?.code)) {
      fail(
        `Cannot delete ${p}\n  ${err.code}: another process is using it.\n` +
          '  Close Shri Jewellers ERP, any File Explorer window showing the folder,\n' +
          '  pause the antivirus real-time scan, then retry.',
      );
    }
    throw err;
  }
}

function checkDiskSpace() {
  let stats;
  try {
    stats = fs.statfsSync(releaseDir);
  } catch {
    return;
  }
  const freeGb = (stats.bavail * stats.bsize) / 1024 ** 3;
  // win-unpacked + installer + block map needs ~2.5 GB; the staging deps ~0.5 GB.
  if (freeGb < 4) {
    fail(
      `Only ${freeGb.toFixed(1)} GB free on ${path.parse(releaseDir).root} — a desktop build needs ~4 GB.\n` +
        '  Free space (or build on another drive) and retry.',
    );
  }
  say(`  ✔ ${freeGb.toFixed(1)} GB free`);
}

// ---------------------------------------------------------------------------
// 2. NSIS toolchain (only needed for Windows installers)
// ---------------------------------------------------------------------------
function ensureNsisToolchain() {
  if (!target.startsWith('win')) return;
  step('NSIS toolchain');
  if (NO_FETCH) {
    const res = spawnSync(process.execPath, [path.join(__dirname, 'fetch-builder-tools.mjs'), '--check'], {
      stdio: 'inherit',
      cwd: repoRoot,
    });
    if (res.status !== 0) {
      fail(
        'The NSIS toolchain is not cached and --no-fetch was given.\n' +
          '  Run `npm run tools:fetch` on a machine with internet access, or drop\n' +
          '  --no-fetch to let it download now.',
      );
    }
    return;
  }
  const res = spawnSync(process.execPath, [path.join(__dirname, 'fetch-builder-tools.mjs')], {
    stdio: 'inherit',
    cwd: repoRoot,
  });
  if (res.status !== 0) {
    fail(
      'Could not prepare the NSIS toolchain — this is exactly what makes\n' +
        '`electron-builder` stop after "signing with signtool.exe … elevate.exe".\n' +
        '  See the options printed above (mirror / manual copy / antivirus).',
    );
  }
}

// ---------------------------------------------------------------------------
// 3. Build
// ---------------------------------------------------------------------------
function runInherit(cmd, cmdArgs, opts = {}) {
  const res = spawnSync(cmd, cmdArgs, { stdio: 'inherit', cwd: repoRoot, shell: false, ...opts });
  if (res.error) fail(`${cmd} could not be started: ${res.error.message}`);
  if (res.status !== 0) fail(`${cmd} ${cmdArgs.join(' ')} failed with exit code ${res.status}.`);
}

/**
 * The Electron shell itself: `tsc` for main/preload (dist-electron) and `vite
 * build` for the activation page (dist). `prepare-backend.mjs` only stages the
 * backend + frontend, so these two must run before electron-builder.
 */
function buildShell() {
  step('Building Electron main + activation page');
  const tsc = path.join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  if (fs.existsSync(tsc)) {
    runInherit(process.execPath, [tsc, '-p', path.join(pkgDir, 'tsconfig.json')], { cwd: pkgDir });
  } else {
    runInherit('npm', ['run', 'build:main', '-w', 'packages/desktop-electron'], {
      shell: process.platform === 'win32',
    });
  }

  const vite = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  if (fs.existsSync(vite)) {
    runInherit(process.execPath, [vite, 'build'], { cwd: pkgDir });
  } else {
    runInherit('npm', ['run', 'build:renderer', '-w', 'packages/desktop-electron'], {
      shell: process.platform === 'win32',
    });
  }
}

function prepareBackend() {
  if (SKIP_PREPARE) {
    step('Backend staging (skipped)');
    return;
  }
  step('Staging backend + frontend + license assets');
  runInherit(process.execPath, [path.join(pkgDir, 'scripts', 'prepare-backend.mjs')]);
}

/**
 * Prefer running electron-builder's CLI with the current Node binary. Spawning
 * `node_modules/.bin/electron-builder.cmd` through cmd.exe is where Windows
 * builds break on paths with spaces / `&` (and on hardened shells).
 */
function builderCommand() {
  const pkgJsonPath = path.join(repoRoot, 'node_modules', 'electron-builder', 'package.json');
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJsonPath, 'utf8'));
    const rel = typeof pkg.bin === 'string' ? pkg.bin : pkg.bin?.['electron-builder'];
    if (rel) {
      const js = path.join(path.dirname(pkgJsonPath), rel);
      if (fs.existsSync(js)) return { cmd: process.execPath, args: [js] };
    }
  } catch {
    /* fall back to the shim */
  }
  return {
    cmd: path.join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'electron-builder.cmd' : 'electron-builder'),
    args: [],
    shell: process.platform === 'win32',
  };
}

function electronBuilder(cfg) {
  step(`electron-builder (${cfg.builderArgs.join(' ')})`);
  const launcher = builderCommand();
  const builderArgs = [...launcher.args, ...cfg.builderArgs, '--publish', 'never'];
  const env = { ...process.env };
  if (flags.has('--verbose')) env.DEBUG = 'electron-builder';

  return new Promise((resolve) => {
    const stream = fs.createWriteStream(logFile, { flags: 'w' });
    const child = spawn(launcher.cmd, builderArgs, {
      cwd: pkgDir,
      env,
      shell: launcher.shell ?? false,
      windowsHide: true,
    });
    let tail = '';
    const onData = (chunk, out) => {
      const text = chunk.toString();
      out.write(text);
      stream.write(text);
      tail = (tail + text).slice(-20000);
    };
    child.stdout.on('data', (c) => onData(c, process.stdout));
    child.stderr.on('data', (c) => onData(c, process.stderr));
    child.on('error', (err) => {
      stream.end();
      resolve({ code: 1, tail, error: err });
    });
    child.on('close', (code) => {
      stream.end();
      resolve({ code: code ?? 1, tail });
    });
  });
}

// ---------------------------------------------------------------------------
// 4. Diagnosis
// ---------------------------------------------------------------------------
function diagnose(text) {
  const t = (text || '').toLowerCase();
  const hints = [];

  const blockedHost =
    /release-assets\.githubusercontent\.com/.test(t) ||
    /(eof|etimedout|timeout|econnreset|403|502|dial tcp)/.test(t);

  if (/(nsis-3\.0\.4\.1|nsis-resources)/.test(t) && blockedHost) {
    hints.push(
      'The NSIS toolchain could not be downloaded from GitHub release assets\n' +
        '  (release-assets.githubusercontent.com is blocked by many ISPs/proxies/antivirus).\n' +
        '  This is why the build stops right after "signing with signtool.exe … elevate.exe".\n' +
        '  Fix: npm run tools:fetch -- --mirror https://npmmirror.com/mirrors/electron-builder-binaries/',
    );
  } else if (/electron-v\d+\.\d+\.\d+-(win32|darwin|linux)-/.test(t) && blockedHost) {
    hints.push(
      'The Electron runtime zip could not be downloaded (same blocked GitHub host).\n' +
        '  Fix: set an Electron mirror and rebuild:\n' +
        '    PowerShell: $env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"\n' +
        '    cmd:        set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/',
    );
  }
  if (/(eperm|ebusy|operation not permitted|enotempty)/.test(t)) {
    hints.push(
      'A file in release\\ is locked. Close the app, any Explorer window on the\n' +
        '  folder and pause antivirus real-time protection, then rebuild.',
    );
  }
  if (/(enospc|no space left|not enough space)/.test(t)) {
    hints.push('The disk is full — a desktop build needs ~4 GB of free space.');
  }
  if (/makensis|nsis.*(error|failed)|!include|!define/.test(t) && /error/.test(t)) {
    hints.push(
      'The NSIS script did not compile. Check packages/desktop-electron/assets/installer.nsh\n' +
        '  and any `nsis.include` file — the exact makensis error is above.',
    );
  }
  if (/cannot find module|module_not_found/.test(t)) {
    hints.push('A dependency is missing from the staging folder — re-run without --skip-prepare.');
  }
  if (/prisma|query_engine|schema-engine/.test(t) && /(not found|cannot|error)/.test(t)) {
    hints.push(
      'Prisma engine problem in the staged backend. Delete\n' +
        '  packages/desktop-electron/staging and rebuild so engines are re-fetched for win32.',
    );
  }
  if (/wine|cannot execute.*\.exe/.test(t) && process.platform !== 'win32') {
    hints.push('Cross-building Windows installers needs wine (sudo apt install wine64).');
  }
  if (/app-builder.*(failed|exit code)/.test(t) && hints.length === 0) {
    hints.push('app-builder failed — see the lines above and release/build.log.');
  }
  return hints;
}

function showFailure(tail) {
  const lines = String(tail).split('\n');
  const interesting = lines.filter((l) =>
    /(⨯|error|Error|failed|EBUSY|EPERM|ENOSPC|EOF|warning 6|!include|makensis|cannot)/.test(l),
  );
  say('');
  say('\x1b[31m──────────────── build failed ────────────────\x1b[0m');
  if (interesting.length) {
    say('');
    say('Most relevant lines:');
    for (const line of interesting.slice(-12)) say(`  ${line.trimEnd()}`);
  }
  const hints = diagnose(tail);
  if (hints.length) {
    say('');
    say('What it means / how to fix:');
    for (const h of hints) say(`  • ${h}`);
  }
  say('');
  say(`Full log: ${logFile}`);
  say('');
  say('If none of the above matches, re-run with --verbose and share the last');
  say('30 lines of release/build.log.');
  say('\x1b[31m─────────────────────────────────────────────\x1b[0m');
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------
function fail(message) {
  say('');
  say(`\x1b[31m✖ ${message}\x1b[0m`);
  process.exit(1);
}

async function main() {
  const cfg = TARGETS[target];
  if (!cfg) fail(`Unknown target "${target}". Use: win | mac | linux`);

  say(`Shri Jewellers ERP — desktop installer (${cfg.label})`);

  preflight(cfg);
  ensureNsisToolchain();
  prepareBackend();
  buildShell();

  const result = await electronBuilder(cfg);
  if (result.code !== 0) {
    showFailure(result.tail);
    process.exit(result.code);
  }

  const artifacts = fs.existsSync(releaseDir)
    ? fs.readdirSync(releaseDir).filter((f) => cfg.artifact.test(f) && !f.endsWith('.blockmap'))
    : [];

  step('Done');
  if (!artifacts.length) {
    say(`  (no artifact matched ${cfg.artifact} — check ${logFile})`);
  }
  for (const name of artifacts) {
    const size = fs.statSync(path.join(releaseDir, name)).size / 1024 ** 2;
    say(`  ✔ ${path.join(releaseDir, name)}  (${size.toFixed(1)} MB)`);
  }
}

main().catch((err) => {
  say('');
  say(`\x1b[31m✖ ${err?.stack || err}\x1b[0m`);
  process.exit(1);
});
