import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import * as express from 'express';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

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
