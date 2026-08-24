/**
 * License / subscription shared types.
 * Used by: cloud license server (signing) + Electron desktop app (verification).
 */

/** How a subscription's validity period is expressed. */
export type LicenseDurationType = 'DAYS' | 'MONTHS' | 'YEARS' | 'LIFETIME';

/** Lifecycle status of a subscription as stored on the cloud server. */
export type SubscriptionStatus = 'ACTIVE' | 'REVOKED';

/** Informational plan tiers (do not affect enforcement). */
export type LicensePlanType = 'TRIAL' | 'STANDARD' | 'PRO' | 'ENTERPRISE';

/**
 * The signed payload that a desktop machine stores locally after activation.
 * Signed with Ed25519 by the cloud license server; the desktop only holds the
 * public key, so licenses cannot be forged on the machine.
 */
export interface LicensePayload {
  /** Format version. */
  v: 1;
  /** Subscription id on the cloud server. */
  subId: string;
  /** The license key the customer entered. */
  licenseKey: string;
  /** Machine this license is bound to (always set after activation). */
  machineId: string;
  planType: LicensePlanType;
  durationType: LicenseDurationType;
  /** ISO date when the license blob was issued. */
  issuedAt: string;
  /** ISO date after which the license is no longer valid. `null` = lifetime. */
  expiresAt: string | null;
  /** Free-form features/entitlements (reserved). */
  features?: string[];
}

/** What gets persisted on disk in the desktop app. */
export interface LicenseFile {
  payload: LicensePayload;
  /** Base64 Ed25519 signature over `canonicalize(payload)`. */
  signature: string;
}

/** Local, non-secret state used for clock-tamper detection. */
export interface LicenseState {
  machineId: string;
  activatedAt: string;
  /** Last time the app successfully validated the license (ISO). */
  lastSeenAt: string;
  /** Last successful online revalidation (ISO) — null if never online. */
  lastOnlineValidationAt: string | null;
  /** Set when the server reported the license revoked. */
  revokedAt?: string | null;
}

export type LicenseEvaluationCode =
  | 'VALID'
  | 'NOT_ACTIVATED'
  | 'INVALID_SIGNATURE'
  | 'MACHINE_MISMATCH'
  | 'EXPIRED'
  | 'REVOKED'
  | 'CLOCK_TAMPERED';

export interface LicenseEvaluation {
  code: LicenseEvaluationCode;
  valid: boolean;
  /** Human-readable explanation for the blocked screen. */
  message: string;
  license?: LicensePayload;
  /** Days remaining (rounded); null when lifetime / not applicable. */
  daysRemaining?: number | null;
}

/** Result of activation against the cloud server. */
export interface ActivationResponse {
  ok: true;
  license: LicenseFile;
  subscription: {
    id: string;
    licenseKey: string;
    planType: LicensePlanType;
    durationType: LicenseDurationType;
    expiresAt: string | null;
    customerName?: string | null;
  };
}

export interface ApiError {
  ok: false;
  error: string;
  message: string;
}

/** Summary of a subscription row as shown in the admin panel. */
export interface SubscriptionSummary {
  id: string;
  licenseKey: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  planType: LicensePlanType;
  durationType: LicenseDurationType;
  durationCount: number;
  machineBinding: string | null;
  maxActivations: number;
  status: SubscriptionStatus;
  firstActivatedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  activationCount: number;
}

export interface ActivationSummary {
  id: string;
  subscriptionId: string;
  machineId: string;
  machineInfo: string | null;
  firstActivatedAt: string;
  lastSeenAt: string;
  lastValidatedAt: string | null;
  deactivatedAt: string | null;
}
