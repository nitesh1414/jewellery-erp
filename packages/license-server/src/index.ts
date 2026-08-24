import * as fs from 'fs';
import * as path from 'path';
import express from 'express';
import cors from 'cors';
import { config } from './config';
import { prisma } from './db';
import { authRouter } from './routes/auth';
import { subscriptionsRouter } from './routes/subscriptions';
import { licenseRouter } from './routes/license';
import { statsRouter } from './routes/stats';
import { signAdminToken } from './admin-auth';

async function ensureSchema(): Promise<void> {
  /**
   * For SQLite deployments we auto-apply the schema (prisma db push) so a
   * fresh clone / container starts with zero manual steps. On PostgreSQL we
   * only push when LICENSE_AUTO_DB_PUSH=1 — otherwise use `prisma migrate`
   * in your deployment pipeline so data is never auto-dropped.
   */
  const isPostgres = config.databaseUrl.startsWith('postgres');
  if (isPostgres && process.env.LICENSE_AUTO_DB_PUSH !== '1') return;
  const { execFileSync } = require('child_process');
  const cli = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
  const cliPath = fs.existsSync(cli) ? cli : require.resolve('prisma/build/index.js');
  execFileSync(process.execPath, [cliPath, 'db', 'push', '--skip-generate', '--accept-data-loss'], {
    cwd: path.join(__dirname, '..'),
    env: { ...process.env, DATABASE_URL: config.databaseUrl },
    stdio: 'inherit',
  });
}

async function ensureAdmin(): Promise<void> {
  const count = await prisma.adminUser.count();
  if (count > 0) return;
  const bcrypt = require('bcryptjs');
  await prisma.adminUser.create({
    data: {
      email: config.adminEmail.toLowerCase(),
      name: config.adminName,
      passwordHash: bcrypt.hashSync(config.adminPassword, 10),
      role: 'SUPER_ADMIN',
    },
  });
  // eslint-disable-next-line no-console
  console.log(`[license-server] Created default admin ${config.adminEmail} (password from ADMIN_PASSWORD env, default "Admin@12345" — change it!).`);
}

async function main() {
  await ensureSchema();
  await ensureAdmin();

  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use(cors());

  // Health probe (used by containers / uptime checks)
  app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'license-server', time: new Date().toISOString() }));

  app.use('/api/auth', authRouter);
  app.use('/api/stats', statsRouter);
  app.use('/api/subscriptions', subscriptionsRouter);
  app.use('/api/license', licenseRouter);

  // Serve the admin portal SPA when it has been built.
  if (fs.existsSync(config.adminPortalDist)) {
    app.use(express.static(config.adminPortalDist));
    app.get(/^\/(?!api\/).*/, (_req, res) => res.sendFile(path.join(config.adminPortalDist, 'index.html')));
  } else {
    app.get('/', (_req, res) =>
      res.type('html').send(`<h1>Jewellery ERP License Server</h1><p>API is running. Build the admin portal (<code>packages/admin-portal</code>) to get the UI.</p>`),
    );
  }

  app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(`[license-server] listening on http://0.0.0.0:${config.port}`);
  });
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('[license-server] fatal:', err);
  process.exit(1);
});

export { signAdminToken };
