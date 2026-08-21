export interface SubscriptionRow {
  id: string;
  licenseKey: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  notes: string | null;
  planType: string;
  durationType: string;
  durationCount: number;
  machineBinding: string | null;
  maxActivations: number;
  status: string;
  firstActivatedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ActivationRow {
  id: string;
  subscriptionId: string;
  machineId: string;
  machineInfo: string | null;
  firstActivatedAt: Date;
  lastSeenAt: Date;
  lastValidatedAt: Date | null;
  deactivatedAt: Date | null;
}

export interface EventRow {
  id: string;
  subscriptionId: string | null;
  type: string;
  detail: string | null;
  createdAt: Date;
}

import { SubscriptionSummary, ActivationSummary, LicensePlanType, LicenseDurationType, SubscriptionStatus } from '@jewellery-erp/license-core';

export function toSubscriptionSummary(sub: SubscriptionRow, activationCount?: number): SubscriptionSummary {
  return {
    id: sub.id,
    licenseKey: sub.licenseKey,
    customerName: sub.customerName,
    customerEmail: sub.customerEmail,
    customerPhone: sub.customerPhone,
    notes: sub.notes,
    planType: sub.planType as LicensePlanType,
    durationType: sub.durationType as LicenseDurationType,
    durationCount: sub.durationCount,
    machineBinding: sub.machineBinding,
    maxActivations: sub.maxActivations,
    status: sub.status as SubscriptionStatus,
    firstActivatedAt: sub.firstActivatedAt ? sub.firstActivatedAt.toISOString() : null,
    expiresAt: sub.expiresAt ? sub.expiresAt.toISOString() : null,
    createdAt: sub.createdAt.toISOString(),
    activationCount: activationCount ?? 0,
  };
}

export function toActivationSummary(a: ActivationRow): ActivationSummary {
  return {
    id: a.id,
    subscriptionId: a.subscriptionId,
    machineId: a.machineId,
    machineInfo: a.machineInfo,
    firstActivatedAt: a.firstActivatedAt.toISOString(),
    lastSeenAt: a.lastSeenAt.toISOString(),
    lastValidatedAt: a.lastValidatedAt ? a.lastValidatedAt.toISOString() : null,
    deactivatedAt: a.deactivatedAt ? a.deactivatedAt.toISOString() : null,
  };
}

export function toEventSummary(e: EventRow) {
  return {
    id: e.id,
    subscriptionId: e.subscriptionId,
    type: e.type,
    detail: e.detail ? safeParse(e.detail) : null,
    createdAt: e.createdAt.toISOString(),
  };
}

function safeParse(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}
