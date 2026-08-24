/**
 * Manually (re)create the admin account. On first boot the server also seeds a
 * default admin from ADMIN_EMAIL / ADMIN_PASSWORD env vars; run this script
 * any time you need to reset credentials.
 */
import * as bcrypt from 'bcryptjs';
import { prisma } from '../db';
import { config } from '../config';

async function main() {
  const email = (process.argv[2] || config.adminEmail).toLowerCase();
  const password = process.argv[3] || config.adminPassword;
  const name = process.env.ADMIN_NAME || 'License Admin';
  const hash = bcrypt.hashSync(password, 10);
  await prisma.adminUser.upsert({
    where: { email },
    update: { passwordHash: hash },
    create: { email, name, passwordHash: hash, role: 'SUPER_ADMIN' },
  });
  // eslint-disable-next-line no-console
  console.log(`Admin ${email} saved.`);
  await prisma.$disconnect();
}

main();
