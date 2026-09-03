import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { assertMoneyAccounts } from '../../common/payment-accounts';

// Entries created automatically by a bill / purchase / URD exchange — they can
// only be changed from the document that produced them, never by hand.
const AUTO_LOCKED = new Set([
  'SALE', 'SALE_PAYMENT', 'SALE_TAX', 'PURCHASE', 'PURCHASE_PAYMENT',
  'URD', 'URD_OUT', 'URD_PAYMENT', 'URD_SALE',
  'EXPENSE', 'INCOME', 'OPENING',
]);

/** Gram balances are stored with 3 decimals (matching ShopSettings.weightPrecision). */
function round3(n: number): number {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  // ====== ACCOUNTS ======

  /**
   * List accounts. `type` filters by account type — pass 'METAL' to list only
   * material / metal (bullion) ledgers, or 'CASH_BANK' for money accounts.
   */
  async listAccounts(organizationId: string, includeInactive = false, type?: string) {
    const where: any = { organizationId };
    if (!includeInactive) where.isActive = true;
    if (type === 'CASH_BANK') where.type = { not: 'METAL' };
    else if (type) where.type = type;
    const accounts = await this.prisma.ledgerAccount.findMany({
      where,
      orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
    });
    return Promise.all(accounts.map((a) => this.hydrateAccount(a.id)));
  }

  async getAccount(id: string, organizationId: string) {
    return this.hydrateAccount(id, organizationId);
  }

  async createAccount(organizationId: string, branchId: string | undefined, data: any) {
    if (!data?.name) throw new BadRequestException('Account name required');
    const exists = await this.prisma.ledgerAccount.findFirst({
      where: { organizationId, name: data.name, isActive: true },
    });
    if (exists) throw new BadRequestException('Account already exists');
    if (data.isPrimary) {
      await this.prisma.ledgerAccount.updateMany({
        where: { organizationId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const type = (data.type || 'CASH').toUpperCase();
    const isMetal = type === 'METAL';
    const opening = Number(data.openingBalance || 0);
    const openingGrams = isMetal ? Number(data.openingGrams || data.grams || 0) : 0;
    const metalType = isMetal ? (data.metalType || '').toUpperCase() : null;
    const purity = isMetal ? String(data.purity || '') : '';

    if (isMetal && !metalType) throw new BadRequestException('Metal type is required for a metal ledger');
    if (isMetal && openingGrams < 0) throw new BadRequestException('Opening stock cannot be negative');

    const created = await this.prisma.ledgerAccount.create({
      data: {
        organizationId,
        branchId,
        name: data.name,
        type,
        accountNumber: data.accountNumber,
        bankName: data.bankName,
        ifscCode: data.ifscCode,
        metalType,
        purity,
        openingGrams,
        grams: openingGrams,
        openingBalance: opening,
        currentBalance: opening,
        isPrimary: !!data.isPrimary,
        notes: data.notes,
      },
    });

    // Opening entry — carries rupees (money accounts) and/or grams (metal ledger)
    if (opening !== 0 || openingGrams !== 0) {
      await this.prisma.ledgerEntry.create({
        data: {
          organizationId,
          branchId,
          accountId: created.id,
          type: opening >= 0 || openingGrams >= 0 ? 'CREDIT' : 'DEBIT',
          amount: Math.abs(opening),
          grams: Math.abs(openingGrams),
          metalType,
          purity,
          rate: openingGrams > 0 && opening !== 0 ? Math.round((Math.abs(opening) / openingGrams) * 100) / 100 : null,
          description: isMetal
            ? `Opening stock — ${openingGrams} g ${metalType} ${purity}`
            : 'Opening balance',
          linkedTo: 'OPENING',
        },
      });
    }
    return this.hydrateAccount(created.id);
  }

  async updateAccount(id: string, organizationId: string, data: any) {
    const existing = await this.prisma.ledgerAccount.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Account not found');
    if (data.isPrimary && !existing.isPrimary) {
      await this.prisma.ledgerAccount.updateMany({
        where: { organizationId, isPrimary: true, NOT: { id } },
        data: { isPrimary: false },
      });
    }
    const nextType = (data.type || existing.type || 'CASH').toUpperCase();
    const isMetal = nextType === 'METAL';
    const nextGrams = isMetal ? Number(data.openingGrams ?? existing.openingGrams ?? 0) : 0;
    const nextOpening = Number(data.openingBalance ?? existing.openingBalance ?? 0);

    await this.prisma.ledgerAccount.update({
      where: { id },
      data: {
        name: data.name ?? existing.name,
        type: data.type ?? existing.type,
        accountNumber: data.accountNumber ?? existing.accountNumber,
        bankName: data.bankName ?? existing.bankName,
        ifscCode: data.ifscCode ?? existing.ifscCode,
        metalType: isMetal ? (data.metalType ?? existing.metalType ?? null) : null,
        purity: isMetal ? String(data.purity ?? existing.purity ?? '') : '',
        openingGrams: nextGrams,
        openingBalance: nextOpening,
        isPrimary: data.isPrimary !== undefined ? !!data.isPrimary : existing.isPrimary,
        isActive: data.isActive !== undefined ? !!data.isActive : existing.isActive,
        notes: data.notes ?? existing.notes,
      },
    });

    // Keep the OPENING entry in sync so the live balance follows the opening value
    const openingChanged =
      Math.abs(nextGrams - Number(existing.openingGrams || 0)) > 1e-9 ||
      Math.abs(nextOpening - Number(existing.openingBalance || 0)) > 1e-9;
    if (openingChanged) {
      const sign = nextOpening >= 0 || nextGrams >= 0 ? 'CREDIT' : 'DEBIT';
      const payload = {
        type: sign,
        amount: Math.abs(nextOpening),
        grams: Math.abs(nextGrams),
        metalType: isMetal ? (data.metalType ?? existing.metalType ?? null) : null,
        purity: isMetal ? String(data.purity ?? existing.purity ?? '') : null,
        rate:
          nextGrams !== 0 && nextOpening !== 0
            ? Math.round((Math.abs(nextOpening) / Math.abs(nextGrams)) * 100) / 100
            : null,
        description: isMetal
          ? `Opening stock — ${nextGrams} g ${(data.metalType ?? existing.metalType) || ''} ${(data.purity ?? existing.purity) || ''}`
          : 'Opening balance',
      };
      const openingEntry = await this.prisma.ledgerEntry.findFirst({
        where: { accountId: id, linkedTo: 'OPENING' },
      });
      if (openingEntry) {
        if (Math.abs(nextOpening) === 0 && nextGrams === 0) {
          await this.prisma.ledgerEntry.delete({ where: { id: openingEntry.id } });
        } else {
          await this.prisma.ledgerEntry.update({ where: { id: openingEntry.id }, data: payload });
        }
      } else if (Math.abs(nextOpening) !== 0 || nextGrams !== 0) {
        await this.prisma.ledgerEntry.create({
          data: {
            organizationId,
            branchId: existing.branchId,
            accountId: id,
            linkedTo: 'OPENING',
            ...payload,
          },
        });
      }
    }

    return this.hydrateAccount(id);
  }

  async deleteAccount(id: string, organizationId: string) {
    const entries = await this.prisma.ledgerEntry.count({ where: { accountId: id } });
    if (entries > 0) throw new BadRequestException('Cannot delete account with transaction history');
    const expenseCount = await this.prisma.expense.count({ where: { accountId: id } });
    const incomeCount = await this.prisma.income.count({ where: { accountId: id } });
    if (expenseCount > 0 || incomeCount > 0) throw new BadRequestException('Account has linked expenses/income');
    await this.prisma.ledgerAccount.delete({ where: { id } });
    return { ok: true };
  }

  // ====== ENTRIES (Credit/Debit) ======

  async listEntries(organizationId: string, params: any = {}) {
    const { accountId, type, startDate, endDate, page = 1, limit = 50 } = params;
    const where: any = { organizationId };
    if (accountId) where.accountId = accountId;
    if (type) where.type = type;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate + 'T23:59:59');
    }
    const [items, total] = await Promise.all([
      this.prisma.ledgerEntry.findMany({
        where,
        include: { account: { select: { name: true, type: true } } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        take: +limit,
        skip: (+page - 1) * +limit,
      }),
      this.prisma.ledgerEntry.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit };
  }

  async createEntry(
    organizationId: string,
    branchId: string | undefined,
    data: any,
    user: { id: string; name?: string },
  ) {
    if (!data?.accountId) throw new BadRequestException('Account required');
    if (!['CREDIT', 'DEBIT'].includes(data.type)) throw new BadRequestException('Type must be CREDIT or DEBIT');

    const account = await this.prisma.ledgerAccount.findFirst({
      where: { id: data.accountId, organizationId, isActive: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    const amount = Number(data.amount);
    const grams = Math.abs(Number(data.grams || 0));
    // A metal (material) ledger can move weight without moving money
    if (account.type === 'METAL') {
      if (!amount && !grams) throw new BadRequestException('Enter an amount or a weight in grams');
    } else if (!amount || amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    const date = data.date ? new Date(data.date) : new Date();
    // Metal / material ledgers additionally move grams in or out
    const metalType = data.metalType || account.metalType || null;
    const purity = data.purity || account.purity || null;
    const rate = data.rate ? Number(data.rate) : grams > 0 ? Math.round((amount / grams) * 100) / 100 : null;

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.ledgerEntry.create({
        data: {
          organizationId,
          branchId,
          accountId: data.accountId,
          type: data.type,
          amount,
          grams,
          metalType,
          purity,
          rate,
          date,
          description: data.description,
          reference: data.reference,
          linkedTo: data.linkedTo || 'ADJUSTMENT',
          linkedId: data.linkedId,
          employeeId: user.id,
          employeeName: user.name,
        },
      });
      const delta = data.type === 'CREDIT' ? amount : -amount;
      const gramsDelta = data.type === 'CREDIT' ? grams : -grams;
      await tx.ledgerAccount.update({
        where: { id: data.accountId },
        data: {
          currentBalance: { increment: delta },
          grams: { increment: gramsDelta },
        },
      });
      return entry;
    });
  }

  async deleteEntry(id: string, organizationId: string) {
    const entry = await this.prisma.ledgerEntry.findFirst({ where: { id, organizationId } });
    if (!entry) throw new NotFoundException('Entry not found');
    if (entry.linkedTo && AUTO_LOCKED.has(entry.linkedTo)) {
      throw new BadRequestException(`Cannot delete auto-posted entry from ${entry.linkedTo}`);
    }
    return this.prisma.$transaction(async (tx) => {
      const delta = entry.type === 'CREDIT' ? -entry.amount : entry.amount;
      const gramsDelta = entry.type === 'CREDIT' ? -Number(entry.grams || 0) : Number(entry.grams || 0);
      await tx.ledgerAccount.update({
        where: { id: entry.accountId },
        data: {
          currentBalance: { increment: delta },
          grams: { increment: gramsDelta },
        },
      });
      await tx.ledgerEntry.delete({ where: { id } });
      return { ok: true };
    });
  }

  // ====== EXPENSES ======

  async listExpenses(organizationId: string, params: any = {}) {
    const { category, branchId, startDate, endDate, page = 1, limit = 50 } = params;
    const where: any = { organizationId };
    if (branchId) where.branchId = branchId;
    if (category) where.category = category;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate + 'T23:59:59');
    }
    const [items, total] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: { date: 'desc' },
        take: +limit,
        skip: (+page - 1) * +limit,
      }),
      this.prisma.expense.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit };
  }

  async createExpense(organizationId: string, branchId: string | undefined, data: any, user: any) {
    if (!data?.amount || Number(data.amount) <= 0) throw new BadRequestException('Amount required');
    // Expenses are paid out of a cash / bank ledger — never a metal (stock) account, which is
    // measured in grams. Checked before the transaction so nothing is half-written.
    await assertMoneyAccounts(this.prisma, organizationId, [data.accountId]);
    return this.prisma.$transaction(async (tx) => {
      const expense = await tx.expense.create({
        data: {
          organizationId,
          branchId,
          accountId: data.accountId || null,
          category: data.category || 'Misc',
          amount: Number(data.amount),
          date: data.date ? new Date(data.date) : new Date(),
          vendor: data.vendor,
          description: data.description,
          reference: data.reference,
          billNumber: data.billNumber,
          paidFromMode: data.paidFromMode || 'CASH',
          employeeId: user.id,
          employeeName: user.name,
        },
      });
      // Auto ledger entry: money OUT (DEBIT) from chosen account
      if (data.accountId) {
        const acc = await tx.ledgerAccount.findUnique({ where: { id: data.accountId } });
        if (acc) {
          await tx.ledgerEntry.create({
            data: {
              organizationId,
              branchId,
              accountId: data.accountId,
              type: 'DEBIT',
              amount: Number(data.amount),
              date: data.date ? new Date(data.date) : new Date(),
              description: data.description || `Expense: ${data.category}${data.vendor ? ' - ' + data.vendor : ''}`,
              linkedTo: 'EXPENSE',
              linkedId: expense.id,
              employeeId: user.id,
              employeeName: user.name,
            },
          });
          await tx.ledgerAccount.update({
            where: { id: data.accountId },
            data: { currentBalance: { decrement: Number(data.amount) } },
          });
        }
      }
      return expense;
    });
  }

  async deleteExpense(id: string, organizationId: string) {
    const expense = await this.prisma.expense.findFirst({ where: { id, organizationId } });
    if (!expense) throw new NotFoundException('Expense not found');
    const expenseAccountId = expense.accountId;
    if (expenseAccountId) {
      // auto-reverse ledger entry
      const entry = await this.prisma.ledgerEntry.findFirst({
        where: { linkedTo: 'EXPENSE', linkedId: id },
      });
      if (entry) {
        return this.prisma.$transaction(async (tx) => {
          await tx.ledgerAccount.update({
            where: { id: expenseAccountId },
            data: { currentBalance: { increment: expense.amount } },
          });
          await tx.ledgerEntry.delete({ where: { id: entry.id } });
          await tx.expense.delete({ where: { id } });
          return { ok: true };
        });
      }
    }
    await this.prisma.expense.delete({ where: { id } });
    return { ok: true };
  }

  // ====== INCOME ======

  async listIncome(organizationId: string, params: any = {}) {
    const { source, branchId, startDate, endDate, page = 1, limit = 50 } = params;
    const where: any = { organizationId };
    if (branchId) where.branchId = branchId;
    if (source) where.source = source;
    if (startDate || endDate) {
      where.date = {};
      if (startDate) where.date.gte = new Date(startDate);
      if (endDate) where.date.lte = new Date(endDate + 'T23:59:59');
    }
    const [items, total] = await Promise.all([
      this.prisma.income.findMany({
        where,
        orderBy: { date: 'desc' },
        take: +limit,
        skip: (+page - 1) * +limit,
      }),
      this.prisma.income.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit };
  }

  async createIncome(organizationId: string, branchId: string | undefined, data: any, user: any) {
    if (!data?.amount || Number(data.amount) <= 0) throw new BadRequestException('Amount required');
    // Income is received into a cash / bank ledger — never a metal (stock) account, which is
    // measured in grams. Checked before the transaction so nothing is half-written.
    await assertMoneyAccounts(this.prisma, organizationId, [data.accountId]);
    return this.prisma.$transaction(async (tx) => {
      const income = await tx.income.create({
        data: {
          organizationId,
          branchId,
          accountId: data.accountId || null,
          source: data.source || 'Misc Income',
          amount: Number(data.amount),
          date: data.date ? new Date(data.date) : new Date(),
          description: data.description,
          reference: data.reference,
          receivedInMode: data.receivedInMode || 'CASH',
          employeeId: user.id,
          employeeName: user.name,
        },
      });
      if (data.accountId) {
        const acc = await tx.ledgerAccount.findUnique({ where: { id: data.accountId } });
        if (acc) {
          await tx.ledgerEntry.create({
            data: {
              organizationId,
              branchId,
              accountId: data.accountId,
              type: 'CREDIT',
              amount: Number(data.amount),
              date: data.date ? new Date(data.date) : new Date(),
              description: data.description || `Income: ${data.source}`,
              linkedTo: 'INCOME',
              linkedId: income.id,
              employeeId: user.id,
              employeeName: user.name,
            },
          });
          await tx.ledgerAccount.update({
            where: { id: data.accountId },
            data: { currentBalance: { increment: Number(data.amount) } },
          });
        }
      }
      return income;
    });
  }

  async deleteIncome(id: string, organizationId: string) {
    const income = await this.prisma.income.findFirst({ where: { id, organizationId } });
    if (!income) throw new NotFoundException('Income not found');
    const incomeAccountId = income.accountId;
    if (incomeAccountId) {
      const entry = await this.prisma.ledgerEntry.findFirst({ where: { linkedTo: 'INCOME', linkedId: id } });
      if (entry) {
        return this.prisma.$transaction(async (tx) => {
          await tx.ledgerAccount.update({ where: { id: incomeAccountId }, data: { currentBalance: { decrement: income.amount } } });
          await tx.ledgerEntry.delete({ where: { id: entry.id } });
          await tx.income.delete({ where: { id } });
          return { ok: true };
        });
      }
    }
    await this.prisma.income.delete({ where: { id } });
    return { ok: true };
  }

  // ====== helpers ======

  private async hydrateAccount(idOrAccount: string | any, organizationId?: string) {
    const account = typeof idOrAccount === 'string'
      ? await this.prisma.ledgerAccount.findFirst({ where: { id: idOrAccount, organizationId } })
      : idOrAccount;
    if (!account) throw new NotFoundException('Account not found');
    // Recompute live balance from entries (authoritative).
    // The OPENING entry only records the opening figure — it is already part of
    // openingBalance / openingGrams, so counting it again would double it.
    const notOpening = { linkedTo: { not: 'OPENING' } };
    const [credits, debits] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: { accountId: account.id, type: 'CREDIT', ...notOpening },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { accountId: account.id, type: 'DEBIT', ...notOpening },
        _sum: { amount: true },
      }),
    ]);
    // SQLite returns plain numbers here (not Prisma.Decimal), so use Number()
    const sumCr = Number(credits._sum.amount ?? 0) || 0;
    const sumDr = Number(debits._sum.amount ?? 0) || 0;
    const currentBalance = round3(account.openingBalance + sumCr - sumDr);

    // Metal / material ledgers: live stock in grams from the same entries
    const [gramsCr, gramsDr] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: { accountId: account.id, type: 'CREDIT', ...notOpening },
        _sum: { grams: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { accountId: account.id, type: 'DEBIT', ...notOpening },
        _sum: { grams: true },
      }),
    ]);
    const gramsIn = round3(Number(gramsCr._sum.grams ?? 0) || 0);
    const gramsOut = round3(Number(gramsDr._sum.grams ?? 0) || 0);
    const currentGrams = round3(Number(account.openingGrams || 0) + gramsIn - gramsOut);

    const patch: any = {};
    if (currentBalance !== account.currentBalance) patch.currentBalance = currentBalance;
    if (currentGrams !== account.grams) patch.grams = currentGrams;
    if (Object.keys(patch).length) {
      await this.prisma.ledgerAccount.update({ where: { id: account.id }, data: patch });
    }
    return {
      ...account,
      currentBalance,
      grams: currentGrams,
      purity: account.purity,
      totals: { credits: sumCr, debits: sumDr, gramsIn, gramsOut },
    };
  }

  // ====== METAL / MATERIAL LEDGER MOVEMENTS ======
  //
  // A metal ledger (type = METAL) keeps its stock in grams. Every movement is
  // posted as a normal ledger entry that additionally carries the weight:
  //   CREDIT = metal IN  (metal purchase, ornament melted back into stock…)
  //   DEBIT  = metal OUT (ornament purchase / manufacture consuming metal…)

  /**
   * Post a gram movement on a metal ledger. `tx` may be a Prisma transaction
   * client so purchase flows stay atomic; falls back to the plain client.
   */
  async postMetalMovement(
    params: {
      organizationId: string;
      branchId?: string | null;
      accountId: string;
      type: 'CREDIT' | 'DEBIT';
      grams: number;
      amount?: number;
      rate?: number;
      metalType?: string | null;
      purity?: string | null;
      date?: Date | string;
      description?: string;
      reference?: string;
      linkedTo?: string;
      linkedId?: string;
      employeeId?: string;
      employeeName?: string;
    },
    tx: any = this.prisma,
  ) {
    const grams = Math.abs(Number(params.grams || 0));
    if (!params.accountId) throw new BadRequestException('Metal ledger account is required');
    if (!grams) return null;

    const account = await tx.ledgerAccount.findFirst({
      where: { id: params.accountId, organizationId: params.organizationId },
    });
    if (!account) throw new NotFoundException('Metal ledger account not found');

    const metalType = params.metalType || account.metalType || null;
    const purity = params.purity || account.purity || null;
    const rate = params.rate !== undefined && params.rate !== null
      ? Number(params.rate)
      : params.amount !== undefined && params.amount !== null && grams
        ? Math.round((Math.abs(Number(params.amount)) / grams) * 100) / 100
        : null;
    const amount = params.amount !== undefined && params.amount !== null
      ? Math.abs(Number(params.amount))
      : rate && grams
        ? Math.round(rate * grams * 100) / 100
        : 0;

    const entry = await tx.ledgerEntry.create({
      data: {
        organizationId: params.organizationId,
        branchId: params.branchId ?? account.branchId ?? null,
        accountId: account.id,
        type: params.type,
        amount,
        grams,
        metalType,
        purity,
        rate,
        date: params.date ? new Date(params.date) : new Date(),
        description: params.description || `Metal ${params.type === 'CREDIT' ? 'in' : 'out'} — ${grams} g ${metalType || ''} ${purity || ''}`.trim(),
        reference: params.reference,
        linkedTo: params.linkedTo || 'METAL_LEDGER',
        linkedId: params.linkedId,
        employeeId: params.employeeId,
        employeeName: params.employeeName,
      },
    });

    const amountDelta = params.type === 'CREDIT' ? amount : -amount;
    const gramsDelta = params.type === 'CREDIT' ? grams : -grams;
    await tx.ledgerAccount.update({
      where: { id: account.id },
      data: amount ? { currentBalance: { increment: amountDelta }, grams: { increment: gramsDelta } } : { grams: { increment: gramsDelta } },
    });

    return entry;
  }

  /**
   * Find the metal ledger account matching a metal + purity, or create it.
   * Used by purchases so metal lands in "its own" ledger automatically.
   */
  async resolveMetalAccount(
    params: {
      organizationId: string;
      branchId?: string | null;
      accountId?: string | null;
      metalType?: string | null;
      purity?: string | null;
    },
    tx: any = this.prisma,
  ) {
    const { organizationId, branchId } = params;
    const metalType = (params.metalType || '').toUpperCase() || null;
    const purity = params.purity || null;

    if (params.accountId) {
      const account = await tx.ledgerAccount.findFirst({
        where: { id: params.accountId, organizationId },
      });
      if (!account) throw new NotFoundException('Selected metal ledger account not found');
      return account;
    }

    if (metalType) {
      const existing = await tx.ledgerAccount.findFirst({
        where: { organizationId, type: 'METAL', metalType, purity: purity || '' },
      });
      if (existing) return existing;
      const byName = await tx.ledgerAccount.findFirst({
        where: { organizationId, type: 'METAL', name: `${metalType} ${purity || ''}`.trim() },
      });
      if (byName) return byName;
    }

    const name = `${metalType || 'METAL'} ${purity || ''}`.trim();
    return tx.ledgerAccount.create({
      data: {
        organizationId,
        branchId: branchId ?? null,
        name,
        type: 'METAL',
        metalType,
        purity: purity || '',
        openingGrams: 0,
        grams: 0,
        openingBalance: 0,
        currentBalance: 0,
        notes: 'Auto-created metal ledger (from purchase)',
      },
    });
  }

  /**
   * Reverse every metal movement posted for a document (e.g. an edited
   * purchase) and delete the entries, so the movement can be re-posted.
   */
  async reverseMetalMovements(organizationId: string, linkedTo: string, linkedId: string, tx: any = this.prisma) {
    const entries = await tx.ledgerEntry.findMany({
      where: { organizationId, linkedTo, linkedId, grams: { gt: 0 } },
    });
    for (const entry of entries) {
      const amountDelta = entry.type === 'CREDIT' ? -entry.amount : entry.amount;
      const gramsDelta = entry.type === 'CREDIT' ? -entry.grams : entry.grams;
      await tx.ledgerAccount.update({
        where: { id: entry.accountId },
        data: { currentBalance: { increment: amountDelta }, grams: { increment: gramsDelta } },
      });
      await tx.ledgerEntry.delete({ where: { id: entry.id } });
    }
    return entries.length;
  }
}
