#!/usr/bin/env node
/**
 * Makes `npm run dev`, `db:push`, `db:seed` etc. work out of the box:
 * creates packages/backend/.env with the default SQLite DATABASE_URL when
 * neither the env var nor an .env file exists. Prisma CLI and Prisma Client
 * both auto-load this file, so `prisma db push` no longer fails with
 * "Environment variable not found: DATABASE_URL".
 *
 * Set DATABASE_URL in the environment to override (e.g. for PostgreSQL).
 */
import fs from 'fs';
import path from 'path';

const backendDir = path.resolve(process.cwd(), 'packages/backend');
const envFile = path.join(backendDir, '.env');

if (process.env.DATABASE_URL) {
  // already provided — nothing to do
  process.exit(0);
}

if (fs.existsSync(envFile)) {
  process.exit(0);
}

fs.writeFileSync(envFile, 'DATABASE_URL="file:./dev.db"\n');
console.log(`Created ${path.relative(process.cwd(), envFile)} with the default SQLite database (file:./dev.db).`);
console.log('Edit it to point at PostgreSQL for production deployments.');
