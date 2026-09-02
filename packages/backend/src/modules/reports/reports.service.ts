import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
@Injectable()
export class ReportsService {
  constructor(private prisma: PrismaService) {}
  async salesReport(orgId: string, q: { startDate?: string; endDate?: string; billType?: string; branchId?: string }) {
    // Estimated bills are not treated as confirmed sales anywhere.
    const where: any = { organizationId: orgId, status: { notIn: ['DRAFT', 'CANCELLED', 'ESTIMATE'] }, billType: { not: 'ESTIMATE' } };
    if (q.startDate) where.billDate = { ...where.billDate, gte: new Date(q.startDate) };
    if (q.endDate) where.billDate = { ...where.billDate, lte: new Date(q.endDate) };
    if (q.billType) where.billType = q.billType;
    if (q.branchId) where.branchId = q.branchId;
    const sales = await this.prisma.sale.findMany({ where, include: { items: true, payments: true } });
    const summary = {
      totalSales: sales.length,
      totalAmount: sales.reduce((s, i) => s + i.netAmount, 0),
      totalTax: sales.reduce((s, i) => s + i.totalTax, 0),
      totalCgst: sales.reduce((s, i) => s + i.cgst, 0),
      totalSgst: sales.reduce((s, i) => s + i.sgst, 0),
      totalIgst: sales.reduce((s, i) => s + i.igst, 0),
      totalCollection: sales.reduce((s, i) => s + i.paidAmount, 0),
      totalOutstanding: sales.reduce((s, i) => s + i.balanceAmount, 0),
      b2bCount: sales.filter(s => s.customerGstin).length,
      b2cCount: sales.filter(s => !s.customerGstin).length,
    };
    return { summary, sales };
  }
  async hsnSummary(orgId: string, q: { startDate?: string; endDate?: string; branchId?: string }) {
    const where: any = { organizationId: orgId, status: { notIn: ['DRAFT', 'CANCELLED', 'ESTIMATE'] }, billType: { not: 'ESTIMATE' } };
    if (q.branchId) where.branchId = q.branchId;
    if (q.startDate) where.billDate = { ...where.billDate, gte: new Date(q.startDate) };
    if (q.endDate) where.billDate = { ...where.billDate, lte: new Date(q.endDate) };
    const sales = await this.prisma.sale.findMany({ where, include: { items: true } });
    const hsnMap = new Map();
    for (const sale of sales) {
      for (const item of sale.items) {
        const existing = hsnMap.get(item.hsnCode) || { hsnCode: item.hsnCode, totalAmount: 0, totalTax: 0, totalCgst: 0, totalSgst: 0, count: 0 };
        existing.totalAmount += item.totalAmount;
        existing.totalTax += item.cgst + item.sgst;
        existing.totalCgst += item.cgst;
        existing.totalSgst += item.sgst;
        existing.count += item.quantity;
        hsnMap.set(item.hsnCode, existing);
      }
    }
    return Array.from(hsnMap.values());
  }
  async inventoryReport(orgId: string) {
    const items = await this.prisma.jewelleryItem.findMany({ where: { organizationId: orgId, status: 'IN_STOCK' } });
    return {
      totalItems: items.length,
      totalWeight: items.reduce((s, i) => s + i.netWeight, 0),
      totalValue: items.reduce((s, i) => s + i.netWeight * i.currentRate, 0),
      byMetal: Object.entries(items.reduce((acc: any, i) => {
        const key = i.metalType;
        acc[key] = acc[key] || { weight: 0, value: 0, count: 0 };
        acc[key].weight += i.netWeight;
        acc[key].value += i.netWeight * i.currentRate;
        acc[key].count += i.quantity;
        return acc;
      }, {})).map(([metal, data]) => ({ metal, ...data as any })),
    };
  }
  /** Job work OUT → IN: what was given to which worker, what came back. */
  async jobWorkReport(orgId: string, q: { status?: string; employeeId?: string; branchId?: string }) {
    const where: any = { organizationId: orgId };
    if (q.branchId) where.branchId = q.branchId;
    if (q.status) where.status = q.status;
    if (q.employeeId) where.workerId = q.employeeId;
    return this.prisma.jobWork.findMany({
      where,
      include: { items: true, materials: true, worker: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }
}
