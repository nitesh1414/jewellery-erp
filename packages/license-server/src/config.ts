import * as fs from 'fs';
import * as path from 'path';

/**
 * Central configuration. Everything can be overridden with environment
 * variables so the same build runs locally (SQLite) or on a cloud host.
 */
function envInt(name: string, fallback: number): number {
  const v = process.env[name];
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : fallback;
}

const dataDir = process.env.LICENSE_DATA_DIR
  ? path.resolve(process.env.LICENSE_DATA_DIR)
  : path.join(__dirname, '..', 'data');

fs.mkdirSync(dataDir, { recursive: true });

export const config = {
  port: envInt('PORT', 4010),
  dataDir,
  databaseUrl: process.env.DATABASE_URL || `file:${path.join(dataDir, 'license.db')}`,
  jwtSecret: process.env.JWT_SECRET || 'license-server-dev-secret-change-me',
  adminEmail: process.env.ADMIN_EMAIL || 'admin@jewellery-erp.cloud',
  adminPassword: process.env.ADMIN_PASSWORD || 'Admin@12345',
  adminName: process.env.ADMIN_NAME || 'License Admin',
  /**
   * Ed25519 private key (PEM) used to sign licenses.
   * Priority: LICENSE_PRIVATE_KEY env → LICENSE_PRIVATE_KEY_FILE →
   * keys/license-private-key.pem → keys/dev key (dev only) → auto-generated.
   */
  privateKeyPem: loadPrivateKey(),
  /** Where the admin portal SPA build is served from (optional). */
  adminPortalDist: process.env.ADMIN_PORTAL_DIST
    ? path.resolve(process.env.ADMIN_PORTAL_DIST)
    : path.join(__dirname, '..', '..', 'admin-portal', 'dist'),
  /** Days before expiry counted as "expiring soon" on the dashboard. */
  expiringSoonDays: envInt('EXPIRING_SOON_DAYS', 30),
};

function loadPrivateKey(): string {
  const keyDir = path.join(__dirname, '..', 'keys');
  const candidates: Array<{ label: string; load: () => string | null }> = [
    { label: 'LICENSE_PRIVATE_KEY', load: () => (process.env.LICENSE_PRIVATE_KEY ? process.env.LICENSE_PRIVATE_KEY.replace(/\\n/g, '\n') : null) },
    {
      label: 'LICENSE_PRIVATE_KEY_FILE',
      load: () => {
        if (!process.env.LICENSE_PRIVATE_KEY_FILE) return null;
        return fs.readFileSync(path.resolve(process.env.LICENSE_PRIVATE_KEY_FILE), 'utf8');
      },
    },
    { label: 'keys/license-private-key.pem', load: () => readIfExists(path.join(keyDir, 'license-private-key.pem')) },
    { label: 'keys/dev-license-private-key.pem (DEV — do not use in production)', load: () => readIfExists(path.join(keyDir, 'dev-license-private-key.pem')) },
  ];
  for (const c of candidates) {
    const pem = c.load();
    if (pem && pem.includes('PRIVATE KEY')) {
      if (c.label.includes('dev')) {
        // eslint-disable-next-line no-console
        console.warn(`[license-server] Using DEVELOPMENT signing key (${c.label}). Generate a production key before going live — see docs/SUBSCRIPTION.md.`);
      }
      return pem;
    }
  }
  // Auto-generate and persist a key so first-run works out of the box.
  // NOTE: the matching public key must be embedded in the desktop build
  // (see docs/SUBSCRIPTION.md — "Rotating keys").
  const { generateKeyPairPem } = require('@jewellery-erp/license-core');
  const pair = generateKeyPairPem();
  fs.writeFileSync(path.join(keyDir, 'license-private-key.pem'), pair.privateKeyPem);
  fs.writeFileSync(path.join(keyDir, 'license-public-key.pem'), pair.publicKeyPem);
  // eslint-disable-next-line no-console
  console.warn('[license-server] Generated a NEW Ed25519 signing key at keys/license-private-key.pem. Ship keys/license-public-key.pem inside the desktop app or activation will fail.');
  return pair.privateKeyPem;
}

function readIfExists(p: string): string | null {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}
