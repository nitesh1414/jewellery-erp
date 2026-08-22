import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Desktop builds set DESKTOP_DB_AUTO_MIGRATE=1 — on startup the local
 * database schema is reconciled (prisma db push) so app updates never ship
 * a schema the existing database doesn't have. Requires the prisma CLI,
 * which is bundled as a production dependency of the packaged app.
 */
async function autoMigrate(): Promise<void> {
  if (process.env.DESKTOP_DB_AUTO_MIGRATE !== '1') return;
  try {
    const { execFileSync } = require('child_process');
    const path = require('path');
    const cli = path.join(__dirname, '..', 'node_modules', 'prisma', 'build', 'index.js');
    if (!fs.existsSync(cli)) return;
    console.log('[desktop] reconciling database schema…');
    execFileSync(process.execPath, [cli, 'db', 'push', '--skip-generate', '--accept-data-loss'], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL },
      stdio: 'inherit',
    });
  } catch (err) {
    console.error('[desktop] schema reconcile failed (continuing):', (err as Error).message);
  }
}

async function bootstrap() {
  await autoMigrate();
  // bodyParser: false → we register our own parsers with a bigger limit so
  // payloads like base64 shop logos don't hit 'request entity too large'
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Enable CORS (desktop app is served same-origin from this server, so this
  // mostly matters for `npm run dev` and custom deployments)
  const extraOrigins = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({
    origin: [...extraOrigins, 'http://localhost:5173', 'http://localhost:5174', 'http://localhost:3000', 'http://localhost:1420'],
    credentials: true,
  });

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global prefix
  app.setGlobalPrefix('api');

  // Health probe (used by the Electron desktop shell to know the local
  // backend has finished starting)
  app.use('/api/health', (_req: express.Request, res: express.Response) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  // Serve uploaded files — configurable so the packaged desktop app can keep
  // them in the user's writable data directory
  const uploadDir = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  app.use('/uploads', express.static(uploadDir));

  // In desktop mode the local backend also serves the built React app, so the
  // whole application works from a single offline origin (no CORS, no file://
  // quirks, BrowserRouter just works).
  const frontendDist = process.env.FRONTEND_DIST;
  if (frontendDist && fs.existsSync(path.join(frontendDist, 'index.html'))) {
    app.use(express.static(frontendDist));
    // SPA fallback for client-side routes (everything that is not /api or /uploads)
    app.use(/^\/(?!api|uploads).*/, (_req: express.Request, res: express.Response) => {
      res.sendFile(path.join(frontendDist, 'index.html'));
    });
    console.log(`Serving frontend from ${frontendDist}`);
  }

  const port = process.env.PORT || 3001;
  await app.listen(port, process.env.HOST || '0.0.0.0');
  console.log(`Backend running on http://localhost:${port}`);
}

bootstrap();
