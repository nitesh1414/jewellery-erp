import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { PrismaService } from '../../common/prisma.service';

export interface QuotationItem {
  particular: string;
  hsnCode?: string;
  purity?: string;
  quantity?: number;
  grossWeight?: number;
  netWeight?: number;
  ratePerGram?: number;
  metalValue?: number;
  makingCharges?: number;
  hallmarkNumber?: string;
  hallMarkAmount?: number;
  discount?: number;
  totalAmount?: number;
}

/**
 * Quotations — estimated bills shared with customers via a public link
 * (`/q/:token`). No auth needed to view; creating requires a logged-in user.
 */
@Injectable()
export class QuotationsService {
  constructor(private prisma: PrismaService) {}

  async create(data: any, organizationId: string, branchId: string, userId?: string) {
    const items: QuotationItem[] = Array.isArray(data.items) ? data.items : [];
    if (items.length === 0) throw new BadRequestException('Add at least one item to the quotation');

    const count = await this.prisma.quotation.count({ where: { organizationId } });
    const year = new Date().getFullYear();
    const quoteNumber = `QT-${year}-${String(count + 1).padStart(5, '0')}`;
    const token = crypto.randomBytes(12).toString('base64url');

    const gross = items.reduce((s, i) => s + (i.totalAmount ?? (i.metalValue || 0) + (i.makingCharges || 0) + (i.hallMarkAmount || 0) - (i.discount || 0)), 0);
    const discount = Number(data.discount || 0);
    const net = Math.round((gross - discount) * 100) / 100;

    return this.prisma.quotation.create({
      data: {
        organizationId,
        branchId,
        quoteNumber,
        token,
        customerId: data.customerId || null,
        customerName: data.customerName || 'Customer',
        customerMobile: data.customerMobile || null,
        items: JSON.stringify(items),
        grossAmount: Math.round(gross * 100) / 100,
        discount,
        netAmount: net,
        isGst: data.isGst !== false,
        validUntil: data.validUntil ? new Date(data.validUntil) : null,
        status: 'ACTIVE',
        notes: data.notes || null,
        createdById: userId || null,
      },
    });
  }

  async findAll(organizationId: string, query: { search?: string; status?: string; page?: number; limit?: number }) {
    const page = Number(query.page ?? 1) || 1;
    const limit = Math.min(100, Number(query.limit ?? 20) || 20);
    const where: any = { organizationId };
    if (query.status) where.status = query.status;
    if (query.search) {
      where.OR = [
        { quoteNumber: { contains: query.search } },
        { customerName: { contains: query.search } },
        { customerMobile: { contains: query.search } },
      ];
    }
    const [items, total] = await Promise.all([
      this.prisma.quotation.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.quotation.count({ where }),
    ]);
    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string, organizationId: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, organizationId } });
    if (!q) throw new NotFoundException('Quotation not found');
    return this.serialize(q);
  }

  /** Public — called from the customer-facing quote page. No org context needed. */
  async findByToken(token: string) {
    const q = await this.prisma.quotation.findUnique({ where: { token } });
    if (!q) throw new NotFoundException('Quotation not found or link is invalid');
    const settings = await this.prisma.shopSettings.findUnique({ where: { organizationId: q.organizationId } });
    return { ...this.serialize(q), shop: settings ? {
      shopName: settings.shopName,
      shopAddress: settings.shopAddress,
      shopCity: settings.shopCity,
      shopPhone: settings.shopPhone,
      shopGstin: settings.shopGstin,
      shopEmail: settings.shopEmail,
      logo: settings.logo,
    } : null };
  }

  async updateStatus(id: string, status: string, organizationId: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, organizationId } });
    if (!q) throw new NotFoundException('Quotation not found');
    if (!['ACTIVE', 'ACCEPTED', 'EXPIRED', 'CONVERTED'].includes(status)) {
      throw new BadRequestException('Invalid status');
    }
    return this.prisma.quotation.update({ where: { id }, data: { status } });
  }

  async remove(id: string, organizationId: string) {
    const q = await this.prisma.quotation.findFirst({ where: { id, organizationId } });
    if (!q) throw new NotFoundException('Quotation not found');
    await this.prisma.quotation.delete({ where: { id } });
    return { deleted: true };
  }

  private serialize(q: any) {
    let items: QuotationItem[] = [];
    try {
      items = JSON.parse(q.items || '[]');
    } catch {
      items = [];
    }
    return {
      ...q,
      items,
      isExpired: q.validUntil ? new Date(q.validUntil) < new Date() : false,
    };
  }
}
