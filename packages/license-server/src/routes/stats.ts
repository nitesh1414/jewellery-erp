import { Router, Response } from 'express';
import { prisma } from '../db';
import { requireAdmin } from '../admin-auth';
import { toEventSummary } from '../serialize';
import { config } from '../config';

export const statsRouter = Router();
statsRouter.use(requireAdmin);

/** GET /api/stats — admin dashboard numbers */
statsRouter.get('/', async (_req: any, res: Response) => {
  const now = new Date();
  const soon = new Date(now.getTime() + config.expiringSoonDays * 24 * 60 * 60 * 1000);

  const [total, active, revoked, lifetime, neverActivated, expiringSoon, activations, machines, events] = await Promise.all([
    prisma.subscription.count(),
    prisma.subscription.count({ where: { status: 'ACTIVE' } }),
    prisma.subscription.count({ where: { status: 'REVOKED' } }),
    prisma.subscription.count({ where: { durationType: 'LIFETIME' } }),
    prisma.subscription.count({ where: { firstActivatedAt: null, status: 'ACTIVE' } }),
    prisma.subscription.count({
      where: { status: 'ACTIVE', expiresAt: { gte: now, lte: soon } },
    }),
    prisma.activation.count({ where: { deactivatedAt: null } }),
    prisma.activation.count(),
    prisma.licenseEvent.findMany({ orderBy: { createdAt: 'desc' }, take: 20, include: { subscription: true } }),
  ]);

  res.json({
    ok: true,
    stats: {
      totalSubscriptions: total,
      activeSubscriptions: active,
      revokedSubscriptions: revoked,
      lifetimeSubscriptions: lifetime,
      neverActivated: neverActivated,
      expiringSoon,
      activeActivations: activations,
      totalActivations: machines,
    },
    recentEvents: events.map((e: any) => ({
      ...toEventSummary(e),
      licenseKey: e.subscription?.licenseKey ?? null,
      customerName: e.subscription?.customerName ?? null,
    })),
  });
});
