import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
@Injectable()
export class UrdService {
  constructor(private prisma: PrismaService) {}
  async findAll(orgId: string, q: any) {
    const { page = 1, limit = 20, branchId } = q;
    const where: any = { organizationId: orgId };
    if (branchId) where.branchId = branchId;
    const [items, total] = await Promise.all([
      this.prisma.urdTransaction.findMany({ where, skip: (page-1)*limit, take: +limit, orderBy: { createdAt: 'desc' }, include: { customer: { select: { name: true } } } }),
      this.prisma.urdTransaction.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }
  async create(data: any, orgId: string, branchId: string) {
    const count = await this.prisma.urdTransaction.count({ where: { organizationId: orgId } });
    const year = new Date().getFullYear();
    const urdNumber = `URD-${year}-${String(count + 1).padStart(5, '0')}`;
    const grossValue = data.netWeight * data.rate;
    const netValue = grossValue - (data.deduction || 0);
    const finalValue = netValue * (1 - (data.meltingLoss || 0) / 100);
    
    return this.prisma.urdTransaction.create({
      data: { ...data, organizationId: orgId, branchId, urdNumber, value: grossValue, finalValue, status: 'ACTIVE' },
    });
  }
}
