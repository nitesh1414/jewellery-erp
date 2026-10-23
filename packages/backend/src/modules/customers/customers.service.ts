import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  /** Cities that actually exist in the customer book — powers the filter. */
  async listCities(organizationId: string) {
    const rows = await this.prisma.customer.findMany({
      where: { organizationId, city: { not: null } },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    });
    return rows.map((r: any) => r.city).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b));
  }

  async findAll(organizationId: string, query: { search?: string; city?: string; page?: number; limit?: number }) {
    const search = query.search; const page = +(query.page || 1); const limit = +(query.limit || 20);
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (query.city) where.city = query.city;

    if (search) {
      where.OR = [
        { name: { contains: search } },
        { mobile: { contains: search } },
        { customerId: { contains: search } },
        { gstin: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        skip,
        take: limit,
        orderBy: { name: 'asc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string, organizationId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
      include: {
        ledgerEntries: { orderBy: { createdAt: 'desc' }, take: 50 },
        advances: { orderBy: { createdAt: 'desc' }, take: 20 },
        sales: { orderBy: { createdAt: 'desc' }, take: 20 },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  async findByMobile(mobile: string, organizationId: string) {
    return this.prisma.customer.findFirst({
      where: { mobile, organizationId },
    });
  }

  async create(data: {
    organizationId: string;
    branchId?: string;
    name: string;
    mobile?: string;
    alternateMobile?: string;
    address?: string;
    city?: string;
    state?: string;
    pin?: string;
    gstin?: string;
    email?: string;
    notes?: string;
  }) {
    // Generate customer ID
    const count = await this.prisma.customer.count({
      where: { organizationId: data.organizationId },
    });
    const customerId = `CUST-${String(count + 1).padStart(5, '0')}`;

    // Check duplicate mobile
    if (data.mobile) {
      const existing = await this.prisma.customer.findFirst({
        where: { mobile: data.mobile, organizationId: data.organizationId },
      });
      if (existing) {
        throw new ConflictException('Customer with this mobile already exists');
      }
    }

    return this.prisma.customer.create({
      data: {
        ...data,
        customerId,
      },
    });
  }

  async update(id: string, organizationId: string, data: any) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, organizationId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.customer.update({
      where: { id },
      data,
    });
  }

  async getLedger(customerId: string, organizationId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, organizationId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return this.prisma.customerLedger.findMany({
      where: { customerId },
      orderBy: { date: 'desc' },
      take: 200,
    });
  }

  async getOutstanding(organizationId: string) {
    return this.prisma.customer.findMany({
      where: { organizationId, isActive: true },
      include: {
        ledgerEntries: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });
  }
}