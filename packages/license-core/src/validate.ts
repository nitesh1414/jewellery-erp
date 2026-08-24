import { LicenseEvaluation, LicenseFile, LicenseState } from './types';
import { verifyLicenseSignature } from './crypto';

/** How far the clock may appear to go backwards before we call it tampering. */
const CLOCK_ROLLBACK_TOLERANCE_MS = 24 * 60 * 60 * 1000;

export interface ValidateOptions {
  publicKeyPem: string | string[];
  machineId: string;
  now?: Date;
  /** Persisted state for clock-tamper detection. */
  state?: LicenseState | null;
}

/**
 * Fully-offline license evaluation. This is the single source of truth for the
 * desktop app: signature → machine binding → revocation → clock tamper → expiry.
 */
export function evaluateLicense(license: LicenseFile | null, opts: ValidateOptions): LicenseEvaluation {
  const now = (opts.now ?? new Date()).getTime();

  if (!license) {
    return {
      code: 'NOT_ACTIVATED',
      valid: false,
      message: 'No subscription is activated on this machine yet.',
    };
  }

  const { payload } = license;

  if (opts.state?.revokedAt) {
    return {
      code: 'REVOKED',
      valid: false,
      message: 'This subscription was revoked by the administrator.',
      license: payload,
    };
  }

  if (!verifyLicenseSignature(license, opts.publicKeyPem)) {
    return {
      code: 'INVALID_SIGNATURE',
      valid: false,
      message: 'The stored license is invalid or was tampered with.',
      license: payload,
    };
  }

  if (payload.machineId && payload.machineId !== opts.machineId) {
    return {
      code: 'MACHINE_MISMATCH',
      valid: false,
      message: 'This subscription is locked to a different machine.',
      license: payload,
    };
  }

  // Clock rollback: if the system clock is behind the last successful check
  // by more than the tolerance, the user likely rolled the clock back to
  // keep an expired subscription alive.
  const lastSeen = opts.state?.lastSeenAt ? Date.parse(opts.state.lastSeenAt) : NaN;
  if (!Number.isNaN(lastSeen) && now < lastSeen - CLOCK_ROLLBACK_TOLERANCE_MS) {
    return {
      code: 'CLOCK_TAMPERED',
      valid: false,
      message:
        'The system clock appears to have been moved backwards. ' +
        'Connect to the internet once so the subscription can be re-verified.',
      license: payload,
    };
  }

  if (payload.expiresAt) {
    const expiresAt = Date.parse(payload.expiresAt);
    if (Number.isNaN(expiresAt)) {
      return {
        code: 'INVALID_SIGNATURE',
        valid: false,
        message: 'The stored license has an invalid expiry date.',
        license: payload,
      };
    }
    const daysRemaining = Math.floor((expiresAt - now) / (24 * 60 * 60 * 1000));
    if (now > expiresAt) {
      return {
        code: 'EXPIRED',
        valid: false,
        message: 'Your subscription has expired. Please renew with a new license key.',
        license: payload,
        daysRemaining: 0,
      };
    }
    return {
      code: 'VALID',
      valid: true,
      message: 'Subscription active.',
      license: payload,
      daysRemaining,
    };
  }

  return {
    code: 'VALID',
    valid: true,
    message: 'Subscription active (lifetime).',
    license: payload,
    daysRemaining: null,
  };
}
