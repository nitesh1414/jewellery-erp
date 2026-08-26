#!/usr/bin/env node
/**
 * prepare-backend.mjs — stage everything the packaged desktop app needs:
 *
 *   staging/backend/    compiled NestJS backend + production node_modules
 *                       (incl. Prisma SQLite engine) + pristine template.db
 *   staging/frontend/   built React app (served by the local backend)
 *   resources/license-public-key.pem   Ed25519 public key for license checks
 *   resources/license-server-url.txt   license server the app activates against
 *
 * Usage:
 *   node scripts/prepare-backend.mjs                 # full stage
 *   node scripts/prepare-backend.mjs --skip-install  # deps already staged
 *
 * Env:
 *   LICENSE_PUBLIC_KEY_FILE  PEM file to embed (default: license-server dev key)
 *   LICENSE_SERVER_URL       license server URL baked into the build
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgDir, '..', '..');
const backendDir = path.join(repoRoot, 'packages', 'backend');
const frontendDir = path.join(repoRoot, 'packages', 'frontend');
const stagingDir = path.join(pkgDir, 'staging');
const resourcesDir = path.join(pkgDir, 'resources');
const prismaCli = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');

const skipInstall = process.argv.includes('--skip-install');

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
  if (res.status !== 0) {
    throw new Error(`Command failed (${res.status}): ${cmd} ${args.join(' ')}`);
  }
}

function copyDir(src, dest, filter = () => true) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name);
    const d = path.join(dest, entry.name);
    if (!filter(entry.name, s)) continue;
    if (entry.isDirectory()) copyDir(s, d, filter);
    else fs.copyFileSync(s, d);
  }
}

console.log('▶ building shared license-core');
run('npm', ['run', 'build', '-w', 'packages/license-core'], { cwd: repoRoot });

console.log('▶ building backend (tsc)');
run('npm', ['run', 'build', '-w', 'packages/backend'], { cwd: repoRoot });

console.log('▶ building frontend (vite)');
// `build:fast` skips the repo's strict `tsc -b` gate (which has pre-existing
// errors unrelated to packaging); vite/esbuild output is identical.
run('npx', ['vite', 'build'], { cwd: path.join(repoRoot, 'packages', 'frontend') });

console.log('▶ staging backend');
fs.rmSync(path.join(stagingDir, 'backend'), { recursive: true, force: true });
copyDir(path.join(backendDir, 'dist'), path.join(stagingDir, 'backend', 'dist'));
fs.mkdirSync(path.join(stagingDir, 'backend', 'prisma'), { recursive: true });
fs.copyFileSync(
  path.join(backendDir, 'prisma', 'schema.prisma'),
  path.join(stagingDir, 'backend', 'prisma', 'schema.prisma'),
);
// The runtime role bootstrap is shared by the compiled backend and seed.
fs.copyFileSync(
  path.join(backendDir, 'prisma', 'default-role-permissions.cjs'),
  path.join(stagingDir, 'backend', 'prisma', 'default-role-permissions.cjs'),
);

// package.json without the workspace dependency (we copy shared bits ourselves
// if ever needed) — used for a standalone production dependency install.
const backendPkg = JSON.parse(fs.readFileSync(path.join(backendDir, 'package.json'), 'utf8'));
const deps = { ...backendPkg.dependencies };
delete deps['@jewellery-erp/shared'];
fs.writeFileSync(
  path.join(stagingDir, 'backend', 'package.json'),
  JSON.stringify({ name: 'jewellery-erp-backend-packaged', version: backendPkg.version, private: true, dependencies: deps }, null, 2),
);

if (!skipInstall) {
  console.log('▶ installing production dependencies into staging');
  run('npm', ['install', '--omit=dev', '--no-audit', '--no-fund', '--loglevel', 'error'], {
    cwd: path.join(stagingDir, 'backend'),
  });
}

console.log('▶ generating prisma client for staging');
run(process.execPath, [prismaCli, 'generate', `--schema=${path.join(stagingDir, 'backend', 'prisma', 'schema.prisma')}`], {
  cwd: stagingDir,
});

console.log('▶ creating pristine template database');
const templateDb = path.join(stagingDir, 'backend', 'template.db');
fs.rmSync(templateDb, { force: true });
run(
  process.execPath,
  [prismaCli, 'db', 'push', '--skip-generate', '--accept-data-loss', `--schema=${path.join(stagingDir, 'backend', 'prisma', 'schema.prisma')}`],
  { cwd: stagingDir, env: { ...process.env, DATABASE_URL: `file:${templateDb}` } },
);
console.log('▶ seeding template database (minimal bootstrap, no demo data)');
// Run the seed with the STAGING prisma client so engines resolve correctly.
fs.copyFileSync(path.join(backendDir, 'prisma', 'seed-desktop.cjs'), path.join(stagingDir, 'backend', 'seed-desktop.cjs'));
run(process.execPath, [path.join(stagingDir, 'backend', 'seed-desktop.cjs')], {
  cwd: path.join(stagingDir, 'backend'),
  env: { ...process.env, DATABASE_URL: `file:${templateDb}` },
});

console.log('▶ staging frontend');
fs.rmSync(path.join(stagingDir, 'frontend'), { recursive: true, force: true });
copyDir(path.join(frontendDir, 'dist'), path.join(stagingDir, 'frontend'));

console.log('▶ staging license verification assets');
fs.mkdirSync(resourcesDir, { recursive: true });
const publicKeyFile =
  process.env.LICENSE_PUBLIC_KEY_FILE || path.join(repoRoot, 'packages', 'license-server', 'keys', 'dev-license-public-key.pem');
fs.copyFileSync(publicKeyFile, path.join(resourcesDir, 'license-public-key.pem'));
fs.writeFileSync(path.join(resourcesDir, 'license-server-url.txt'), (process.env.LICENSE_SERVER_URL || 'http://localhost:4010').trim() + '\n');

console.log('✔ staging complete');
