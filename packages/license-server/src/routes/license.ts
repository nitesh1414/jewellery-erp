import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { issueLicense } from '../signer';
import { addDuration, normalizeLicenseKey, LicenseFile } from '@jewellery-erp/license-core';
import { logEvent } from './subscriptions';

/**
 * Device-facing endpoints (no admin auth — the license key itself is the
 * credential). Called by the desktop app at activation time and, when the
 * internet happens to be available, for periodic revalidation.
 */
export const licenseRouter = Router();

const activateSchema = z.object({
  licenseKey: z.string().min(6),
  machineId: z.string().regex(/^[0-9a-f]{16,64}$/i, 'Invalid machine id'),
  machineInfo: z
    .object({
      hostname: z.string().optional(),
      platform: z.string().optional(),
      osRelease: z.string().optional(),
      appVersion: z.string().optional(),
    })
    .partial()
    .optional(),
  appVersion: z.string().optional(),
});

/** POST /api/license/activate */
licenseRouter.post('/activate', async (req: any, res: Response) => {
  const parsed = activateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: 'BAD_REQUEST', message: 'Invalid request', errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const { licenseKey, machineId } = parsed.data;
  const info = parsed.data.machineInfo || {};
  const key = normalizeLicenseKey(licenseKey);
  const machine = machineId.toLowerCase();

  const sub = await prisma.subscription.findUnique({ where: { licenseKey: key } });
  if (!sub) {
    await logEvent(null, 'ACTIVATION_DENIED', { key, machineId: machine, reason: 'KEY_NOT_FOUND' });
    res.status(404).json({ ok: false, error: 'KEY_NOT_FOUND', message: 'This license key does not exist. Please check with your vendor.' });
    return;
  }
  if (sub.status !== 'ACTIVE') {
    await logEvent(sub.id, 'ACTIVATION_DENIED', { machineId: machine, reason: 'REVOKED' });
    res.status(403).json({ ok: false, error: 'REVOKED', message: 'This subscription has been revoked by the administrator.' });
    return;
  }
  if (sub.machineBinding && sub.machineBinding !== machine) {
    await logEvent(sub.id, 'ACTIVATION_DENIED', { machineId: machine, reason: 'MACHINE_MISMATCH' });
    res.status(403).json({ ok: false, error: 'MACHINE_MISMATCH', message: 'This key is locked to a specific machine and this is not that machine.' });
    return;
  }
  if (sub.expiresAt && sub.expiresAt <= new Date() && sub.firstActivatedAt) {
    await logEvent(sub.id, 'ACTIVATION_DENIED', { machineId: machine, reason: 'EXPIRED' });
    res.status(403).json({ ok: false, error: 'EXPIRED', message: 'This subscription already expired. Ask the administrator to extend it, then activate again.' });
    return;
  }

  const existing = await prisma.activation.findUnique({
    where: { subscriptionId_machineId: { subscriptionId: sub.id, machineId: machine } },
  });

  if (!existing || existing.deactivatedAt) {
    const activeCount = await prisma.activation.count({
      where: { subscriptionId: sub.id, deactivatedAt: null, NOT: { machineId: machine } },
    });
    const alreadyCounted = existing && !existing.deactivatedAt ? 1 : 0;
    if (activeCount + alreadyCounted >= sub.maxActivations) {
      await logEvent(sub.id, 'ACTIVATION_DENIED', { machineId: machine, reason: 'NO_SEATS', activeCount });
      res.status(403).json({
        ok: false,
        error: 'NO_SEATS',
        message: `This key is already active on ${activeCount} machine(s) (limit ${sub.maxActivations}). Deactivate one first or ask for more seats.`,
      });
      return;
    }
  }

  // First activation starts the subscription clock.
  const now = new Date();
  let expiresAt = sub.expiresAt;
  if (!sub.firstActivatedAt) {
    expiresAt = sub.durationType === 'LIFETIME' ? null : addDuration(now, sub.durationType as any, sub.durationCount);
  }

  const updated = await prisma.subscription.update({
    where: { id: sub.id },
    data: { firstActivatedAt: sub.firstActivatedAt ?? now, expiresAt },
  });

  const activation = await prisma.activation.upsert({
    where: { subscriptionId_machineId: { subscriptionId: sub.id, machineId: machine } },
    update: { deactivatedAt: null, lastSeenAt: now, machineInfo: JSON.stringify(info) },
    create: { subscriptionId: sub.id, machineId: machine, machineInfo: JSON.stringify(info), lastSeenAt: now },
  });
  await prisma.activation.update({ where: { id: activation.id }, data: { licenseIssuedAt: now } });

  const license = issueLicense(updated, machine);
  await logEvent(sub.id, 'ACTIVATED', { machineId: machine, reactivation: !!existing });

  res.json({
    ok: true,
    license,
    subscription: {
      id: updated.id,
      licenseKey: updated.licenseKey,
      planType: updated.planType,
      durationType: updated.durationType,
      expiresAt: updated.expiresAt ? updated.expiresAt.toISOString() : null,
      customerName: updated.customerName,
    },
  });
});

/** POST /api/license/validate — lightweight periodic online re-check */
licenseRouter.post('/validate', async (req: any, res: Response) => {
  const key = normalizeLicenseKey(String(req.body?.licenseKey || ''));
  const machine = String(req.body?.machineId || '').toLowerCase();
  if (!key || !/^[0-9a-f]{16,64}$/.test(machine)) {
    res.status(400).json({ ok: false, message: 'licenseKey and machineId are required' });
    return;
  }
  const sub = await prisma.subscription.findUnique({ where: { licenseKey: key } });
  if (!sub) {
    res.status(404).json({ ok: false, valid: false, status: 'NOT_FOUND' });
    return;
  }
  const activation = await prisma.activation.findUnique({
    where: { subscriptionId_machineId: { subscriptionId: sub.id, machineId: machine } },
  });
  if (activation && !activation.deactivatedAt) {
    await prisma.activation.update({ where: { id: activation.id }, data: { lastValidatedAt: new Date(), lastSeenAt: new Date() } });
  }

  let status = 'ACTIVE';
  if (sub.status !== 'ACTIVE') status = 'REVOKED';
  else if (!activation || activation.deactivatedAt) status = 'NOT_ACTIVATED';
  else if (sub.expiresAt && sub.expiresAt <= new Date()) status = 'EXPIRED';

  // Re-issue the signed license so extensions made by the admin reach the
  // desktop automatically next time it is online.
  let license: LicenseFile | undefined;
  if (status === 'ACTIVE') {
    license = issueLicense(sub, machine);
  }

  res.json({
    ok: true,
    valid: status === 'ACTIVE',
    status,
    serverTime: new Date().toISOString(),
    expiresAt: sub.expiresAt ? sub.expiresAt.toISOString() : null,
    license,
    subscription: { id: sub.id, planType: sub.planType, customerName: sub.customerName },
  });
});

/** POST /api/license/deactivate — free a seat (e.g. moving to a new PC) */
licenseRouter.post('/deactivate', async (req: any, res: Response) => {
  const key = normalizeLicenseKey(String(req.body?.licenseKey || ''));
  const machine = String(req.body?.machineId || '').toLowerCase();
  const sub = await prisma.subscription.findUnique({ where: { licenseKey: key } });
  if (!sub) {
    res.status(404).json({ ok: false, message: 'License key not found' });
    return;
  }
  const activation = await prisma.activation.findUnique({
    where: { subscriptionId_machineId: { subscriptionId: sub.id, machineId: machine } },
  });
  if (!activation) {
    res.status(404).json({ ok: false, message: 'This machine is not activated' });
    return;
  }
  await prisma.activation.update({ where: { id: activation.id }, data: { deactivatedAt: new Date() } });
  await logEvent(sub.id, 'DEACTIVATED', { machineId: machine });
  res.json({ ok: true });
});
