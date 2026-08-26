import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs';

/** Repo root when running unpackaged (`npm run dev` / `electron .`). */
export function repoRoot(): string {
  // dist-electron/ → package dir → packages/ → repo root
  return path.resolve(__dirname, '..', '..', '..');
}

export const isPackaged = () => app.isPackaged;

export function backendEntry(): string {
  if (isPackaged()) return path.join(process.resourcesPath, 'backend', 'dist', 'main.js');
  return path.join(repoRoot(), 'packages', 'backend', 'dist', 'main.js');
}

export function frontendDist(): string {
  if (isPackaged()) return path.join(process.resourcesPath, 'frontend');
  return path.join(repoRoot(), 'packages', 'frontend', 'dist');
}

export function templateDb(): string {
  if (isPackaged()) return path.join(process.resourcesPath, 'backend', 'template.db');
  return path.join(repoRoot(), 'packages', 'backend', 'prisma', 'template.db');
}

export function publicKeyPath(): string {
  if (isPackaged()) return path.join(process.resourcesPath, 'license-public-key.pem');
  return path.join(repoRoot(), 'packages', 'license-server', 'keys', 'dev-license-public-key.pem');
}

/** Optional file baked in at build time pointing at the vendor's license server. */
export function bundledLicenseServerUrl(): string | null {
  const candidates = isPackaged()
    ? [path.join(process.resourcesPath, 'license-server-url.txt')]
    : [path.join(repoRoot(), 'packages', 'license-server', 'dev-server-url.txt')];
  for (const p of candidates) {
    try {
      const url = fs.readFileSync(p, 'utf8').trim();
      if (url) return url;
    } catch {
      /* not present */
    }
  }
  return null;
}

export const userDataPaths = {
  dataDir: () => path.join(app.getPath('userData'), 'data'),
  dbFile: () => path.join(app.getPath('userData'), 'data', 'jewellery.db'),
  uploadsDir: () => path.join(app.getPath('userData'), 'uploads'),
  licenseDir: () => path.join(app.getPath('userData'), 'license'),
  licenseFile: () => path.join(app.getPath('userData'), 'license', 'license.json'),
  licenseStateFile: () => path.join(app.getPath('userData'), 'license', 'state.json'),
  serverConfigFile: () => path.join(app.getPath('userData'), 'license', 'license-server.json'),
  secretFile: () => path.join(app.getPath('userData'), 'app-secret.json'),
  logsDir: () => path.join(app.getPath('userData'), 'logs'),
  backendLog: () => path.join(app.getPath('userData'), 'logs', 'backend.log'),
  appLog: () => path.join(app.getPath('userData'), 'logs', 'app.log'),
  pendingKeyFile: () => path.join(app.getPath('userData'), 'pending-license-key.txt'),
};

export function ensureUserDataDirs(): void {
  for (const dir of [
    userDataPaths.dataDir(),
    userDataPaths.uploadsDir(),
    userDataPaths.licenseDir(),
    userDataPaths.logsDir(),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }
}
