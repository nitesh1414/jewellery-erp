import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, query: { search?: string; page?: number; limit?: number }) {
    const { search, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where: any = { organizationId };
    if (search) where.OR = [{ name: { contains: search } }, { mobile: { contains: search } }];
    const [items, total] = await Promise.all([
      this.prisma.supplier.findMany({ where, skip, take: +limit, orderBy: { name: 'asc' } }),
      this.prisma.supplier.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async create(data: any, organizationId: string) {
    return this.prisma.supplier.create({ data: { ...data, organizationId } });
  }

  async findById(id: string, organizationId: string) {
    const s = await this.prisma.supplier.findFirst({ where: { id, organizationId }, include: { ledgerEntries: { take: 50, orderBy: { date: 'desc' } } } });
    if (!s) throw new NotFoundException('Supplier not found');
    return s;
  }
}
