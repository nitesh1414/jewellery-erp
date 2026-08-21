/**
 * Minimal bootstrap seed for the packaged desktop app (no demo data).
 *
 * Creates: organization, main branch, an admin login, shop settings, common
 * HSN codes, gold/silver rates and a primary cash account. The first-run
 * setup wizard inside the app then customizes shop details.
 *
 * Run by the desktop packaging scripts against the template SQLite database:
 *   DATABASE_URL=file:...template.db node prisma/seed-desktop.cjs
 */
const path = require('path');
const { PrismaClient } = require(path.join(__dirname, '..', 'node_modules', '@prisma', 'client'));
const bcrypt = require(path.join(__dirname, '..', 'node_modules', 'bcryptjs'));

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: 'default-org' },
    update: {},
    create: { id: 'default-org', name: 'My Jewellery Shop' },
  });

  await prisma.branch.upsert({
    where: { id: 'default-branch' },
    update: {},
    create: {
      id: 'default-branch',
      organizationId: org.id,
      name: 'Main Branch',
      code: 'MAIN',
    },
  });

  await prisma.user.upsert({
    where: { email: 'admin@jewellery.com' },
    update: {},
    create: {
      organizationId: org.id,
      branchId: 'default-branch',
      name: 'Admin',
      email: 'admin@jewellery.com',
      password: await bcrypt.hash('admin123', 10),
      role: 'SUPER_ADMIN',
    },
  });

  await prisma.shopSettings.upsert({
    where: { organizationId: org.id },
    update: {},
    create: { organizationId: org.id, shopName: 'My Jewellery Shop' },
  });

  const hsnCodes = [
    { code: '7113', description: 'Articles of jewellery and parts thereof', gstRate: 3, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 },
    { code: '7108', description: 'Gold (including gold plated with platinum)', gstRate: 3, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 },
    { code: '7106', description: 'Silver (including silver plated with gold)', gstRate: 3, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 },
    { code: '7114', description: 'Articles of goldsmiths or silversmiths wares', gstRate: 3, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 },
    { code: '7115', description: 'Other articles of precious metal', gstRate: 3, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 },
    { code: '7117', description: 'Imitation jewellery', gstRate: 18, cgstRate: 9, sgstRate: 9, igstRate: 18 },
  ];
  for (const h of hsnCodes) {
    const exists = await prisma.hsnCode.findFirst({ where: { code: h.code, organizationId: org.id } });
    if (!exists) await prisma.hsnCode.create({ data: { ...h, organizationId: org.id } });
  }

  const rates = [
    { metalType: 'GOLD', purity: '24K', rate: 0 },
    { metalType: 'GOLD', purity: '22K', rate: 0 },
    { metalType: 'GOLD', purity: '20K', rate: 0 },
    { metalType: 'GOLD', purity: '18K', rate: 0 },
    { metalType: 'SILVER', purity: 'SILVER_999', rate: 0 },
    { metalType: 'SILVER', purity: 'SILVER_925', rate: 0 },
  ];
  for (const r of rates) {
    const exists = await prisma.rateMaster.findFirst({ where: { metalType: r.metalType, purity: r.purity, organizationId: org.id } });
    if (!exists) await prisma.rateMaster.create({ data: { ...r, organizationId: org.id } });
  }

  const cash = await prisma.ledgerAccount.findFirst({ where: { organizationId: org.id, type: 'CASH' } });
  if (!cash) {
    await prisma.ledgerAccount.create({
      data: { organizationId: org.id, branchId: 'default-branch', name: 'Cash Counter', type: 'CASH', isPrimary: true },
    });
  }

  console.log('[seed-desktop] template database seeded (admin@jewellery.com / admin123 — change this password after first login)');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('[seed-desktop] failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
