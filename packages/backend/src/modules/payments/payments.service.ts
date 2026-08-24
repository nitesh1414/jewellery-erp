import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { v4 as uuid } from 'uuid';
@Injectable()
export class PaymentsService {
  constructor(private prisma: PrismaService) {}
  async findAll(orgId: string, q: any) {
    const { customerId, supplierId, branchId, page = 1, limit = 20 } = q;
    const where: any = { organizationId: orgId };
    if (customerId) where.customerId = customerId;
    if (supplierId) where.supplierId = supplierId;
    if (branchId) where.branchId = branchId;
    const [items, total] = await Promise.all([
      this.prisma.payment.findMany({ where, skip: (page-1)*limit, take: +limit, orderBy: { date: 'desc' } }),
      this.prisma.payment.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  async create(data: any, orgId: string, branchId: string, userId: string) {
    const transactionId = `PAY-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: { ...data, organizationId: orgId, branchId, transactionId, employeeId: userId, date: data.date ? new Date(data.date) : new Date() },
      });
      if (data.customerId) {
        const lastLedger = await tx.customerLedger.findFirst({ where: { customerId: data.customerId }, orderBy: { createdAt: 'desc' } });
        const balance = (lastLedger?.balance || 0) - data.amount;
        await tx.customerLedger.create({
          data: { customerId: data.customerId, transactionType: 'PAYMENT', transactionId: payment.id, date: new Date(), debit: 0, credit: data.amount, balance, description: data.notes || `Payment received` },
        });
      }
      return payment;
    });
  }
}
