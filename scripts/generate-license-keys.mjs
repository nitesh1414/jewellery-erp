#!/usr/bin/env node
/**
 * Generate a fresh PRODUCTION Ed25519 signing keypair for the license server:
 *
 *   packages/license-server/keys/license-private-key.pem  → stays on the server (SECRET)
 *   packages/license-server/keys/license-public-key.pem   → embedded in desktop builds
 *
 * Deliberately dependency-free (only node:crypto, PEM formats identical to
 * `@jewellery-erp/license-core`'s generateKeyPairPem) so it works on a fresh
 * clone BEFORE anything has been built — the old ts-node-dev invocation
 * crashed with "Cannot find module license-core/dist/index.js" in exactly
 * that situation.
 *
 * Usage:
 *   node scripts/generate-license-keys.mjs [--force] [--out <dir>]
 *
 * Refuses to overwrite existing production keys without --force: replacing
 * the private key silently would make every license it signs unverifiable by
 * desktop apps that ship the previous public key (see "Rotating keys" in
 * docs/SUBSCRIPTION.md).
 */
import { generateKeyPairSync } from 'node:crypto';
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const force = args.includes('--force');
const outArg = args.includes('--out') ? args[args.indexOf('--out') + 1] : null;
const outDir = outArg ? resolve(outArg) : join(repoRoot, 'packages', 'license-server', 'keys');

const privatePath = join(outDir, 'license-private-key.pem');
const publicPath = join(outDir, 'license-public-key.pem');

if (!force && (existsSync(privatePath) || existsSync(publicPath))) {
  console.error('[generate-keys] Refusing to overwrite existing production keys:');
  if (existsSync(privatePath)) console.error(`  ${privatePath}`);
  if (existsSync(publicPath)) console.error(`  ${publicPath}`);
  console.error('Replacing the private key invalidates licenses for every desktop app');
  console.error('that embeds the matching public key. Back the old keys up first, then');
  console.error('re-run with --force if you really intend to rotate (see docs/SUBSCRIPTION.md).');
  process.exit(1);
}

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();

mkdirSync(outDir, { recursive: true });
writeFileSync(privatePath, privateKeyPem);
writeFileSync(publicPath, publicKeyPem);
try {
  chmodSync(privatePath, 0o600);
} catch {
  /* chmod is a no-op on Windows — ignore */
}

console.log(`[generate-keys] Wrote ${privatePath}`);
console.log(`[generate-keys] Wrote ${publicPath}`);
console.log('');
console.log('Next steps:');
console.log('  1. Keep license-private-key.pem on this server only — never commit or share it (it is gitignored).');
console.log('  2. Restart the license server so it signs with the new key.');
console.log('  3. Build desktop installers with LICENSE_PUBLIC_KEY_FILE pointing at license-public-key.pem');
console.log('     (and LICENSE_SERVER_URL set to this server) — see docs/DEPLOY-LICENSE-SERVER-VPS.md.');
