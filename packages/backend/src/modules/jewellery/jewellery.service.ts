import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { v4 as uuid } from 'uuid';

@Injectable()
export class JewelleryService {
  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  /**
   * An item made out of a metal ledger takes its GROSS weight out of that
   * ledger and turns it into ornament stock. Re-posting is idempotent: every
   * movement this item owns is removed first, then the current one is written.
   * Pass no metalLedgerAccountId (or a gross weight of 0) and the metal is
   * simply returned to the ledger.
   */
  private async syncMetalMovement(item: any, organizationId: string) {
    await this.ledger.reverseMetalMovements(organizationId, 'JEWELLERY_ITEM', item.id);

    const accountId = item.metalLedgerAccountId;
    const grams = Number(item.grossWeight) || 0;
    if (!accountId || grams <= 0) return null;

    const account = await this.prisma.ledgerAccount.findFirst({
      where: { id: accountId, organizationId },
    });
    if (!account) return null;

    return this.ledger.postMetalMovement({
      organizationId,
      branchId: item.branchId,
      accountId: account.id,
      type: 'DEBIT',
      grams,
      rate: Number(item.currentRate) || 0,
      metalType: item.metalType,
      purity: item.purity,
      date: item.purchaseDate || undefined,
      description:
        `Jewellery item ${item.designCode || item.barcode} — gross ${grams} g from ${account.name} → ornament stock`,
      reference: item.barcode,
      linkedTo: 'JEWELLERY_ITEM',
      linkedId: item.id,
    });
  }

  async findAll(organizationId: string, query: {
    search?: string;
    status?: string;
    metalType?: string;
    purity?: string;
    category?: string;
    designCode?: string;
    supplierId?: string;
    location?: string;
    purchaseDateFrom?: string;
    purchaseDateTo?: string;
    ornament?: string;
    ornamentGender?: string;
    minNetWeight?: string;
    maxNetWeight?: string;
    sort?: string;
    branchId?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      search, status, metalType, purity, category, designCode,
      supplierId, location, purchaseDateFrom, purchaseDateTo,
      ornament, ornamentGender, minNetWeight, maxNetWeight, sort,
      branchId, page = 1, limit = 20,
    } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (branchId) where.branchId = branchId;

    if (status) where.status = status;
    if (metalType) where.metalType = metalType;
    if (purity) where.purity = purity;
    if (category) where.category = category;
    if (designCode) where.designCode = { contains: designCode };
    if (supplierId) where.supplierId = supplierId;
    if (location) where.location = { contains: location };
    if (purchaseDateFrom || purchaseDateTo) {
      where.purchaseDate = {};
      if (purchaseDateFrom) where.purchaseDate.gte = new Date(purchaseDateFrom);
      if (purchaseDateTo) where.purchaseDate.lte = new Date(purchaseDateTo);
    }
    if (ornament) where.ornament = ornament;
    if (ornamentGender) where.ornamentGender = ornamentGender;
    if (minNetWeight || maxNetWeight) {
      where.netWeight = {};
      if (minNetWeight) where.netWeight.gte = Number(minNetWeight);
      if (maxNetWeight) where.netWeight.lte = Number(maxNetWeight);
    }
    const orderBy: any = sort === 'netWeight_asc' ? { netWeight: 'asc' }
      : sort === 'netWeight_desc' ? { netWeight: 'desc' }
      : sort === 'value_desc' ? { currentRate: 'desc' }
      : { createdAt: 'desc' };

    if (search) {
      where.OR = [
        { barcode: { contains: search } },
        { sku: { contains: search } },
        { designCode: { contains: search } },
        { hallmarkNumber: { contains: search } },
        { certificateNumber: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.jewelleryItem.findMany({
        where,
        skip,
        take: +limit,
        orderBy,
        include: {
          product: { select: { name: true, designCode: true } },
        },
      }),
      this.prisma.jewelleryItem.count({ where }),
    ]);

    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  async findById(id: string, organizationId: string) {
    const item = await this.prisma.jewelleryItem.findFirst({
      where: { id, organizationId },
      include: { product: { select: { name: true, description: true } } },
    });
    if (!item) throw new NotFoundException('Jewellery item not found');
    return item;
  }

  async findByBarcode(barcode: string, organizationId: string, branchId?: string) {
    const where: any = { barcode, organizationId };
    if (branchId) where.branchId = branchId;
    const item = await this.prisma.jewelleryItem.findFirst({
      where,
      include: { product: { select: { name: true, designCode: true } } },
    });
    if (!item) throw new NotFoundException('Jewellery item not found with this barcode');
    return item;
  }

  /**
   * Single material entry
   */
  async create(data: any, organizationId: string, branchId: string, userId: string) {
    // Auto-generate barcode if not provided
    let barcode = data.barcode;
    if (!barcode) {
      // Find or create barcode
      const lastBarcode = await this.prisma.barcode.findFirst({
        where: { organizationId },
        orderBy: { createdAt: 'desc' },
      });
      const nextNum = lastBarcode
        ? parseInt(lastBarcode.barcode.replace(/\D/g, ''), 10) + 1
        : 1;
      barcode = `G${String(nextNum).padStart(8, '0')}`;

      await this.prisma.barcode.create({
        data: {
          organizationId,
          branchId,
          barcode,
          jewelleryItemId: null,
          isAssigned: true,
        },
      });
    }

    // If barcode provided, assign it
    if (data.barcode) {
      const existingBarcode = await this.prisma.barcode.findUnique({ where: { barcode: data.barcode } });
      if (existingBarcode) {
        if (existingBarcode.isAssigned && existingBarcode.jewelleryItemId) {
          throw new BadRequestException(`Barcode ${data.barcode} is already assigned to another item`);
        }
        await this.prisma.barcode.update({
          where: { barcode: data.barcode },
          data: { isAssigned: true },
        });
      } else {
        await this.prisma.barcode.create({
          data: {
            organizationId,
            branchId,
            barcode: data.barcode,
            isAssigned: true,
          },
        });
      }
    }

    // A metal ledger was chosen — it must exist before the item is written.
    if (data.metalLedgerAccountId) {
      const account = await this.prisma.ledgerAccount.findFirst({
        where: { id: data.metalLedgerAccountId, organizationId },
      });
      if (!account) throw new BadRequestException('Selected metal ledger account not found');
    }

    // Net Weight = Weight (gross) − Stone Weight (− other weight)
    const grossWeight = Number(data.grossWeight) || 0;
    const stoneWeight = Number(data.stoneWeight) || 0;
    const otherWeight = Number(data.otherWeight) || 0;
    const autoNetWeight = Math.round(Math.max(0, grossWeight - stoneWeight - otherWeight) * 1000) / 1000;
    const netWeight = Number(data.netWeight) > 0 ? Number(data.netWeight) : autoNetWeight;

    const item = await this.prisma.jewelleryItem.create({
      data: {
        organizationId,
        branchId,
        barcode,
        sku: data.sku || `SKU-${Date.now()}`,
        productId: data.productId || null,
        category: data.category || '',
        subCategory: data.subCategory || '',
        designCode: data.designCode || '',
        metalType: data.metalType || 'GOLD',
        purity: data.purity || '22K',
        grossWeight,
        stoneWeight,
        ornament: data.ornament || null,
        ornamentGender: data.ornamentGender || null,
        otherWeight,
        netWeight,
        metalLedgerAccountId: data.metalLedgerAccountId || null,
        quantity: data.quantity || 1,
        size: data.size || '',
        color: data.color || '',
        brand: data.brand || '',
        purchaseRate: data.purchaseRate || data.currentRate || 0,
        currentRate: data.currentRate || 0,
        makingChargeType: data.makingChargeType || 'PERCENTAGE',
        makingChargeValue: data.makingChargeValue || 10,
        hallmarkNumber: data.hallmarkNumber || '',
        certificateNumber: data.certificateNumber || '',
        hsnCode: data.hsnCode || '7113',
        status: data.status || 'IN_STOCK',
        location: data.location || '',
        supplierId: data.supplierId || '',
        purchaseDate: data.purchaseDate ? new Date(data.purchaseDate) : new Date(),
      },
    });

    // Create stock transaction
    await this.prisma.stockTransaction.create({
      data: {
        organizationId,
        branchId,
        transactionType: 'PURCHASE',
        transactionId: item.id,
        jewelleryItemId: item.id,
        barcode: item.barcode,
        metalType: item.metalType,
        purity: item.purity,
        weight: item.netWeight,
        quantity: item.quantity,
        rate: item.currentRate,
        value: item.netWeight * item.currentRate,
        reference: item.barcode,
        notes: `Material entry: ${item.designCode}`,
        createdById: userId,
      },
    });

    // Link the barcode record to the item so it shows in the Barcodes tab
    try {
      await this.prisma.barcode.updateMany({
        where: { barcode, jewelleryItemId: null },
        data: { jewelleryItemId: item.id, isAssigned: true },
      });
    } catch {
      /* barcode record optional */
    }

    // The metal for this ornament leaves the selected metal ledger
    if (data.metalLedgerAccountId) {
      try {
        await this.syncMetalMovement(item, organizationId);
      } catch (e) {
        // Never lose the item because the ledger could not be moved
        console.warn('Metal ledger movement failed for item', item.id, e?.message);
      }
    }

    return item;
  }

  /**
   * Bulk material entry (for purchase import)
   */
  async bulkCreate(items: any[], organizationId: string, branchId: string, userId: string) {
    const created: any[] = [];
    for (const item of items) {
      const result = await this.create(item, organizationId, branchId, userId);
      created.push(result);
    }
    return { items: created, count: created.length };
  }

  async update(id: string, organizationId: string, data: any) {
    const item = await this.prisma.jewelleryItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Jewellery item not found');

    // Convert date strings to Date objects so Prisma accepts them.
    const updateData: any = { ...data };
    if (updateData.purchaseDate && !(updateData.purchaseDate instanceof Date)) {
      updateData.purchaseDate = new Date(updateData.purchaseDate);
    }
    // Changing the barcode is not allowed here (uniqueness protections).
    delete updateData.barcode;
    delete updateData.id;
    delete updateData.organizationId;
    delete updateData.branchId;

    // Keep Net Weight = Weight − Stone Weight in step when weights are edited
    if (
      updateData.grossWeight !== undefined ||
      updateData.stoneWeight !== undefined ||
      updateData.otherWeight !== undefined
    ) {
      const gross = Number(updateData.grossWeight ?? item.grossWeight) || 0;
      const stone = Number(updateData.stoneWeight ?? item.stoneWeight) || 0;
      const other = Number(updateData.otherWeight ?? item.otherWeight) || 0;
      updateData.netWeight = Number(updateData.netWeight) > 0
        ? Number(updateData.netWeight)
        : Math.round(Math.max(0, gross - stone - other) * 1000) / 1000;
    }

    const updated = await this.prisma.jewelleryItem.update({ where: { id }, data: updateData });

    // Weight / rate / metal ledger changed → move the metal again
    const metalTouched = ['metalLedgerAccountId', 'grossWeight', 'currentRate', 'metalType', 'purity', 'purchaseDate']
      .some((key) => updateData[key] !== undefined);
    if (metalTouched) {
      try {
        await this.syncMetalMovement(updated, organizationId);
      } catch (e) {
        console.warn('Metal ledger movement failed for item', id, e?.message);
      }
    }

    return updated;
  }

  /**
   * Delete an item and give its metal back to the ledger it came from.
   */
  async remove(id: string, organizationId: string) {
    const item = await this.prisma.jewelleryItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Jewellery item not found');

    await this.ledger.reverseMetalMovements(organizationId, 'JEWELLERY_ITEM', id);
    await this.prisma.stockTransaction.deleteMany({ where: { jewelleryItemId: id } });
    await this.prisma.barcode.updateMany({
      where: { jewelleryItemId: id },
      data: { jewelleryItemId: null, isAssigned: false },
    });
    return this.prisma.jewelleryItem.delete({ where: { id } });
  }

  /**
   * Status workflow with validation
   */
  async updateStatus(id: string, status: string, organizationId: string, userId?: string) {
    const validTransitions: Record<string, string[]> = {
      IN_STOCK: ['RESERVED', 'IN_MANUFACTURING', 'IN_REPAIR', 'TRANSFERRED', 'MELTED', 'SCRAPPED'],
      RESERVED: ['IN_STOCK', 'SOLD'],
      SOLD: ['RETURNED'],
      RETURNED: ['IN_STOCK', 'EXCHANGED'],
      EXCHANGED: ['IN_STOCK', 'SOLD'],
      IN_REPAIR: ['IN_STOCK', 'SCRAPPED'],
      IN_MANUFACTURING: ['IN_STOCK', 'SCRAPPED'],
      TRANSFERRED: ['IN_STOCK'],
      MELTED: ['SCRAPPED'],
      SCRAPPED: [],
    };

    const item = await this.prisma.jewelleryItem.findFirst({ where: { id, organizationId } });
    if (!item) throw new NotFoundException('Jewellery item not found');

    const allowed = validTransitions[item.status] || [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from ${item.status} to ${status}. Allowed: ${allowed.join(', ')}`,
      );
    }

    const updated = await this.prisma.jewelleryItem.update({
      where: { id },
      data: { status },
    });

    // Create stock transaction for status changes
    await this.prisma.stockTransaction.create({
      data: {
        organizationId,
        branchId: item.branchId,
        transactionType: 'ADJUSTMENT',
        transactionId: id,
        jewelleryItemId: id,
        barcode: item.barcode,
        metalType: item.metalType,
        purity: item.purity,
        weight: 0,
        quantity: 0,
        rate: item.currentRate,
        value: 0,
        reference: `STATUS: ${item.status} → ${status}`,
        notes: `Status changed from ${item.status} to ${status}`,
        createdById: userId,
      },
    });

    return updated;
  }

  async getCategories(organizationId: string) {
    const items = await this.prisma.jewelleryItem.findMany({
      where: { organizationId },
      select: { category: true, subCategory: true },
      distinct: ['category', 'subCategory'],
    });
    const categories = new Set(items.map(i => i.category).filter(Boolean));
    return Array.from(categories);
  }

  async getStats(organizationId: string, branchId?: string) {
    const where: any = { organizationId };
    if (branchId) where.branchId = branchId;
    const items = await this.prisma.jewelleryItem.findMany({
      where,
    });

    const inStock = items.filter(i => i.status === 'IN_STOCK');
    const totalMetalValue = inStock.reduce((s, i) => s + i.netWeight * i.currentRate, 0);

    return {
      totalItems: items.length,
      inStock: inStock.length,
      sold: items.filter(i => i.status === 'SOLD').length,
      inManufacturing: items.filter(i => i.status === 'IN_MANUFACTURING').length,
      inRepair: items.filter(i => i.status === 'IN_REPAIR').length,
      totalValue: totalMetalValue,
      totalWeight: inStock.reduce((s, i) => s + i.netWeight, 0),
      goldWeight: inStock.filter(i => i.metalType === 'GOLD').reduce((s, i) => s + i.netWeight, 0),
      silverWeight: inStock.filter(i => i.metalType === 'SILVER').reduce((s, i) => s + i.netWeight, 0),
    };
  }
}