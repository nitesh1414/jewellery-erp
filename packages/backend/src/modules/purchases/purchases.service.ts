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
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, supplierId, metalType, purity, startDate, endDate, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

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
        include: { supplier: { select: { name: true, mobile: true } } },
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
      },
    });
    if (!purchase) throw new NotFoundException('Purchase not found');
    return purchase;
  }

  /**
   * Create purchase with optional bulk jewellery item creation
   */
  async create(data: any, organizationId: string, branchId: string, userId: string) {
    // Calculate totals
    const amount = (data.netWeight || 0) * (data.rate || 0);
    const totalAmount = amount
      + (data.makingCharges || 0)
      + (data.stoneCharges || 0)
      + (data.otherCharges || 0)
      + (data.cgst || 0)
      + (data.sgst || 0)
      + (data.igst || 0);
    const paidAmount = data.paidAmount || 0;
    const balanceAmount = totalAmount - paidAmount;

    // Use a transaction to create purchase, items, barcodes, and stock
    const purchase = await this.prisma.$transaction(async (tx) => {
      // Create purchase record
      const record = await tx.purchase.create({
        data: {
          organizationId,
          branchId,
          supplierId: data.supplierId,
          invoiceNumber: data.invoiceNumber,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
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
          cgst: data.cgst || 0,
          sgst: data.sgst || 0,
          igst: data.igst || 0,
          totalAmount,
          paidAmount,
          balanceAmount,
          notes: data.notes,
        },
      });

      // Create jewellery items from purchase (material entry)
      if (data.items && Array.isArray(data.items) && data.items.length > 0) {
        for (const item of data.items) {
          // Generate barcode
          const lastBarcode = await tx.barcode.findFirst({
            where: { organizationId },
            orderBy: { createdAt: 'desc' },
          });
          const nextSeq = lastBarcode
            ? parseInt(lastBarcode.barcode.replace(/\D/g, ''), 10) + 1
            : 1;
          const barcodeStr = `G${String(nextSeq).padStart(8, '0')}`;

          // Create barcode
          await tx.barcode.create({
            data: {
              organizationId,
              branchId,
              barcode: barcodeStr,
              jewelleryItemId: null,
              isAssigned: true,
            },
          });

          // Create jewellery item
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

          // Create stock transaction
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
              reference: data.invoiceNumber,
              notes: `Purchase import: ${data.invoiceNumber}`,
              createdById: userId,
            },
          });
        }
      } else {
        // No items - create a single material stock transaction
        await tx.stockTransaction.create({
          data: {
            organizationId,
            branchId,
            transactionType: 'PURCHASE',
            transactionId: record.id,
            metalType: data.metalType || 'GOLD',
            purity: data.purity || '22K',
            weight: data.netWeight || 0,
            quantity: data.quantity || 1,
            rate: data.rate || 0,
            value: amount,
            reference: data.invoiceNumber,
            notes: `Purchase: ${data.invoiceNumber}`,
            createdById: userId,
          },
        });
      }

      // Update supplier ledger
      await tx.supplierLedger.create({
        data: {
          supplierId: data.supplierId,
          transactionType: 'PURCHASE',
          transactionId: record.id,
          date: new Date(),
          debit: totalAmount,
          credit: paidAmount,
          balance: balanceAmount,
          description: `Purchase ${data.invoiceNumber}`,
        },
      });

      return record;
    });

    return this.prisma.purchase.findUnique({
      where: { id: purchase.id },
      include: { supplier: { select: { name: true } } },
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