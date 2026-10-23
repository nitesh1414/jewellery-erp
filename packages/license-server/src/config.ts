import * as fs from 'fs';
import * as path from 'path';

/**
 * Load `packages/license-server/.env` (if present) before any env var is
 * read, so a VPS deployment can keep all settings in one file no matter how
 * the process is started (PM2, systemd, plain `npm run start:license`).
 * Real environment variables always win. This is a deliberately tiny
 * KEY=VALUE parser (no multiline values — use LICENSE_PRIVATE_KEY_FILE for
 * PEM material), so it needs no extra dependency.
 */
function loadDotEnvFile(): void {
  try {
    const envFile = path.join(__dirname, '..', '.env');
    const text = fs.readFileSync(envFile, 'utf8');
    for (const rawLine of text.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (process.env[key] === undefined) process.env[key] = value;
    }
  } catch {
    /* no .env file — configuration comes from the real environment */
  }
}
loadDotEnvFile();

const DEFAULT_JWT_SECRET = 'license-server-dev-secret-change-me';

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
  /** Interface to bind. Keep 0.0.0.0 for direct access; behind an Nginx
   * reverse proxy on the same box set HOST=127.0.0.1 so the API is not
   * reachable on the public interface at all. */
  host: process.env.HOST || '0.0.0.0',
  port: envInt('PORT', 4010),
  dataDir,
  databaseUrl: process.env.DATABASE_URL || `file:${path.join(dataDir, 'license.db')}`,
  jwtSecret: process.env.JWT_SECRET || DEFAULT_JWT_SECRET,
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

if (process.env.NODE_ENV === 'production' && config.jwtSecret === DEFAULT_JWT_SECRET) {
  // eslint-disable-next-line no-console
  console.warn(
    '[license-server] WARNING: JWT_SECRET is not set — admin tokens are signed with the public ' +
      'development secret, so anyone can forge an admin session. Set JWT_SECRET (e.g. `openssl rand -hex 48`) ' +
      'in packages/license-server/.env — see docs/DEPLOY-LICENSE-SERVER-VPS.md.',
  );
}

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
