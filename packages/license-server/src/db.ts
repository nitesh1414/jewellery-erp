// Dedicated generated client (see prisma/schema.prisma output). Same depth
// from src/ (ts-node-dev) and dist/ (npm start): ../../../ = repo root.
import { PrismaClient } from '../../../node_modules/.prisma/license-client';
import { config } from './config';

export const prisma = new PrismaClient({
  datasources: { db: { url: config.databaseUrl } },
});
