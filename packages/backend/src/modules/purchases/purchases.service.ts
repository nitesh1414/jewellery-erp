import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class PurchasesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, query: {
    search?: string;
    supplierId?: string;
    metalType?: string;
    purity?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, supplierId, metalType, purity, branchId, startDate, endDate, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (branchId) where.branchId = branchId;

    if (supplierId) where.supplierId = supplierId;
    if (metalType) where.metalType = metalType;
    if (purity) where.purity = purity;
    if (startDate || endDate) {
      where.invoiceDate = {};
      if (startDate) where.invoiceDate.gte = new Date(startDate);
      if (endDate) where.invoiceDate.lte = new Date(endDate);
    }
    if (search) {
      where.OR = [
        { invoiceNumber: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.purchase.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        include: { supplier: { select: { name: true, mobile: true } }, items: true },
      }),
      this.prisma.purchase.count({ where }),
    ]);

    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findById(id: string, organizationId: string) {
    const purchase = await this.prisma.purchase.findFirst({
      where: { id, organizationId },
      include: {
        supplier: { select: { name: true, mobile: true, gstin: true } },
        items: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!purchase) throw new NotFoundException('Purchase not found');
    return purchase;
  }

  // Aggregate totak helpers for single-line vs multi-item purchases
  private aggregateLineTotals(data: any) {
    const itemsRaw = (data.items || []).filter((i: any) => i && (i.netWeight || 0) > 0);
    if (itemsRaw.length === 0) {
      // Legacy single-entry purchase
      const amount = Math.round(((data.netWeight || 0) * (data.rate || 0)) * 100) / 100;
      return {
        hasItems: false,
        metalType: data.metalType || 'GOLD',
        purity: data.purity || '22K',
        grossWeight: data.grossWeight || 0,
        netWeight: data.netWeight || 0,
        quantity: data.quantity || 1,
        rate: data.rate || 0,
        amount,
        makingCharges: data.makingCharges || 0,
        stoneCharges: data.stoneCharges || 0,
        otherCharges: data.otherCharges || 0,
      };
    }
    const metalTypes = new Set(itemsRaw.map((i: any) => i.metalType).filter(Boolean));
    const purities = new Set(itemsRaw.map((i: any) => i.purity).filter(Boolean));
    const gross = itemsRaw.reduce((s: number, i: any) => s + (i.grossWeight || 0), 0);
    const net = itemsRaw.reduce((s: number, i: any) => s + (i.netWeight || 0), 0);
    const qty = itemsRaw.reduce((s: number, i: any) => s + (i.quantity || 1), 0);
    const amount = itemsRaw.reduce((s: number, i: any) => s + Math.round(((i.netWeight || 0) * (i.rate || 0)) * 100) / 100, 0);
    const makingCharges = itemsRaw.reduce((s: number, i: any) => s + (i.makingCharges || 0), 0);
    const stoneCharges = itemsRaw.reduce((s: number, i: any) => s + (i.stoneCharges || 0), 0);
    const otherCharges = itemsRaw.reduce((s: number, i: any) => s + (i.otherCharges || 0), 0);
    return {
      hasItems: true,
      metalType: metalTypes.size === 1 ? [...metalTypes][0] : (metalTypes.size > 1 ? 'MIXED' : 'GOLD'),
      purity: purities.size === 1 ? [...purities][0] : (purities.size > 1 ? 'MIXED' : '22K'),
      grossWeight: Math.round(gross * 100) / 100,
      netWeight: Math.round(net * 100) / 100,
      quantity: qty,
      rate: amount > 0 ? Math.round((amount / Math.max(1, net)) * 100) / 100 : 0,
      amount: Math.round(amount * 100) / 100,
      makingCharges: Math.round(makingCharges * 100) / 100,
      stoneCharges: Math.round(stoneCharges * 100) / 100,
      otherCharges: Math.round(otherCharges * 100) / 100,
    };
  }

  /**
   * Create purchase with per-item jewellery creation (multiple metals allowed).
   * The supplier's invoice number is optional — pass it when available.
   */
  async create(data: any, organizationId: string, branchId: string, userId: string) {
    const totals = this.aggregateLineTotals(data);
    const totalAmount = Math.round((totals.amount
      + totals.makingCharges
      + totals.stoneCharges
      + totals.otherCharges
      + (data.cgst || 0)
      + (data.sgst || 0)
      + (data.igst || 0)) * 100) / 100;
    const paidAmount = Math.round((data.paidAmount || 0) * 100) / 100;
    const balanceAmount = Math.round((totalAmount - paidAmount) * 100) / 100;

    const purchase = await this.prisma.$transaction(async (tx) => {
      const record = await tx.purchase.create({
        data: {
          organizationId,
          branchId,
          supplierId: data.supplierId,
          invoiceNumber: data.invoiceNumber || `PUR-${Date.now()}`,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
          metalType: totals.metalType,
          purity: totals.purity,
          grossWeight: totals.grossWeight,
          netWeight: totals.netWeight,
          quantity: totals.quantity,
          rate: totals.rate,
          amount: totals.amount,
          makingCharges: totals.makingCharges,
          stoneCharges: totals.stoneCharges,
          otherCharges: totals.otherCharges,
          cgst: data.cgst || 0,
          sgst: data.sgst || 0,
          igst: data.igst || 0,
          totalAmount,
          paidAmount,
          balanceAmount,
          notes: data.notes,
        },
      });

      const itemsRaw = (data.items || []).filter((i: any) => i && (i.netWeight || 0) > 0);

      // Persist line items so a purchase can hold many metals/purities.
      if (totals.hasItems) {
        for (const item of itemsRaw) {
          const lineAmount = Math.round(((item.netWeight || 0) * (item.rate || 0)) * 100) / 100;
          await tx.purchaseItem.create({
            data: {
              purchaseId: record.id,
              designCode: item.designCode || '',
              category: item.category || '',
              subCategory: item.subCategory || '',
              ornament: item.ornament || '',
              ornamentGender: item.ornamentGender || '',
              hsnCode: item.hsnCode || '7113',
              metalType: item.metalType || data.metalType || 'GOLD',
              purity: item.purity || data.purity || '22K',
              grossWeight: item.grossWeight || 0,
              stoneWeight: item.stoneWeight || 0,
              otherWeight: item.otherWeight || 0,
              netWeight: item.netWeight || 0,
              quantity: item.quantity || 1,
              rate: item.rate || data.rate || 0,
              makingChargeType: item.makingChargeType || 'PERCENTAGE',
              makingChargeValue: item.makingChargeValue || 10,
              hallmarkNumber: item.hallmarkNumber || '',
              certificateNumber: item.certificateNumber || '',
              stoneCharges: item.stoneCharges || 0,
              otherCharges: item.otherCharges || 0,
              lineAmount,
            },
          });
        }
      }

      // Create jewellery items from the purchased lines (material entry into
      // inventory). Each line becomes its own barcoded inventory item.
      for (const item of itemsRaw) {
        const lastBarcode = await tx.barcode.findFirst({
          where: { organizationId },
          orderBy: { createdAt: 'desc' },
        });
        const nextSeq = lastBarcode
          ? parseInt(lastBarcode.barcode.replace(/\D/g, ''), 10) + 1
          : 1;
        const barcodeStr = `G${String(nextSeq).padStart(8, '0')}`;

        const barcodeRecord = await tx.barcode.create({
          data: {
            organizationId,
            branchId,
            barcode: barcodeStr,
            jewelleryItemId: null,
            isAssigned: true,
          },
        });

        const jewelleryItem = await tx.jewelleryItem.create({
          data: {
            organizationId,
            branchId,
            barcode: barcodeStr,
            sku: item.sku || `SKU-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
            productId: item.productId || null,
            category: item.category || data.category || '',
            subCategory: item.subCategory || '',
            designCode: item.designCode || data.designCode || '',
            metalType: item.metalType || data.metalType || 'GOLD',
            purity: item.purity || data.purity || '22K',
            grossWeight: item.grossWeight || 0,
            stoneWeight: item.stoneWeight || 0,
            ornament: item.ornament || null,
            ornamentGender: item.ornamentGender || null,
            otherWeight: item.otherWeight || 0,
            netWeight: item.netWeight || 0,
            quantity: item.quantity || 1,
            size: item.size || '',
            color: item.color || '',
            brand: item.brand || '',
            purchaseRate: item.rate || data.rate || 0,
            currentRate: item.rate || data.rate || 0,
            makingChargeType: item.makingChargeType || 'PERCENTAGE',
            makingChargeValue: item.makingChargeValue || 10,
            hallmarkNumber: item.hallmarkNumber || '',
            certificateNumber: item.certificateNumber || '',
            hsnCode: item.hsnCode || data.hsnCode || '7113',
            status: 'IN_STOCK',
            location: data.location || '',
            supplierId: data.supplierId,
            purchaseId: record.id,
            purchaseDate: new Date(data.invoiceDate || Date.now()),
          },
        });

        await tx.barcode.update({
          where: { id: barcodeRecord.id },
          data: { jewelleryItemId: jewelleryItem.id, isAssigned: true },
        });

        await tx.stockTransaction.create({
          data: {
            organizationId,
            branchId,
            transactionType: 'PURCHASE',
            transactionId: jewelleryItem.id,
            jewelleryItemId: jewelleryItem.id,
            barcode: barcodeStr,
            metalType: jewelleryItem.metalType,
            purity: jewelleryItem.purity,
            weight: jewelleryItem.netWeight,
            quantity: jewelleryItem.quantity,
            rate: jewelleryItem.currentRate,
            value: jewelleryItem.netWeight * jewelleryItem.currentRate,
            reference: data.invoiceNumber || record.invoiceNumber,
            notes: `Purchase import: ${data.invoiceNumber || record.invoiceNumber}`,
            createdById: userId,
          },
        });
      }

      if (!totals.hasItems) {
        // No line items → legacy single material stock transaction
        await tx.stockTransaction.create({
          data: {
            organizationId,
            branchId,
            transactionType: 'PURCHASE',
            transactionId: record.id,
            metalType: totals.metalType,
            purity: totals.purity,
            weight: totals.netWeight,
            quantity: totals.quantity,
            rate: totals.rate,
            value: totals.amount,
            reference: data.invoiceNumber || record.invoiceNumber,
            notes: `Purchase: ${data.invoiceNumber || record.invoiceNumber}`,
            createdById: userId,
          },
        });
      }

      // Supplier ledger
      await tx.supplierLedger.create({
        data: {
          supplierId: data.supplierId,
          transactionType: 'PURCHASE',
          transactionId: record.id,
          date: new Date(),
          debit: totalAmount,
          credit: paidAmount,
          balance: balanceAmount,
          description: `Purchase ${data.invoiceNumber || record.invoiceNumber}`,
        },
      });

      // Audit log
      await tx.auditLog.create({
        data: {
          organizationId,
          branchId,
          userId,
          userName: 'System',
          action: 'CREATE_PURCHASE',
          entityType: 'Purchase',
          entityId: record.id,
          newValue: JSON.stringify({ invoiceNumber: record.invoiceNumber, totalAmount, items: itemsRaw.length }),
        },
      });

      return record;
    });

    return this.prisma.purchase.findUnique({
      where: { id: purchase.id },
      include: { supplier: { select: { name: true } }, items: true },
    });
  }

  /**
   * Edit an existing purchase (invoice no., date, supplier, notes, payment and
   * line items). Line items are replaced; inventory items created from the
   * purchase are updated in-place where possible.
   */
  async update(id: string, data: any, organizationId: string, branchId: string, userId: string) {
    const existing = await this.prisma.purchase.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('Purchase not found');

    const totals = this.aggregateLineTotals({ ...existing, ...data });
    const totalAmount = Math.round((totals.amount
      + totals.makingCharges
      + totals.stoneCharges
      + totals.otherCharges
      + ((data.cgst ?? existing.cgst) || 0)
      + ((data.sgst ?? existing.sgst) || 0)
      + ((data.igst ?? existing.igst) || 0)) * 100) / 100;
    const paidAmount = Math.round(((data.paidAmount ?? existing.paidAmount) || 0) * 100) / 100;
    const balanceAmount = Math.round((totalAmount - paidAmount) * 100) / 100;

    const itemsRaw = ((data.items || []).length ? data.items : existing.items.map((i: any) => ({
      designCode: i.designCode,
      category: i.category,
      subCategory: i.subCategory,
      ornament: i.ornament,
      ornamentGender: i.ornamentGender,
      hsnCode: i.hsnCode,
      metalType: i.metalType,
      purity: i.purity,
      grossWeight: i.grossWeight,
      stoneWeight: i.stoneWeight,
      otherWeight: i.otherWeight,
      netWeight: i.netWeight,
      quantity: i.quantity,
      rate: i.rate,
      makingChargeType: i.makingChargeType,
      makingChargeValue: i.makingChargeValue,
      hallmarkNumber: i.hallmarkNumber,
      certificateNumber: i.certificateNumber,
    })));

    return this.prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id },
        data: {
          supplierId: data.supplierId ?? existing.supplierId,
          invoiceNumber: data.invoiceNumber ?? existing.invoiceNumber,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : existing.invoiceDate,
          metalType: totals.metalType,
          purity: totals.purity,
          grossWeight: totals.grossWeight,
          netWeight: totals.netWeight,
          quantity: totals.quantity,
          rate: totals.rate,
          amount: totals.amount,
          makingCharges: totals.makingCharges,
          stoneCharges: totals.stoneCharges,
          otherCharges: totals.otherCharges,
          totalAmount,
          paidAmount,
          balanceAmount,
          notes: data.notes ?? existing.notes,
        },
      });

      // Replace line items
      await tx.purchaseItem.deleteMany({ where: { purchaseId: id } });
      for (const item of itemsRaw) {
        await tx.purchaseItem.create({
          data: {
            purchaseId: id,
            designCode: item.designCode || '',
            category: item.category || '',
            subCategory: item.subCategory || '',
            ornament: item.ornament || '',
            ornamentGender: item.ornamentGender || '',
            hsnCode: item.hsnCode || '7113',
            metalType: item.metalType || totals.metalType,
            purity: item.purity || totals.purity,
            grossWeight: item.grossWeight || 0,
            stoneWeight: item.stoneWeight || 0,
            otherWeight: item.otherWeight || 0,
            netWeight: item.netWeight || 0,
            quantity: item.quantity || 1,
            rate: item.rate || 0,
            makingChargeType: item.makingChargeType || 'PERCENTAGE',
            makingChargeValue: item.makingChargeValue || 10,
            hallmarkNumber: item.hallmarkNumber || '',
            certificateNumber: item.certificateNumber || '',
            stoneCharges: item.stoneCharges || 0,
            otherCharges: item.otherCharges || 0,
            lineAmount: Math.round(((item.netWeight || 0) * (item.rate || 0)) * 100) / 100,
          },
        });
      }

      // Audit
      await tx.auditLog.create({
        data: {
          organizationId,
          branchId,
          userId,
          userName: 'System',
          action: 'UPDATE_PURCHASE',
          entityType: 'Purchase',
          entityId: id,
          oldValue: JSON.stringify({ invoiceNumber: existing.invoiceNumber, totalAmount: existing.totalAmount }),
          newValue: JSON.stringify({ invoiceNumber: data.invoiceNumber || existing.invoiceNumber, totalAmount, items: itemsRaw.length }),
        },
      });

      return tx.purchase.findUnique({ where: { id } });
    });
  }

  async getStats(organizationId: string) {
    const where = { organizationId };
    const [total, totalAmount] = await Promise.all([
      this.prisma.purchase.count({ where }),
      this.prisma.purchase.aggregate({ where, _sum: { totalAmount: true, paidAmount: true, netWeight: true } }),
    ]);

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayPurchases = await this.prisma.purchase.findMany({
      where: { ...where, invoiceDate: { gte: today } },
    });

    return {
      totalPurchases: total,
      totalAmount: totalAmount._sum.totalAmount || 0,
      totalPaid: totalAmount._sum.paidAmount || 0,
      totalOutstanding: (totalAmount._sum.totalAmount || 0) - (totalAmount._sum.paidAmount || 0),
      totalWeight: totalAmount._sum.netWeight || 0,
      todayPurchases: todayPurchases.length,
      todayAmount: todayPurchases.reduce((s, p) => s + p.totalAmount, 0),
    };
  }
}
