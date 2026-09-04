import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const { DEFAULT_ROLE_PERMISSIONS: rolePerms } = require('./default-role-permissions.cjs') as {
  DEFAULT_ROLE_PERMISSIONS: Record<string, string[]>;
};

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // Create Organization
  const org = await prisma.organization.upsert({
    where: { id: 'default-org' },
    update: {},
    create: {
      id: 'default-org',
      name: 'Shri Jewellers',
      gstin: '27ABCDE1234F1Z5',
      address: '123, Main Road, Sitabuldi',
      city: 'Nagpur',
      state: 'Maharashtra',
      pin: '440012',
      phone: '0712-1234567',
      email: 'info@shrijewellers.com',
    },
  });

  // Create Branch
  const branch = await prisma.branch.upsert({
    where: { id: 'default-branch' },
    update: {},
    create: {
      id: 'default-branch',
      organizationId: org.id,
      name: 'Main Branch',
      code: 'MAIN',
      address: '123, Main Road, Sitabuldi',
      city: 'Nagpur',
      state: 'Maharashtra',
      pin: '440012',
      phone: '0712-1234567',
    },
  });

  // Create Admin User
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@jewellery.com' },
    update: {},
    create: {
      organizationId: org.id,
      branchId: branch.id,
      name: 'Admin',
      email: 'admin@jewellery.com',
      password: adminPassword,
      role: 'SUPER_ADMIN',
    },
  });

  // Create other users
  const users = [
    { name: 'Manager', email: 'manager@jewellery.com', role: 'BRANCH_MANAGER', password: 'manager123' },
    { name: 'Rahul Sales', email: 'sales@jewellery.com', role: 'SALESMAN', password: 'sales123' },
    { name: 'Cashier', email: 'cashier@jewellery.com', role: 'CASHIER', password: 'cash123' },
    { name: 'Rajesh Goldsmith', email: 'rajesh@jewellery.com', role: 'GOLDSMITH', password: 'gold123' },
    { name: 'Accountant', email: 'accountant@jewellery.com', role: 'ACCOUNTANT', password: 'acc123' },
  ];

  for (const u of users) {
    const pwd = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: {
        organizationId: org.id,
        branchId: branch.id,
        name: u.name,
        email: u.email,
        password: pwd,
        role: u.role,
      },
    });
  }

  // Create Employees
  await prisma.employee.upsert({
    where: { id: 'emp-rajesh' },
    update: {},
    create: {
      id: 'emp-rajesh',
      organizationId: org.id,
      branchId: branch.id,
      employeeCode: 'EMP001',
      name: 'Rajesh Goldsmith',
      mobile: '9876543210',
      role: 'GOLDSMITH',
      designation: 'Senior Goldsmith',
      salary: 35000,
    },
  });

  // Create Customers
  const customers = [
    { customerId: 'CUST-00001', name: 'Amit Sharma', mobile: '9876543211', city: 'Nagpur' },
    { customerId: 'CUST-00002', name: 'Priya Patel', mobile: '9876543212', city: 'Nagpur' },
    { customerId: 'CUST-00003', name: 'Vijay Kumar', mobile: '9876543213', city: 'Mumbai' },
  ];

  for (const c of customers) {
    await prisma.customer.upsert({
      where: { id: `cust-${c.customerId}` },
      update: {},
      create: { id: `cust-${c.customerId}`, organizationId: org.id, ...c },
    });
  }

  // Create HSN Codes (skip if exists)
  const hsnCodes = [
    { code: '7113', description: 'Articles of jewellery and parts thereof', gstRate: 3, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 },
    { code: '7108', description: 'Gold (including gold plated with platinum)', gstRate: 3, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 },
    { code: '7106', description: 'Silver (including silver plated with gold or platinum)', gstRate: 3, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 },
    { code: '7114', description: 'Articles of goldsmiths or silversmiths wares', gstRate: 3, cgstRate: 1.5, sgstRate: 1.5, igstRate: 3 },
  ];

  for (const h of hsnCodes) {
    const exists = await prisma.hsnCode.findFirst({ where: { code: h.code, organizationId: org.id } });
    if (!exists) {
      await prisma.hsnCode.create({ data: { ...h, organizationId: org.id } });
    }
  }

  // Create Gold Rates
  const rates = [
    { metalType: 'GOLD', purity: '24K', rate: 75000 },
    { metalType: 'GOLD', purity: '22K', rate: 70000 },
    { metalType: 'GOLD', purity: '20K', rate: 64000 },
    { metalType: 'GOLD', purity: '18K', rate: 56000 },
    { metalType: 'SILVER', purity: 'SILVER_999', rate: 85000 },
    { metalType: 'SILVER', purity: 'SILVER_925', rate: 78000 },
  ];

  for (const r of rates) {
    const exists = await prisma.rateMaster.findFirst({ where: { metalType: r.metalType, purity: r.purity, organizationId: org.id } });
    if (!exists) {
      await prisma.rateMaster.create({ data: { ...r, organizationId: org.id, effectiveDate: new Date() } });
    }
  }

  // Create Product Categories (skip duplicates)
  const categories = ['Rings', 'Earrings', 'Necklaces', 'Bangles', 'Chains', 'Bracelets', 'Pendants'];
  for (const cat of categories) {
    const exists = await prisma.productCategory.findFirst({ where: { name: cat, organizationId: org.id } });
    if (!exists) {
      await prisma.productCategory.create({ data: { organizationId: org.id, name: cat } });
    }
  }

  // Create Products
  const products = [
    { name: 'Gold Ring - Classic', designCode: 'RING-001', metalType: 'GOLD', purity: '22K', hsnCode: '7113' },
    { name: 'Gold Earring - Drop', designCode: 'EARRING-001', metalType: 'GOLD', purity: '22K', hsnCode: '7113' },
    { name: 'Gold Chain', designCode: 'CHAIN-001', metalType: 'GOLD', purity: '22K', hsnCode: '7113' },
    { name: 'Silver Bracelet', designCode: 'BRACELET-001', metalType: 'SILVER', purity: 'SILVER_925', hsnCode: '7113' },
  ];

  for (const p of products) {
    const exists = await prisma.product.findFirst({ where: { designCode: p.designCode, organizationId: org.id } });
    if (!exists) {
      await prisma.product.create({ data: { ...p, organizationId: org.id } });
    }
  }

  // Create Ornament Master (ledger master — male / female / unisex)
  const ornaments = [
    { name: 'Gents Ring', gender: 'MALE', category: 'Ring' },
    { name: 'Gents Chain', gender: 'MALE', category: 'Chain' },
    { name: 'Gents Bracelet (Kada)', gender: 'MALE', category: 'Bracelet' },
    { name: 'Ladies Ring', gender: 'FEMALE', category: 'Ring' },
    { name: 'Ladies Chain', gender: 'FEMALE', category: 'Chain' },
    { name: 'Bangle Pair', gender: 'FEMALE', category: 'Bangle' },
    { name: 'Necklace', gender: 'FEMALE', category: 'Necklace' },
    { name: 'Ear Ring', gender: 'FEMALE', category: 'Ear Ring' },
    { name: 'Mangalsutra', gender: 'FEMALE', category: 'Mangalsutra' },
    { name: 'Pendant', gender: 'UNISEX', category: 'Pendant' },
    { name: 'Coin', gender: 'UNISEX', category: 'Coin' },
  ];
  for (const o of ornaments) {
    const exists = await prisma.ornamentType.findFirst({ where: { organizationId: org.id, name: o.name } });
    if (!exists) await prisma.ornamentType.create({ data: { ...o, organizationId: org.id } });
  }

  // Create Shop Settings
  await prisma.shopSettings.upsert({
    where: { organizationId: org.id },
    update: {},
    create: {
      organizationId: org.id,
      shopName: 'Shri Jewellers',
      shopAddress: '123, Main Road, Sitabuldi',
      shopCity: 'Nagpur',
      shopState: 'Maharashtra',
      shopPin: '440012',
      shopPhone: '0712-1234567',
      shopGstin: '27ABCDE1234F1Z5',
      invoicePrefix: 'GST',
      nextBillNumber: 1,
      defaultGstRate: 3,
      defaultCgstRate: 1.5,
      defaultSgstRate: 1.5,
    },
  });

  // Create Sample Jewellery Items
  const jewelleryItems = [
    { barcode: 'G00000001', sku: 'RG-22K-001', designCode: 'RING-001', metalType: 'GOLD', purity: '22K', grossWeight: 12.5, netWeight: 10.2, purchaseRate: 68000, currentRate: 70000, makingChargeType: 'PERCENTAGE', makingChargeValue: 10, hsnCode: '7113' },
    { barcode: 'G00000002', sku: 'RG-22K-002', designCode: 'RING-001', metalType: 'GOLD', purity: '22K', grossWeight: 15.3, netWeight: 12.8, purchaseRate: 68000, currentRate: 70000, makingChargeType: 'PERCENTAGE', makingChargeValue: 10, hsnCode: '7113' },
    { barcode: 'G00000003', sku: 'EG-22K-001', designCode: 'EARRING-001', metalType: 'GOLD', purity: '22K', grossWeight: 8.2, netWeight: 6.5, purchaseRate: 68000, currentRate: 70000, makingChargeType: 'FIXED_AMOUNT', makingChargeValue: 3500, hsnCode: '7113' },
    { barcode: 'G00000004', sku: 'SB-925-001', designCode: 'BRACELET-001', metalType: 'SILVER', purity: 'SILVER_925', grossWeight: 35.0, netWeight: 32.5, purchaseRate: 75000, currentRate: 78000, makingChargeType: 'PER_GRAM', makingChargeValue: 50, hsnCode: '7113' },
  ];

  for (const item of jewelleryItems) {
    const product = await prisma.product.findFirst({ where: { organizationId: org.id, designCode: item.designCode } });
    await prisma.jewelleryItem.upsert({
      where: { barcode: item.barcode },
      update: { currentRate: item.currentRate, status: 'IN_STOCK' },
      create: { ...item, organizationId: org.id, branchId: branch.id, productId: product?.id || null, status: 'IN_STOCK' },
    });
  }

  // Create roles with their default permission matrix.
  const roles = Object.keys(rolePerms);
  for (const roleName of roles) {
    await prisma.role.upsert({
      where: { name: roleName },
      update: {},
      create: { name: roleName, description: `${roleName} role`, isSystem: true },
    });
  }
  // Upsert permissions and wire them to the roles (read/write access matrix).
  for (const roleName of roles) {
    const role = await prisma.role.findUnique({ where: { name: roleName } });
    if (!role) continue;
    for (const permName of rolePerms[roleName]) {
      const perm = await prisma.permission.upsert({
        where: { name: permName },
        update: {},
        create: { name: permName, description: permName.replace(/_/g, ' '), module: permName.split('_')[0] },
      });
      const link = await prisma.rolePermission.findUnique({
        where: { roleId_permissionId: { roleId: role.id, permissionId: perm.id } },
      });
      if (!link) {
        await prisma.rolePermission.create({ data: { roleId: role.id, permissionId: perm.id } });
      }
    }
  }


  // Seed default ledger accounts
  const cashAccount = await prisma.ledgerAccount.upsert({
    where: { id: 'cash-default' },
    update: {},
    create: {
      id: 'cash-default',
      organizationId: org.id,
      branchId: branch.id,
      name: 'Cash Counter',
      type: 'CASH',
      openingBalance: 0,
      currentBalance: 0,
      isPrimary: true,
      notes: 'Default cash account',
    },
  });

  const bankAccount = await prisma.ledgerAccount.upsert({
    where: { id: 'bank-default' },
    update: {},
    create: {
      id: 'bank-default',
      organizationId: org.id,
      branchId: branch.id,
      name: 'Bank Account',
      type: 'BANK',
      openingBalance: 0,
      currentBalance: 0,
      bankName: 'HDFC Bank',
      notes: 'Default bank account',
    },
  });

  // Metal / material ledgers — stock is tracked in grams for one metal + purity
  const metalLedgers = [
    { id: 'metal-gold-22k', name: 'GOLD 22K', metalType: 'GOLD', purity: '22K' },
    { id: 'metal-silver-925', name: 'SILVER 925', metalType: 'SILVER', purity: 'SILVER_925' },
  ];
  for (const metal of metalLedgers) {
    await prisma.ledgerAccount.upsert({
      where: { id: metal.id },
      update: {},
      create: {
        id: metal.id,
        organizationId: org.id,
        branchId: branch.id,
        name: metal.name,
        type: 'METAL',
        metalType: metal.metalType,
        purity: metal.purity,
        openingGrams: 0,
        grams: 0,
        openingBalance: 0,
        currentBalance: 0,
        notes: 'Metal ledger — stock tracked in grams',
      },
    });
  }

  console.log(`✓ Ledger accounts: ${cashAccount.name}, ${bankAccount.name}, ${metalLedgers.map((m) => m.name).join(', ')}`);

  console.log('Seed completed successfully!');
  console.log('Admin login: admin@jewellery.com / admin123');
  console.log('Cashier login: cashier@jewellery.com / cash123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });