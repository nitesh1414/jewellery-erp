import { LicensePayload, LicensePlanType, LicenseDurationType, signLicensePayload, LicenseFile } from '@jewellery-erp/license-core';
import { config } from './config';

/**
 * Builds and signs the license payload handed to a desktop machine at
 * activation (or offline by an admin).
 */
export interface SubscriptionLike {
  id: string;
  licenseKey: string;
  planType: string;
  durationType: string;
  firstActivatedAt: Date | null;
  expiresAt: Date | null;
}

export function issueLicense(
  sub: SubscriptionLike,
  machineId: string,
  overrides?: { issuedAt?: Date; expiresAt?: Date | null },
): LicenseFile {
  const now = overrides?.issuedAt ?? new Date();
  const expiresAt =
    overrides?.expiresAt !== undefined ? overrides?.expiresAt : sub.expiresAt;
  const payload: LicensePayload = {
    v: 1,
    subId: sub.id,
    licenseKey: sub.licenseKey,
    machineId,
    planType: sub.planType as LicensePlanType,
    durationType: sub.durationType as LicenseDurationType,
    issuedAt: now.toISOString(),
    expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
  };
  return signLicensePayload(payload, config.privateKeyPem);
}
