import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { net } from 'electron';
import {
  LicenseFile,
  LicenseState,
  LicenseEvaluation,
  evaluateLicense,
  decodeOfflineLicense,
  encodeOfflineLicense,
} from '@jewellery-erp/license-core';
import { userDataPaths, publicKeyPath, bundledLicenseServerUrl } from './paths';

/** Fallback when nothing else is configured. Vendors: change via the
 *  activation screen (persisted) or `license-server-url.txt` at build time. */
export const DEFAULT_LICENSE_SERVER_URL = 'http://localhost:4010';

export interface ActivationResult {
  ok: boolean;
  message: string;
  evaluation?: LicenseEvaluation;
}

export class LicenseManager {
  constructor(private machineId: string) {}

  private get publicKey(): string {
    return fs.readFileSync(publicKeyPath(), 'utf8');
  }

  // ---------- persistent bits ----------

  readLicense(): LicenseFile | null {
    try {
      const raw = JSON.parse(fs.readFileSync(userDataPaths.licenseFile(), 'utf8'));
      return raw && raw.payload && raw.signature ? (raw as LicenseFile) : null;
    } catch {
      return null;
    }
  }

  readState(): LicenseState | null {
    try {
      return JSON.parse(fs.readFileSync(userDataPaths.licenseStateFile(), 'utf8'));
    } catch {
      return null;
    }
  }

  private writeState(state: LicenseState): void {
    fs.writeFileSync(userDataPaths.licenseStateFile(), JSON.stringify(state, null, 2));
  }

  private saveLicense(license: LicenseFile): void {
    fs.writeFileSync(userDataPaths.licenseFile(), JSON.stringify(license, null, 2));
    const prev = this.readState();
    this.writeState({
      machineId: this.machineId,
      activatedAt: new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      lastOnlineValidationAt: prev?.lastOnlineValidationAt ?? null,
      revokedAt: null,
    });
  }

  // ---------- evaluation ----------

  evaluate(now: Date = new Date()): LicenseEvaluation {
    return evaluateLicense(this.readLicense(), {
      publicKeyPem: this.publicKey,
      machineId: this.machineId,
      now,
      state: this.readState(),
    });
  }

  /** Record a successful check — advances the clock-tamper watermark. */
  markSeen(): void {
    const license = this.readLicense();
    if (!license) return;
    const state = this.readState();
    this.writeState({
      machineId: this.machineId,
      activatedAt: state?.activatedAt ?? new Date().toISOString(),
      lastSeenAt: new Date().toISOString(),
      lastOnlineValidationAt: state?.lastOnlineValidationAt ?? null,
      revokedAt: state?.revokedAt ?? null,
    });
  }

  // ---------- server config ----------

  getServerUrl(): string {
    try {
      const cfg = JSON.parse(fs.readFileSync(userDataPaths.serverConfigFile(), 'utf8'));
      if (cfg && typeof cfg.url === 'string' && cfg.url) return cfg.url.replace(/\/$/, '');
    } catch {
      /* not configured */
    }
    return (bundledLicenseServerUrl() || DEFAULT_LICENSE_SERVER_URL).replace(/\/$/, '');
  }

  setServerUrl(url: string): void {
    const normalized = url.trim().replace(/\/$/, '');
    if (!/^https?:\/\//.test(normalized)) throw new Error('Server URL must start with http:// or https://');
    fs.mkdirSync(path.dirname(userDataPaths.serverConfigFile()), { recursive: true });
    fs.writeFileSync(userDataPaths.serverConfigFile(), JSON.stringify({ url: normalized }, null, 2));
  }

  // ---------- activation ----------

  /** Online activation — requires internet ONCE, right after installation. */
  async activateOnline(licenseKey: string, serverUrl?: string): Promise<ActivationResult> {
    if (serverUrl) this.setServerUrl(serverUrl);
    const base = this.getServerUrl();
    let res: Response;
    try {
      res = await net.fetch(`${base}/api/license/activate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey,
          machineId: this.machineId,
          machineInfo: {
            hostname: os_hostname(),
            platform: process.platform,
            osRelease: os_release(),
            appVersion: app_version(),
          },
        }),
      });
    } catch (e: any) {
      return {
        ok: false,
        message:
          `Could not reach the license server (${base}). ` +
          'Check your internet connection — internet is needed only this once to activate. ' +
          'If this PC can never be online, use “Activate offline” with a code from your vendor.',
      };
    }

    const data: any = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok) {
      return { ok: false, message: data?.message || `Activation failed (HTTP ${res.status}).` };
    }

    this.saveLicense(data.license as LicenseFile);
    return {
      ok: true,
      message: `Subscription activated${data.subscription?.expiresAt ? ' until ' + new Date(data.subscription.expiresAt).toLocaleDateString() : ' (lifetime)'}.`,
      evaluation: this.evaluate(),
    };
  }

  /** Offline activation with a signed code generated by the admin panel. */
  activateOffline(blob: string): ActivationResult {
    const license = decodeOfflineLicense(blob);
    if (!license) {
      return { ok: false, message: 'That offline code could not be read. Paste the full code your vendor gave you.' };
    }
    const evaluation = evaluateLicense(license, {
      publicKeyPem: this.publicKey,
      machineId: this.machineId,
      state: null,
    });
    if (evaluation.code === 'MACHINE_MISMATCH') {
      return { ok: false, message: 'This offline code was issued for a different machine. Ask your vendor for a code for your machine ID (shown on this screen).' };
    }
    if (evaluation.code === 'INVALID_SIGNATURE') {
      return { ok: false, message: 'This offline code is not valid for this application build.' };
    }
    if (evaluation.code === 'EXPIRED') {
      return { ok: false, message: 'This offline code has already expired. Ask your vendor for a new one.' };
    }
    this.saveLicense(license);
    return { ok: true, message: 'Subscription activated offline.', evaluation };
  }

  /**
   * Best-effort online revalidation (runs when internet happens to be
   * available). Picks up revocations and extensions immediately; failures are
   * ignored so the app keeps working fully offline.
   */
  async revalidateOnline(): Promise<void> {
    const license = this.readLicense();
    if (!license) return;
    const base = this.getServerUrl();
    try {
      const res = await net.fetch(`${base}/api/license/validate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey: license.payload.licenseKey, machineId: this.machineId }),
      });
      const data: any = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) return;

      const state = this.readState();
      const nowIso = new Date().toISOString();

      if (data.status === 'REVOKED') {
        this.writeState({
          machineId: this.machineId,
          activatedAt: state?.activatedAt ?? nowIso,
          lastSeenAt: nowIso,
          lastOnlineValidationAt: nowIso,
          revokedAt: nowIso,
        });
        return;
      }

      // Server may re-issue the license (e.g. admin extended the subscription).
      if (data.license?.payload && data.license?.signature) {
        const reissued = decodeOfflineLicense(encodeOfflineLicense(data.license));
        if (reissued && reissued.payload.machineId === this.machineId) {
          fs.writeFileSync(userDataPaths.licenseFile(), JSON.stringify(reissued, null, 2));
        }
      }

      if (data.valid) {
        this.writeState({
          machineId: this.machineId,
          activatedAt: state?.activatedAt ?? nowIso,
          lastSeenAt: nowIso,
          lastOnlineValidationAt: nowIso,
          revokedAt: null,
        });
      }
    } catch {
      /* offline — local validation continues */
    }
  }

  /** Clears the clock-tamper watermark after a successful online check. */
  clearTamperFlag(): void {
    const state = this.readState();
    if (!state) return;
    this.writeState({ ...state, lastSeenAt: new Date().toISOString() });
  }

  /** Per-machine secret used to sign the local backend's JWTs. */
  static appSecret(): string {
    try {
      const raw = fs.readFileSync(userDataPaths.secretFile(), 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed?.secret) return parsed.secret;
    } catch {
      /* generate below */
    }
    const secret = crypto.randomBytes(32).toString('hex');
    fs.writeFileSync(userDataPaths.secretFile(), JSON.stringify({ secret }, null, 2));
    return secret;
  }
}

// small helpers to avoid importing `os`/`app` at module top for testability
import { hostname, release, type, arch } from 'os';
import { app } from 'electron';
function os_hostname(): string {
  return hostname();
}
function os_release(): string {
  return `${type()} ${release()} (${arch()})`;
}
function app_version(): string {
  return app.getVersion();
}
