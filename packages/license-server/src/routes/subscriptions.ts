import { Router, Response } from 'express';
import { z } from 'zod';
import { prisma } from '../db';
import { requireAdmin } from '../admin-auth';
import { toSubscriptionSummary, toActivationSummary, toEventSummary } from '../serialize';
import { generateLicenseKey, addDuration, encodeOfflineLicense } from '@jewellery-erp/license-core';
import { issueLicense } from '../signer';

export const subscriptionsRouter = Router();
subscriptionsRouter.use(requireAdmin);

const createSchema = z.object({
  customerName: z.string().trim().min(1).max(120),
  customerEmail: z.string().trim().email().nullish().or(z.literal('')),
  customerPhone: z.string().trim().max(30).nullish().or(z.literal('')),
  notes: z.string().trim().max(2000).nullish().or(z.literal('')),
  planType: z.enum(['TRIAL', 'STANDARD', 'PRO', 'ENTERPRISE']).default('STANDARD'),
  durationType: z.enum(['DAYS', 'MONTHS', 'YEARS', 'LIFETIME']),
  durationCount: z.number().int().positive().max(500).default(1),
  /** Lock the key to one specific machine id (as shown on the activation screen). */
  machineBinding: z.string().trim().regex(/^[0-9a-f]{16,64}$/i, 'Machine ID must be a 16–64 char hex fingerprint').nullish().or(z.literal('')),
  /** For unbound keys: how many different machines may activate. */
  maxActivations: z.number().int().min(1).max(100).default(1),
  /** Bulk-create several identical keys at once. */
  quantity: z.number().int().min(1).max(200).default(1),
});

/** GET /api/subscriptions?search=&status=&duration=&page=&pageSize= */
subscriptionsRouter.get('/', async (req: any, res: Response) => {
  const search = String(req.query.search || '').trim();
  const status = String(req.query.status || '').trim();
  const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
  const pageSize = Math.min(100, Math.max(5, parseInt(String(req.query.pageSize || '25'), 10) || 25));

  const where: any = {};
  if (status === 'ACTIVE' || status === 'REVOKED') where.status = status;
  if (search) {
    where.OR = [
      { licenseKey: { contains: search.toUpperCase() } },
      { customerName: { contains: search } },
      { customerEmail: { contains: search } },
      { customerPhone: { contains: search } },
      { machineBinding: { contains: search.toLowerCase() } },
    ];
  }

  const [total, subs] = await Promise.all([
    prisma.subscription.count({ where }),
    prisma.subscription.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { _count: { select: { activations: { where: { deactivatedAt: null } } } } },
    }),
  ]);

  res.json({
    ok: true,
    total,
    page,
    pageSize,
    subscriptions: subs.map((s: any) => toSubscriptionSummary(s, s._count.activations)),
  });
});

/** POST /api/subscriptions — create one or many subscription keys */
subscriptionsRouter.post('/', async (req: any, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Invalid input', errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const body = parsed.data;
  if (body.durationType !== 'LIFETIME' && !body.durationCount) {
    res.status(400).json({ ok: false, message: 'durationCount is required for timed subscriptions' });
    return;
  }

  const quantity = body.quantity;
  const created = [];
  for (let i = 0; i < quantity; i++) {
    const sub = await prisma.subscription.create({
      data: {
        licenseKey: generateLicenseKey(),
        customerName: body.customerName,
        customerEmail: body.customerEmail || null,
        customerPhone: body.customerPhone || null,
        notes: body.notes || null,
        planType: body.planType,
        durationType: body.durationType,
        durationCount: body.durationType === 'LIFETIME' ? 0 : body.durationCount,
        machineBinding: body.machineBinding ? body.machineBinding.toLowerCase() : null,
        maxActivations: body.machineBinding ? 1 : body.maxActivations,
      },
    });
    await logEvent(sub.id, 'CREATED', { quantity, durationType: body.durationType, durationCount: body.durationCount, machineBinding: sub.machineBinding });
    created.push(toSubscriptionSummary(sub, 0));
  }

  res.status(201).json({ ok: true, subscriptions: created });
});

/** GET /api/subscriptions/:id — detail incl. activations + event log */
subscriptionsRouter.get('/:id', async (req: any, res: Response) => {
  const sub = await prisma.subscription.findUnique({
    where: { id: req.params.id },
    include: { activations: { orderBy: { firstActivatedAt: 'desc' } }, events: { orderBy: { createdAt: 'desc' }, take: 50 } },
  });
  if (!sub) {
    res.status(404).json({ ok: false, message: 'Subscription not found' });
    return;
  }
  res.json({
    ok: true,
    subscription: toSubscriptionSummary(sub, sub.activations.filter((a: any) => !a.deactivatedAt).length),
    activations: sub.activations.map(toActivationSummary),
    events: sub.events.map(toEventSummary),
  });
});

const updateSchema = z.object({
  customerName: z.string().trim().min(1).max(120).optional(),
  customerEmail: z.string().trim().email().nullish().or(z.literal('')),
  customerPhone: z.string().trim().max(30).nullish().or(z.literal('')),
  notes: z.string().trim().max(2000).nullish().or(z.literal('')),
  maxActivations: z.number().int().min(1).max(100).optional(),
  machineBinding: z.string().trim().regex(/^[0-9a-f]{16,64}$/i).nullish().or(z.literal('')),
});

/** PATCH /api/subscriptions/:id — edit customer info / binding / seats */
subscriptionsRouter.patch('/:id', async (req: any, res: Response) => {
  const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ ok: false, message: 'Subscription not found' });
    return;
  }
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Invalid input', errors: parsed.error.flatten().fieldErrors });
    return;
  }
  const b = parsed.data;
  const data: any = {};
  if (b.customerName !== undefined) data.customerName = b.customerName;
  if (b.customerEmail !== undefined) data.customerEmail = b.customerEmail || null;
  if (b.customerPhone !== undefined) data.customerPhone = b.customerPhone || null;
  if (b.notes !== undefined) data.notes = b.notes || null;
  if (b.maxActivations !== undefined) data.maxActivations = b.maxActivations;
  if (b.machineBinding !== undefined) {
    data.machineBinding = b.machineBinding ? b.machineBinding.toLowerCase() : null;
    if (data.machineBinding) data.maxActivations = 1;
  }
  const sub = await prisma.subscription.update({ where: { id: req.params.id }, data });
  await logEvent(sub.id, 'UPDATED', data as any);
  res.json({ ok: true, subscription: toSubscriptionSummary(sub) });
});

/** POST /api/subscriptions/:id/revoke */
subscriptionsRouter.post('/:id/revoke', async (req: any, res: Response) => {
  const sub = await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'REVOKED' } });
  await logEvent(sub.id, 'REVOKED', {});
  res.json({ ok: true, subscription: toSubscriptionSummary(sub) });
});

/** POST /api/subscriptions/:id/restore */
subscriptionsRouter.post('/:id/restore', async (req: any, res: Response) => {
  const sub = await prisma.subscription.update({ where: { id: req.params.id }, data: { status: 'ACTIVE' } });
  await logEvent(sub.id, 'RESTORED', {});
  res.json({ ok: true, subscription: toSubscriptionSummary(sub) });
});

const extendSchema = z.object({
  durationType: z.enum(['DAYS', 'MONTHS', 'YEARS', 'LIFETIME']),
  durationCount: z.number().int().positive().max(500).default(1),
});

/** POST /api/subscriptions/:id/extend — add time to an active subscription */
subscriptionsRouter.post('/:id/extend', async (req: any, res: Response) => {
  const parsed = extendSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Invalid input' });
    return;
  }
  const existing = await prisma.subscription.findUnique({ where: { id: req.params.id } });
  if (!existing) {
    res.status(404).json({ ok: false, message: 'Subscription not found' });
    return;
  }
  const { durationType, durationCount } = parsed.data;
  let expiresAt: Date | null;
  if (durationType === 'LIFETIME') {
    expiresAt = null;
  } else {
    const base = existing.expiresAt && existing.expiresAt > new Date() ? existing.expiresAt : new Date();
    expiresAt = addDuration(base, durationType, durationCount);
  }
  const sub = await prisma.subscription.update({
    where: { id: existing.id },
    data: { expiresAt, durationType: durationType === 'LIFETIME' ? 'LIFETIME' : existing.durationType },
  });
  await logEvent(sub.id, 'EXTENDED', { durationType, durationCount, newExpiresAt: expiresAt?.toISOString() ?? null });
  res.json({ ok: true, subscription: toSubscriptionSummary(sub) });
});

/** DELETE /api/subscriptions/:id */
subscriptionsRouter.delete('/:id', async (req: any, res: Response) => {
  const existing = await prisma.subscription.findUnique({ where: { id: req.params.id }, include: { activations: true } });
  if (!existing) {
    res.status(404).json({ ok: false, message: 'Subscription not found' });
    return;
  }
  if (String(req.query.confirm || '') !== 'yes') {
    res.status(400).json({ ok: false, message: 'Pass ?confirm=yes to permanently delete' });
    return;
  }
  await prisma.activation.deleteMany({ where: { subscriptionId: existing.id } });
  await prisma.licenseEvent.deleteMany({ where: { subscriptionId: existing.id } });
  await prisma.subscription.delete({ where: { id: existing.id } });
  res.json({ ok: true });
});

/**
 * POST /api/subscriptions/:id/offline-license
 * Admin generates a signed license blob for a machine that cannot reach the
 * internet even for the one-time activation. Deliver to the customer out of
 * band (email / WhatsApp); they paste it into the activation screen.
 */
subscriptionsRouter.post('/:id/offline-license', async (req: any, res: Response) => {
  const machineId = String(req.body?.machineId || '').trim().toLowerCase();
  if (!/^[0-9a-f]{16,64}$/.test(machineId)) {
    res.status(400).json({ ok: false, message: 'A valid machine ID is required' });
    return;
  }
  const sub = await prisma.subscription.findUnique({ where: { id: req.params.id } });
  if (!sub) {
    res.status(404).json({ ok: false, message: 'Subscription not found' });
    return;
  }
  if (sub.status !== 'ACTIVE') {
    res.status(400).json({ ok: false, message: 'Cannot issue a license for a revoked subscription' });
    return;
  }
  if (sub.machineBinding && sub.machineBinding !== machineId) {
    res.status(400).json({ ok: false, message: 'Subscription is locked to a different machine ID' });
    return;
  }
  // Compute expiry now (starts the clock if this is the first activation).
  const firstActivation = !sub.firstActivatedAt;
  let expiresAt = sub.expiresAt;
  if (firstActivation && sub.durationType !== 'LIFETIME') {
    expiresAt = addDuration(new Date(), sub.durationType as any, sub.durationCount);
  }
  const license = issueLicense({ ...sub, expiresAt: expiresAt ?? null } as any, machineId);
  await prisma.subscription.update({
    where: { id: sub.id },
    data: { firstActivatedAt: sub.firstActivatedAt ?? new Date(), expiresAt: expiresAt ?? null },
  });
  await prisma.activation.upsert({
    where: { subscriptionId_machineId: { subscriptionId: sub.id, machineId } },
    update: { deactivatedAt: null, lastSeenAt: new Date(), licenseIssuedAt: new Date() },
    create: { subscriptionId: sub.id, machineId, licenseIssuedAt: new Date(), machineInfo: JSON.stringify({ channel: 'offline' }) },
  });
  await logEvent(sub.id, 'OFFLINE_LICENSE_ISSUED', { machineId });
  res.json({ ok: true, license, offlineCode: encodeOfflineLicense(license) });
});

export async function logEvent(subscriptionId: string | null, type: string, detail: unknown): Promise<void> {
  await prisma.licenseEvent.create({
    data: { subscriptionId, type, detail: JSON.stringify(detail ?? {}) },
  });
}
