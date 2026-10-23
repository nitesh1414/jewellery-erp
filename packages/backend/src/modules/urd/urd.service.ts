import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

/**
 * URD EXCHANGE — old gold / silver taken from a customer.
 *
 * The full data flow of one exchange:
 *
 *   incoming  → the old ornament is weighed, valued and CREDITED to the
 *               material (metal) ledger of that metal + purity
 *   customer  → the value is CREDITED to the customer's ledger, so it can be
 *               adjusted against a bill or paid out
 *   outgoing  → the old gold is either adjusted against a sale (billing),
 *               SOLD / melted out (money in, metal out) or
 *               SETTLED by paying the customer (money out, credit cleared)
 */

const round2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
const round3 = (n: any) => Math.round((Number(n) || 0) * 1000) / 1000;
const g3 = (n: any) => String(Math.round((Number(n) || 0) * 1000) / 1000);

/** Net Weight = Gross − Stone (− other). */
const netOf = (gross: any, stone: any, other: any) =>
  round3(Math.max(0, (Number(gross) || 0) - (Number(stone) || 0) - (Number(other) || 0)));

@Injectable()
export class UrdService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
  ) { }

  private async load(id: string, orgId: string) {
    const txn = await this.prisma.urdTransaction.findFirst({ where: { id, organizationId: orgId } });
    if (!txn) throw new NotFoundException('URD transaction not found');
    return txn;
  }

  /** value = net × rate − deduction, less the melting loss % */
  private valuation(data: any) {
    const netWeight = Number(data.netWeight) > 0
      ? Number(data.netWeight)
      : netOf(data.grossWeight, data.stoneWeight, data.otherWeight);
    const rate = Number(data.rate) || 0;
    const value = round2(netWeight * rate);
    const deduction = Number(data.deduction) || 0;
    const meltingLoss = Number(data.meltingLoss) || 0;
    const finalValue = round2(Math.max(0, value - deduction) * (1 - meltingLoss / 100));
    return { netWeight, rate, value, deduction, meltingLoss, finalValue };
  }

  async findAll(orgId: string, q: any) {
    const { page = 1, limit = 20, branchId, search, status } = q || {};
    const where: any = { organizationId: orgId };
    if (branchId) where.branchId = branchId;
    if (status && status !== 'ALL') where.status = String(status).toUpperCase();
    if (search) {
      where.OR = [
        { urdNumber: { contains: search, mode: 'insensitive' } },
        { customerName: { contains: search, mode: 'insensitive' } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.urdTransaction.findMany({
        where,
        skip: (+page - 1) * +limit,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        include: { customer: { select: { id: true, name: true, mobile: true } } },
      }),
      this.prisma.urdTransaction.count({ where }),
    ]);
    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async getStats(orgId: string, branchId?: string) {
    const where: any = { organizationId: orgId };
    if (branchId) where.branchId = branchId;
    const rows = await this.prisma.urdTransaction.findMany({
      where,
      select: { status: true, netWeight: true, finalValue: true, settledAmount: true },
    });
    let grams = 0, value = 0, settled = 0, payable = 0, active = 0;
    for (const r of rows) {
      const isStock = r.status === 'ACTIVE' || r.status === 'ADJUSTED' || r.status === 'PROPOSED';
      if (r.status !== 'SOLD' && r.status !== 'CANCELLED') {
        grams += Number(r.netWeight) || 0;
        value += Number(r.finalValue) || 0;
      }
      settled += Number(r.settledAmount) || 0;
      if (r.status === 'ACTIVE') {
        active += 1;
        payable += Math.max(0, (Number(r.finalValue) || 0) - (Number(r.settledAmount) || 0));
      }
      void isStock;
    }
    return {
      total: rows.length,
      active,
      grams: round3(grams),
      value: round2(value),
      settled: round2(settled),
      payableToCustomers: round2(payable),
    };
  }

  async findById(id: string, orgId: string) {
    const txn: any = await this.prisma.urdTransaction.findFirst({
      where: { id, organizationId: orgId },
      include: { customer: { select: { id: true, name: true, mobile: true } } },
    });
    if (!txn) throw new NotFoundException('URD transaction not found');
    const movements = await this.prisma.ledgerEntry.findMany({
      where: { linkedId: id, linkedTo: { in: ['URD', 'URD_OUT', 'URD_PAYMENT', 'URD_SALE'] } },
      orderBy: { date: 'asc' },
      include: { account: { select: { id: true, name: true, type: true } } },
    });
    return { ...txn, movements };
  }

  /**
   * Old gold received: metal in (material ledger) + a credit for the customer.
   */
  async create(data: any, orgId: string, branchId: string, userId: string) {
    const count = await this.prisma.urdTransaction.count({ where: { organizationId: orgId } });
    const year = new Date().getFullYear();
    const urdNumber = `URD-${year}-${String(count + 1).padStart(5, '0')}`;
    const calc = this.valuation(data);
    const isProposed = String(data.status || '').toUpperCase() === 'PROPOSED';

    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.urdTransaction.create({
        data: {
          organizationId: orgId,
          branchId,
          urdNumber,
          customerId: data.customerId || null,
          customerName: data.customerName || 'Customer',
          metalType: data.metalType || 'GOLD',
          purity: data.purity || '22K',
          grossWeight: Number(data.grossWeight) || 0,
          stoneWeight: Number(data.stoneWeight) || 0,
          netWeight: calc.netWeight,
          rate: calc.rate,
          value: calc.value,
          deduction: calc.deduction,
          meltingLoss: calc.meltingLoss,
          finalValue: calc.finalValue,
          paymentMode: data.paymentMode || null,
          notes: data.notes || null,
          status: isProposed ? 'PROPOSED' : 'ACTIVE',
        },
      });

      // Proposed (on an estimate) touches nothing until it becomes a bill
      if (isProposed) return txn;

      // 1 — incoming old gold lands in the metal / material ledger
      if (calc.netWeight > 0) {
        try {
          const account = await this.ledger.resolveMetalAccount(
            { organizationId: orgId, branchId, accountId: data.metalLedgerAccountId || null, metalType: txn.metalType, purity: txn.purity },
            tx,
          );
          await this.ledger.postMetalMovement(
            {
              organizationId: orgId,
              branchId,
              accountId: account.id,
              type: 'CREDIT',
              grams: calc.netWeight,
              rate: calc.rate,
              metalType: txn.metalType,
              purity: txn.purity,
              date: data.date ? new Date(data.date) : new Date(),
              description: `URD / old gold received — ${g3(calc.netWeight)} g ${txn.metalType} ${txn.purity} from ${txn.customerName} (${urdNumber})`,
              reference: urdNumber,
              linkedTo: 'URD',
              linkedId: txn.id,
              employeeId: userId,
            },
            tx,
          );
        } catch (e) {
          console.warn('URD metal ledger posting failed', urdNumber, e?.message);
        }
      }

      // 2 — the customer gets a credit for the value of the old gold
      if (txn.customerId && calc.finalValue > 0) {
        const last = await tx.customerLedger.findFirst({
          where: { customerId: txn.customerId },
          orderBy: { createdAt: 'desc' },
        });
        const balance = round2((last?.balance || 0) - calc.finalValue);
        await tx.customerLedger.create({
          data: {
            customerId: txn.customerId,
            transactionType: 'URD',
            transactionId: txn.id,
            transactionNo: urdNumber,
            date: data.date ? new Date(data.date) : new Date(),
            debit: 0,
            credit: calc.finalValue,
            balance,
            description: `Old gold received ${urdNumber} — ${g3(calc.netWeight)} g ${txn.metalType} ${txn.purity}`,
          },
        });
      }

      return txn;
    });
  }

  /** Editing re-values the metal movement and the customer credit. */
  async update(id: string, data: any, orgId: string, userId: string) {
    const existing: any = await this.load(id, orgId);
    if (existing.status === 'PROPOSED' && !data.keepProposed) {
      // still an estimate — only the numbers change, nothing is posted
      const calc = this.valuation({ ...existing, ...data });
      return this.prisma.urdTransaction.update({
        where: { id },
        data: {
          customerId: data.customerId ?? existing.customerId,
          customerName: data.customerName ?? existing.customerName,
          metalType: data.metalType ?? existing.metalType,
          purity: data.purity ?? existing.purity,
          grossWeight: Number(data.grossWeight ?? existing.grossWeight) || 0,
          stoneWeight: Number(data.stoneWeight ?? existing.stoneWeight) || 0,
          netWeight: calc.netWeight,
          rate: calc.rate,
          value: calc.value,
          deduction: calc.deduction,
          meltingLoss: calc.meltingLoss,
          finalValue: calc.finalValue,
          notes: data.notes ?? existing.notes,
        },
      });
    }

    const merged = { ...existing, ...data };
    const calc = this.valuation(merged);

    return this.prisma.$transaction(async (tx) => {
      const txn = await tx.urdTransaction.update({
        where: { id },
        data: {
          customerId: data.customerId ?? existing.customerId,
          customerName: data.customerName ?? existing.customerName,
          metalType: data.metalType ?? existing.metalType,
          purity: data.purity ?? existing.purity,
          grossWeight: Number(data.grossWeight ?? existing.grossWeight) || 0,
          stoneWeight: Number(data.stoneWeight ?? existing.stoneWeight) || 0,
          netWeight: calc.netWeight,
          rate: calc.rate,
          value: calc.value,
          deduction: calc.deduction,
          meltingLoss: calc.meltingLoss,
          finalValue: calc.finalValue,
          notes: data.notes ?? existing.notes,
        },
      });

      // re-post the incoming metal movement
      if (existing.status !== 'SOLD') {
        await this.ledger.reverseMetalMovements(orgId, 'URD', id, tx);
        if (calc.netWeight > 0) {
          try {
            const account = await this.ledger.resolveMetalAccount(
              { organizationId: orgId, branchId: txn.branchId, metalType: txn.metalType, purity: txn.purity },
              tx,
            );
            await this.ledger.postMetalMovement(
              {
                organizationId: orgId,
                branchId: txn.branchId,
                accountId: account.id,
                type: 'CREDIT',
                grams: calc.netWeight,
                rate: calc.rate,
                metalType: txn.metalType,
                purity: txn.purity,
                description: `URD / old gold received — ${g3(calc.netWeight)} g ${txn.metalType} ${txn.purity} from ${txn.customerName} (${txn.urdNumber})`,
                reference: txn.urdNumber,
                linkedTo: 'URD',
                linkedId: id,
                employeeId: userId,
              },
              tx,
            );
          } catch (e) {
            console.warn('URD metal ledger re-post failed', txn.urdNumber, e?.message);
          }
        }
      }

      // keep the customer credit in step with the new value
      if (txn.customerId) {
        const creditRow = await tx.customerLedger.findFirst({
          where: { customerId: txn.customerId, transactionId: id, transactionType: 'URD' },
        });
        if (creditRow) {
          const delta = round2(calc.finalValue - Number(creditRow.credit || 0));
          await tx.customerLedger.update({
            where: { id: creditRow.id },
            data: { credit: calc.finalValue },
          });
          if (delta) {
            // re-run the running balance from that row onwards
            const later = await tx.customerLedger.findMany({
              where: { customerId: txn.customerId, createdAt: { gt: creditRow.createdAt } },
              orderBy: { createdAt: 'asc' },
            });
            let balance = round2(Number(creditRow.balance || 0));
            for (const row of later) {
              balance = round2(balance + Number(row.debit || 0) - Number(row.credit || 0));
              await tx.customerLedger.update({ where: { id: row.id }, data: { balance } });
            }
            if (!later.length) {
              await tx.customerLedger.update({ where: { id: creditRow.id }, data: { balance: round2(Number(creditRow.balance || 0) - delta) } });
            }
          }
        }
      }

      return txn;
    });
  }

  /**
   * Payment adjustment — pay the customer for the old gold (fully or partly).
   * Clears the customer's credit and takes the money out of cash / bank.
   */
  async settle(
    id: string,
    body: { amount?: number; paymentMode?: string; reference?: string; accountId?: string; date?: string; notes?: string },
    orgId: string,
    userId: string,
  ) {
    const txn: any = await this.load(id, orgId);
    if (txn.status === 'PROPOSED') throw new BadRequestException('A proposed (estimate) URD cannot be paid — confirm the bill first');
    if (txn.status === 'SOLD') throw new BadRequestException('This old gold has already been sold out — nothing left to pay for');
    if (txn.status === 'ADJUSTED') throw new BadRequestException('This URD was already adjusted against a bill');

    const outstanding = round2((Number(txn.finalValue) || 0) - (Number(txn.settledAmount) || 0));
    const amount = Number(body.amount) > 0 ? Math.min(Number(body.amount), outstanding) : outstanding;
    if (amount <= 0) throw new BadRequestException('Nothing outstanding on this URD');

    return this.prisma.$transaction(async (tx) => {
      const settledAmount = round2((Number(txn.settledAmount) || 0) + amount);

      // 1 — the customer's credit is used up
      if (txn.customerId) {
        const last = await tx.customerLedger.findFirst({
          where: { customerId: txn.customerId },
          orderBy: { createdAt: 'desc' },
        });
        const balance = round2((last?.balance || 0) + amount);
        await tx.customerLedger.create({
          data: {
            customerId: txn.customerId,
            transactionType: 'URD_PAYMENT',
            transactionId: txn.id,
            transactionNo: txn.urdNumber,
            date: body.date ? new Date(body.date) : new Date(),
            debit: amount,
            credit: 0,
            balance,
            description: `Paid for old gold ${txn.urdNumber}${body.notes ? ' - ' + body.notes : ''}`,
          },
        });
      }

      // 2 — money leaves the cash / bank account
      let account: any = null;
      if (body.accountId) {
        account = await tx.ledgerAccount.findFirst({ where: { id: body.accountId, organizationId: orgId } });
      }
      if (!account) {
        account = await tx.ledgerAccount.findFirst({
          where: { organizationId: orgId, type: 'CASH', isActive: true },
          orderBy: { isPrimary: 'desc' },
        });
      }
      if (account) {
        await tx.ledgerEntry.create({
          data: {
            organizationId: orgId,
            branchId: txn.branchId,
            accountId: account.id,
            type: 'DEBIT',
            amount,
            date: body.date ? new Date(body.date) : new Date(),
            description: `URD payment ${txn.urdNumber} - ${txn.customerName}`,
            reference: body.reference || txn.urdNumber,
            linkedTo: 'URD_PAYMENT',
            linkedId: txn.id,
            employeeId: userId,
          },
        });
        await tx.ledgerAccount.update({
          where: { id: account.id },
          data: { currentBalance: { decrement: amount } },
        });
      }

      await tx.urdTransaction.update({
        where: { id },
        data: {
          settledAmount,
          settledAt: new Date(),
          paymentMode: body.paymentMode || txn.paymentMode || 'CASH',
          status: settledAmount >= round2(Number(txn.finalValue) || 0) ? 'SETTLED' : txn.status,
        },
      });

      return this.findById(id, orgId);
    });
  }

  /**
   * Adjust the old gold against one of the customer's unpaid bills.
   *   • the bill is paid from the URD value (no cash moves)
   *   • the customer's URD credit is cleared and the payment is recorded
   *   • the exchange is marked ADJUSTED
   */
  async adjust(
    id: string,
    body: { saleId: string; amount?: number; date?: string },
    orgId: string,
    userId: string,
  ) {
    const txn: any = await this.load(id, orgId);
    if (txn.status === 'PROPOSED') throw new BadRequestException('A proposed (estimate) URD cannot be adjusted — confirm the bill first');
    if (txn.status === 'ADJUSTED') throw new BadRequestException('This URD is already adjusted against a bill');
    if (txn.status === 'SETTLED') throw new BadRequestException('This URD has already been paid out to the customer');
    if (txn.status === 'SOLD') throw new BadRequestException('This old gold has already been sold out');

    const sale: any = await this.prisma.sale.findFirst({
      where: { id: body.saleId, organizationId: orgId, status: { notIn: ['CANCELLED', 'ESTIMATE'] } },
    });
    if (!sale) throw new NotFoundException('Bill not found');
    if (txn.customerId && sale.customerId && sale.customerId !== txn.customerId) {
      throw new BadRequestException('That bill belongs to a different customer');
    }

    const outstanding = round2((Number(txn.finalValue) || 0) - (Number(txn.settledAmount) || 0));
    const saleDue = round2(Number(sale.balanceAmount ?? sale.netAmount - sale.paidAmount) || 0);
    const amount = Number(body.amount) > 0
      ? Math.min(Number(body.amount), outstanding, saleDue)
      : Math.min(outstanding, saleDue);
    if (amount <= 0) throw new BadRequestException('Nothing to adjust — the URD value or the bill balance is already cleared');

    return this.prisma.$transaction(async (tx) => {
      const date = body.date ? new Date(body.date) : new Date();

      // 1 — the bill is paid with the old gold
      await tx.salePayment.create({
        data: {
          saleId: sale.id,
          amount,
          paymentMode: 'URD',
          reference: txn.urdNumber,
          date,
          employeeId: userId,
        },
      });
      const newPaid = round2((Number(sale.paidAmount) || 0) + amount);
      const newBalance = round2((Number(sale.netAmount) || 0) - newPaid);
      await tx.sale.update({
        where: { id: sale.id },
        data: {
          paidAmount: newPaid,
          balanceAmount: newBalance,
          status: newBalance <= 0 ? 'CONFIRMED' : sale.status,
        },
      });

      // 2 — the customer's URD credit is cleared, then the payment is recorded.
      // The two cancel out: the customer owed the bill, we owed them the metal.
      if (txn.customerId) {
        const last = await tx.customerLedger.findFirst({
          where: { customerId: txn.customerId },
          orderBy: { createdAt: 'desc' },
        });
        let balance = Number(last?.balance || 0);
        balance = round2(balance + amount);
        await tx.customerLedger.create({
          data: {
            customerId: txn.customerId,
            transactionType: 'URD',
            transactionId: txn.id,
            transactionNo: txn.urdNumber,
            date,
            debit: amount,
            credit: 0,
            balance,
            description: `Old gold ${txn.urdNumber} adjusted against bill ${sale.billNumber}`,
          },
        });
        balance = round2(balance - amount);
        await tx.customerLedger.create({
          data: {
            customerId: txn.customerId,
            transactionType: 'PAYMENT',
            transactionId: sale.id,
            transactionNo: sale.billNumber,
            date,
            debit: 0,
            credit: amount,
            balance,
            description: `Paid on ${sale.billNumber} with old gold ${txn.urdNumber}`,
          },
        });
      }

      const settledAmount = round2((Number(txn.settledAmount) || 0) + amount);
      await tx.urdTransaction.update({
        where: { id },
        data: {
          settledAmount,
          settledAt: date,
          referenceBillId: sale.id,
          paymentMode: 'URD',
          status: settledAmount >= round2(Number(txn.finalValue) || 0) ? 'ADJUSTED' : txn.status,
        },
      });

      return this.findById(id, orgId);
    });
  }

  /**
   * Outgoing — the old gold is sold onward or melted out:
   * metal leaves the material ledger, money comes into cash / bank.
   */
  async sell(
    id: string,
    body: { amount?: number; paymentMode?: string; reference?: string; accountId?: string; date?: string; notes?: string },
    orgId: string,
    userId: string,
  ) {
    const txn: any = await this.load(id, orgId);
    if (txn.status === 'SOLD') throw new BadRequestException('This old gold is already sold out');
    if (txn.status === 'PROPOSED') throw new BadRequestException('A proposed (estimate) URD has no metal to sell yet');
    if (txn.status === 'ADJUSTED') throw new BadRequestException('This URD was adjusted against a bill — there is no metal left to sell');

    const amount = Number(body.amount) > 0 ? Number(body.amount) : Number(txn.finalValue) || 0;

    return this.prisma.$transaction(async (tx) => {
      // 1 — the metal goes out of the material ledger
      if (Number(txn.netWeight) > 0) {
        try {
          const account = await this.ledger.resolveMetalAccount(
            { organizationId: orgId, branchId: txn.branchId, metalType: txn.metalType, purity: txn.purity },
            tx,
          );
          await this.ledger.postMetalMovement(
            {
              organizationId: orgId,
              branchId: txn.branchId,
              accountId: account.id,
              type: 'DEBIT',
              grams: Number(txn.netWeight) || 0,
              rate: Number(txn.rate) || 0,
              metalType: txn.metalType,
              purity: txn.purity,
              date: body.date ? new Date(body.date) : new Date(),
              description: `URD old gold sold / melted out — ${g3(txn.netWeight)} g ${txn.metalType} ${txn.purity} (${txn.urdNumber})`,
              reference: body.reference || txn.urdNumber,
              linkedTo: 'URD_OUT',
              linkedId: txn.id,
              employeeId: userId,
            },
            tx,
          );
        } catch (e) {
          console.warn('URD outgoing metal movement failed', txn.urdNumber, e?.message);
        }
      }

      // 2 — money comes in
      if (amount > 0) {
        let account: any = null;
        if (body.accountId) {
          account = await tx.ledgerAccount.findFirst({ where: { id: body.accountId, organizationId: orgId } });
        }
        if (!account) {
          account = await tx.ledgerAccount.findFirst({
            where: { organizationId: orgId, type: 'CASH', isActive: true },
            orderBy: { isPrimary: 'desc' },
          });
        }
        if (account) {
          await tx.ledgerEntry.create({
            data: {
              organizationId: orgId,
              branchId: txn.branchId,
              accountId: account.id,
              type: 'CREDIT',
              amount,
              date: body.date ? new Date(body.date) : new Date(),
              description: `URD old gold sold ${txn.urdNumber} - ${txn.customerName}`,
              reference: body.reference || txn.urdNumber,
              linkedTo: 'URD_SALE',
              linkedId: txn.id,
              employeeId: userId,
            },
          });
          await tx.ledgerAccount.update({
            where: { id: account.id },
            data: { currentBalance: { increment: amount } },
          });
        }
      }

      await tx.urdTransaction.update({
        where: { id },
        data: {
          status: 'SOLD',
          soldAt: new Date(),
          paymentMode: body.paymentMode || txn.paymentMode || 'CASH',
          notes: body.notes ?? txn.notes,
        },
      });

      return this.findById(id, orgId);
    });
  }
}
