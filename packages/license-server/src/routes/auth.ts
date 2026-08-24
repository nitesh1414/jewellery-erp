import { Router, Response } from 'express';
import * as bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../db';
import { signAdminToken, requireAdmin } from '../admin-auth';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req: any, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, message: 'Email and password are required' });
    return;
  }
  const { email, password } = parsed.data;
  const admin = await prisma.adminUser.findUnique({ where: { email: email.toLowerCase() } });
  if (!admin || !(await bcrypt.compare(password, admin.passwordHash))) {
    res.status(401).json({ ok: false, message: 'Invalid email or password' });
    return;
  }
  const token = signAdminToken({ sub: admin.id, email: admin.email, role: admin.role });
  res.json({
    ok: true,
    token,
    admin: { id: admin.id, email: admin.email, name: admin.name, role: admin.role },
  });
});

authRouter.get('/me', requireAdmin, async (req: any, res: Response) => {
  // requireAdmin middleware attaches `admin` (route mounted with it)
  const admin = (req as any).admin as { sub: string } | undefined;
  if (!admin) {
    res.status(401).json({ ok: false, message: 'Authentication required' });
    return;
  }
  const user = await prisma.adminUser.findUnique({ where: { id: admin.sub } });
  if (!user) {
    res.status(401).json({ ok: false, message: 'Account no longer exists' });
    return;
  }
  res.json({ ok: true, admin: { id: user.id, email: user.email, name: user.name, role: user.role } });
});
