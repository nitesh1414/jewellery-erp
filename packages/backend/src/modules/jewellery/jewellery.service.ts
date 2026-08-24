import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { v4 as uuid } from 'uuid';

@Injectable()
export class JewelleryService {
  constructor(private prisma: PrismaService) {}

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
    page?: number;
    limit?: number;
  }) {
    const {
      search, status, metalType, purity, category, designCode,
      supplierId, location, purchaseDateFrom, purchaseDateTo,
      ornament, ornamentGender, minNetWeight, maxNetWeight, sort,
      page = 1, limit = 20,
    } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

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

  async findByBarcode(barcode: string, organizationId: string) {
    const item = await this.prisma.jewelleryItem.findFirst({
      where: { barcode, organizationId },
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
        grossWeight: data.grossWeight || 0,
        stoneWeight: data.stoneWeight || 0,
        ornament: data.ornament || null,
        ornamentGender: data.ornamentGender || null,
        otherWeight: data.otherWeight || 0,
        netWeight: data.netWeight || 0,
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

    return this.prisma.jewelleryItem.update({ where: { id }, data: updateData });
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

  async getStats(organizationId: string) {
    const items = await this.prisma.jewelleryItem.findMany({
      where: { organizationId },
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