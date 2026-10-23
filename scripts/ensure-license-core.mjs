#!/usr/bin/env node
/**
 * Make sure `@jewellery-erp/license-core` is built before anything requires it.
 *
 * license-core is a compiled workspace package (`main: dist/index.js`) and
 * `dist/` is gitignored, so a fresh `git clone` + `npm install` leaves a
 * symlink in node_modules that points at a package with NO entry file. Any
 * `require('@jewellery-erp/license-core')` (license server, Electron main,
 * key-generation scripts, …) then dies with:
 *
 *   Error: Cannot find module '.../node_modules/@jewellery-erp/license-core/dist/index.js'.
 *   Please verify that the package.json has a valid "main" entry
 *
 * This helper builds license-core with tsc only when dist/ is missing or
 * older than the sources, so dev/build scripts can call it unconditionally.
 *
 * Usage:
 *   node scripts/ensure-license-core.mjs            build if stale; warn-only if tsc is unavailable
 *   node scripts/ensure-license-core.mjs --strict   exit 1 if the build cannot be ensured
 *   node scripts/ensure-license-core.mjs --check    only verify dist exists (for `prestart`)
 *   node scripts/ensure-license-core.mjs --force    rebuild even when up to date
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const coreDir = join(repoRoot, 'packages', 'license-core');
const distEntry = join(coreDir, 'dist', 'index.js');
const distTypes = join(coreDir, 'dist', 'index.d.ts');

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const checkOnly = args.includes('--check');
const force = args.includes('--force');

const MANUAL_FIX = 'Run "npm run build -w packages/license-core" from the repo root.';

function newestMtime(dir) {
  let newest = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestMtime(p));
    else if (entry.isFile()) newest = Math.max(newest, statSync(p).mtimeMs);
  }
  return newest;
}

function isUpToDate() {
  if (!existsSync(distEntry) || !existsSync(distTypes)) return false;
  const builtAt = statSync(distEntry).mtimeMs;
  const inputs = [newestMtime(join(coreDir, 'src')), statSync(join(coreDir, 'tsconfig.json')).mtimeMs];
  return builtAt >= Math.max(...inputs);
}

function findTsc() {
  const candidates = [
    join(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'),
    join(coreDir, 'node_modules', 'typescript', 'bin', 'tsc'),
  ];
  return candidates.find((p) => existsSync(p)) || null;
}

function fail(message) {
  console.error(`[license-core] ${message}`);
  if (strict || checkOnly) process.exit(1);
  console.error('[license-core] Continuing anyway (pass --strict to make this fatal).');
  process.exit(0);
}

if (checkOnly) {
  if (existsSync(distEntry)) process.exit(0);
  fail(`Build output missing: ${distEntry}. ${MANUAL_FIX}`);
}

if (!force && isUpToDate()) {
  console.log('[license-core] Build is up to date; skipped.');
  process.exit(0);
}

const tsc = findTsc();
if (!tsc) {
  fail(`TypeScript compiler not found (node_modules/typescript). Did you run "npm install"? ${MANUAL_FIX}`);
}

console.log('[license-core] Building @jewellery-erp/license-core (dist missing or stale)…');
try {
  execFileSync(process.execPath, [tsc, '-p', join(coreDir, 'tsconfig.json')], {
    cwd: coreDir,
    stdio: 'inherit',
  });
} catch (error) {
  fail(`tsc failed with exit code ${error?.status ?? 1}. ${MANUAL_FIX}`);
}

if (!existsSync(distEntry)) {
  fail(`tsc finished but ${distEntry} still does not exist. ${MANUAL_FIX}`);
}
console.log('[license-core] Built packages/license-core/dist.');
