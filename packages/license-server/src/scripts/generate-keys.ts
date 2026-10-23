import { generateKeyPairPem } from '@jewellery-erp/license-core';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate a fresh production Ed25519 keypair:
 *  - keys/license-private-key.pem  → stays on the license server (secret!)
 *  - keys/license-public-key.pem   → embedded in the desktop app build
 *
 * Preferred entry point (works before license-core is ever built):
 *   npm run license:generate-keys            (from the repo root)
 *   npm run generate-keys -w packages/license-server
 * This TypeScript version remains for parity; run it with:
 *   npm run generate-keys:ts -w packages/license-server
 * (the raw `npx ts-node-dev …` form used to crash on a fresh clone because
 * `@jewellery-erp/license-core/dist` did not exist yet, and ts-node-dev then
 * kept watching instead of exiting.)
 */
const dir = path.join(__dirname, '..', '..', 'keys');
const privatePath = path.join(dir, 'license-private-key.pem');
const publicPath = path.join(dir, 'license-public-key.pem');

if (!process.argv.includes('--force') && (fs.existsSync(privatePath) || fs.existsSync(publicPath))) {
  // eslint-disable-next-line no-console
  console.error('[generate-keys] Refusing to overwrite existing production keys in ' + dir + '.');
  // eslint-disable-next-line no-console
  console.error('Back the old keys up first, then re-run with --force if you really intend to rotate (see docs/SUBSCRIPTION.md).');
  process.exit(1);
}

const pair = generateKeyPairPem();
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(privatePath, pair.privateKeyPem);
fs.writeFileSync(publicPath, pair.publicKeyPem);
try {
  fs.chmodSync(privatePath, 0o600);
} catch {
  /* chmod is a no-op on Windows — ignore */
}
// eslint-disable-next-line no-console
console.log(`Wrote ${dir}/license-private-key.pem and license-public-key.pem`);
// eslint-disable-next-line no-console
console.log('Copy license-public-key.pem into the desktop build via LICENSE_PUBLIC_KEY_FILE (see docs/DEPLOY-LICENSE-SERVER-VPS.md).');
