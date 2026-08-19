import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

const AUTO_LOCKED = new Set(['SALE_PAYMENT', 'PURCHASE', 'EXPENSE', 'INCOME', 'OPENING']);

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  // ====== ACCOUNTS ======

  async listAccounts(organizationId: string, includeInactive = false) {
    const where: any = { organizationId };
    if (!includeInactive) where.isActive = true;
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
    const opening = Number(data.openingBalance || 0);
    const created = await this.prisma.ledgerAccount.create({
      data: {
        organizationId,
        branchId,
        name: data.name,
        type: data.type || 'CASH',
        accountNumber: data.accountNumber,
        bankName: data.bankName,
        ifscCode: data.ifscCode,
        openingBalance: opening,
        currentBalance: opening,
        isPrimary: !!data.isPrimary,
        notes: data.notes,
      },
    });
    if (opening !== 0) {
      await this.prisma.ledgerEntry.create({
        data: {
          organizationId,
          branchId,
          accountId: created.id,
          type: opening >= 0 ? 'CREDIT' : 'DEBIT',
          amount: Math.abs(opening),
          description: 'Opening balance',
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
    await this.prisma.ledgerAccount.update({
      where: { id },
      data: {
        name: data.name,
        type: data.type,
        accountNumber: data.accountNumber,
        bankName: data.bankName,
        ifscCode: data.ifscCode,
        isPrimary: data.isPrimary !== undefined ? !!data.isPrimary : existing.isPrimary,
        isActive: data.isActive !== undefined ? !!data.isActive : existing.isActive,
        notes: data.notes,
      },
    });
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
    if (!data?.amount || Number(data.amount) <= 0) throw new BadRequestException('Amount must be positive');
    if (!['CREDIT', 'DEBIT'].includes(data.type)) throw new BadRequestException('Type must be CREDIT or DEBIT');

    const account = await this.prisma.ledgerAccount.findFirst({
      where: { id: data.accountId, organizationId, isActive: true },
    });
    if (!account) throw new NotFoundException('Account not found');

    const amount = Number(data.amount);
    const date = data.date ? new Date(data.date) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.ledgerEntry.create({
        data: {
          organizationId,
          branchId,
          accountId: data.accountId,
          type: data.type,
          amount,
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
      await tx.ledgerAccount.update({
        where: { id: data.accountId },
        data: { currentBalance: { increment: delta } },
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
      await tx.ledgerAccount.update({
        where: { id: entry.accountId },
        data: { currentBalance: { increment: delta } },
      });
      await tx.ledgerEntry.delete({ where: { id } });
      return { ok: true };
    });
  }

  // ====== EXPENSES ======

  async listExpenses(organizationId: string, params: any = {}) {
    const { category, startDate, endDate, page = 1, limit = 50 } = params;
    const where: any = { organizationId };
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
    if (expense.accountId) {
      // auto-reverse ledger entry
      const entry = await this.prisma.ledgerEntry.findFirst({
        where: { linkedTo: 'EXPENSE', linkedId: id },
      });
      if (entry) {
        return this.prisma.$transaction(async (tx) => {
          await tx.ledgerAccount.update({
            where: { id: expense.accountId },
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
    const { source, startDate, endDate, page = 1, limit = 50 } = params;
    const where: any = { organizationId };
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
    if (income.accountId) {
      const entry = await this.prisma.ledgerEntry.findFirst({ where: { linkedTo: 'INCOME', linkedId: id } });
      if (entry) {
        return this.prisma.$transaction(async (tx) => {
          await tx.ledgerAccount.update({ where: { id: income.accountId }, data: { currentBalance: { decrement: income.amount } } });
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
    // Recompute live balance from entries (authoritative)
    const [credits, debits] = await Promise.all([
      this.prisma.ledgerEntry.aggregate({
        where: { accountId: account.id, type: 'CREDIT' },
        _sum: { amount: true },
      }),
      this.prisma.ledgerEntry.aggregate({
        where: { accountId: account.id, type: 'DEBIT' },
        _sum: { amount: true },
      }),
    ]);
    const sumCr = credits._sum.amount?.toNumber() || 0;
    const sumDr = debits._sum.amount?.toNumber() || 0;
    const currentBalance = account.openingBalance + sumCr - sumDr;
    if (currentBalance !== account.currentBalance) {
      await this.prisma.ledgerAccount.update({
        where: { id: account.id },
        data: { currentBalance },
      });
    }
    return { ...account, currentBalance, totals: { credits: sumCr, debits: sumDr } };
  }
}
