#!/usr/bin/env node
/**
 * dev.mjs — run the Electron desktop shell in development.
 *
 * Builds backend + frontend + activation page, ensures a dev template db
 * exists, compiles the main process and launches Electron against those
 * local builds (exactly like the packaged app, minus the installer).
 *
 * The cloud license server can be started separately:
 *   npm run dev -w packages/license-server   (http://localhost:4010)
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pkgDir = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgDir, '..', '..');
const backendDir = path.join(repoRoot, 'packages', 'backend');
const prismaCli = path.join(repoRoot, 'node_modules', 'prisma', 'build', 'index.js');

function quoteForCmd(token) {
  return /\s/.test(token) ? `"${token}"` : token;
}

function run(cmd, args, opts = {}) {
  // Windows needs a shell to launch npm/npx (they are .cmd shims), but routing
  // an .exe through cmd.exe unquoted breaks on paths with spaces — Node
  // installed under "C:\Program Files\nodejs\node.exe" dies with
  // "'C:\Program' is not recognized as an internal or external command".
  // Spawn executables directly (no shell); use a shell (with quoting) only
  // for shim commands.
  const useShell = opts.shell ?? (process.platform === 'win32' && !/\.exe$/i.test(cmd));
  const finalCmd = useShell ? quoteForCmd(cmd) : cmd;
  const finalArgs = useShell ? args.map(quoteForCmd) : args;
  const res = spawnSync(finalCmd, finalArgs, { stdio: 'inherit', ...opts, shell: useShell });
  if (res.status !== 0) throw new Error(`Command failed: ${cmd} ${args.join(' ')}`);
}

run('npm', ['run', 'build', '-w', 'packages/license-core'], { cwd: repoRoot });
run('npm', ['run', 'build', '-w', 'packages/backend'], { cwd: repoRoot });
run('npx', ['vite', 'build'], { cwd: path.join(repoRoot, 'packages', 'frontend') });
run('npm', ['run', 'build:renderer'], { cwd: pkgDir });

// dev template database
const templateDb = path.join(backendDir, 'prisma', 'template.db');
if (!fs.existsSync(templateDb)) {
  console.log('▶ creating dev template database');
  run(process.execPath, [prismaCli, 'db', 'push', '--skip-generate', '--accept-data-loss', `--schema=${path.join(backendDir, 'prisma', 'schema.prisma')}`], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: `file:${templateDb}` },
  });
  run(process.execPath, [path.join(backendDir, 'prisma', 'seed-desktop.cjs')], {
    cwd: backendDir,
    env: { ...process.env, DATABASE_URL: `file:${templateDb}` },
  });
}

console.log('▶ compiling electron main');
run('npx', ['tsc', '-p', 'tsconfig.json'], { cwd: pkgDir });

console.log('▶ launching electron');
run('npx', ['electron', '.'], { cwd: pkgDir, env: { ...process.env, DESKTOP_DEV: '1' } });
