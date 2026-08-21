import { generateKeyPairPem } from '@jewellery-erp/license-core';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Generate a fresh production Ed25519 keypair:
 *  - keys/license-private-key.pem  → stays on the license server (secret!)
 *  - keys/license-public-key.pem   → embedded in the desktop app build
 * Run with: npx ts-node-dev --transpile-only packages/license-server/src/scripts/generate-keys.ts
 */
const dir = path.join(__dirname, '..', '..', 'keys');
const pair = generateKeyPairPem();
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'license-private-key.pem'), pair.privateKeyPem);
fs.writeFileSync(path.join(dir, 'license-public-key.pem'), pair.publicKeyPem);
// eslint-disable-next-line no-console
console.log(`Wrote ${dir}/license-private-key.pem and license-public-key.pem`);
// eslint-disable-next-line no-console
console.log('Copy license-public-key.pem into the desktop build via LICENSE_PUBLIC_KEY_FILE (see docs/SUBSCRIPTION.md).');
