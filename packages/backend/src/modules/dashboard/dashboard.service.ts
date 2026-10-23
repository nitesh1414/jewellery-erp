import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private prisma: PrismaService) {}

  async getDashboard(organizationId: string, branchId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const baseWhere: any = { organizationId };
    // Estimated bills are NOT confirmed sales — they must never count in
    // sales, collection, outstanding or GST until confirmed into a real bill.
    const todayWhere: any = { ...baseWhere, billDate: { gte: today }, status: { notIn: ['CANCELLED', 'DRAFT', 'ESTIMATE'] }, billType: { not: 'ESTIMATE' } };
    if (branchId) {
      baseWhere.branchId = branchId;
      todayWhere.branchId = branchId;
    }

    // Today's data
    const todaySales = await this.prisma.sale.findMany({ where: todayWhere, include: { items: true } });

    const todaySummary = {
      sales: todaySales.reduce((sum, s) => sum + s.netAmount, 0),
      collection: todaySales.reduce((sum, s) => sum + s.paidAmount, 0),
      outstanding: todaySales.reduce((sum, s) => sum + s.balanceAmount, 0),
      bills: todaySales.length,
      gstCollected: todaySales.reduce((sum, s) => sum + s.totalTax, 0),
    };

    // Inventory summary
    const stockItems = await this.prisma.jewelleryItem.findMany({
      where: { ...baseWhere, status: 'IN_STOCK' },
    });

    const inventorySummary = {
      goldStock: stockItems.filter(i => i.metalType === 'GOLD').reduce((s, i) => s + i.netWeight, 0),
      silverStock: stockItems.filter(i => i.metalType === 'SILVER').reduce((s, i) => s + i.netWeight, 0),
      totalPieces: stockItems.length,
      stockValue: stockItems.reduce((s, i) => s + i.netWeight * i.currentRate, 0),
    };

    // Job work summary (OUT → IN)
    const jobWorks = await this.prisma.jobWork.findMany({ where: { ...baseWhere } });

    const jobSummary = {
      pending: jobWorks.filter(j => j.status === 'GIVEN').length,
      inProgress: jobWorks.filter(j => j.status === 'IN_PROCESS').length,
      ready: jobWorks.filter(j => j.status === 'COMPLETED').length,
      delayed: jobWorks.filter(j => {
        if ((j.status === 'GIVEN' || j.status === 'IN_PROCESS') && j.dueDate) {
          return new Date(j.dueDate) < new Date();
        }
        return false;
      }).length,
    };


    // Customer outstanding
    const customersWithLedger = await this.prisma.customer.findMany({
      where: { ...baseWhere, isActive: true },
      include: {
        ledgerEntries: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });

    const totalOutstanding = customersWithLedger.reduce((sum, c) => {
      const lastEntry = c.ledgerEntries[0];
      return sum + (lastEntry ? Math.abs(lastEntry.balance) : 0);
    }, 0);

    // Quick stats
    const customerCount = await this.prisma.customer.count({ where: baseWhere });
    const lowStockItems = await this.prisma.jewelleryItem.count({
      where: { ...baseWhere, status: 'IN_STOCK', quantity: { lte: 2 } },
    });

    return {
      today: todaySummary,
      inventory: inventorySummary,
      jobs: jobSummary,
      customerOutstanding: totalOutstanding,
      customerCount,
      lowStockItems,
      currency: '₹',
    };
  }
}