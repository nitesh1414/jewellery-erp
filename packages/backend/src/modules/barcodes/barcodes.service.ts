import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class BarcodesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, query: {
    search?: string;
    isAssigned?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, isAssigned, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;
    const where: any = { organizationId };

    if (search) where.barcode = { contains: search };
    if (isAssigned !== undefined) where.isAssigned = isAssigned === 'true';

    const [items, total] = await Promise.all([
      this.prisma.barcode.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        include: { jewelleryItem: { select: { designCode: true, purity: true, netWeight: true, sku: true } } },
      }),
      this.prisma.barcode.count({ where }),
    ]);

    return { items, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  /**
   * Get next sequence number for barcode generation
   */
  async getNextSequence(organizationId: string, prefix: string = 'G'): Promise<number> {
    const last = await this.prisma.barcode.findFirst({
      where: {
        organizationId,
        barcode: { startsWith: prefix },
      },
      orderBy: { createdAt: 'desc' },
    });
    if (!last) return 1;
    const num = parseInt(last.barcode.replace(prefix, ''), 10);
    return isNaN(num) ? 1 : num + 1;
  }

  /**
   * Generate batch barcodes
   */
  async generate(organizationId: string, branchId: string, count: number = 1, prefix: string = 'G') {
    if (count < 1 || count > 500) {
      throw new BadRequestException('Count must be between 1 and 500');
    }

    const nextSeq = await this.getNextSequence(organizationId, prefix);
    const barcodes: any[] = [];

    for (let i = 0; i < count; i++) {
      const seq = nextSeq + i;
      const barcodeStr = `${prefix}${String(seq).padStart(8, '0')}`;

      const barcode = await this.prisma.barcode.create({
        data: {
          organizationId,
          branchId,
          barcode: barcodeStr,
          isAssigned: false,
          isActive: true,
          printedCount: 0,
        },
      });
      barcodes.push(barcode);
    }

    return { barcodes, count, prefix, startSequence: nextSeq, endSequence: nextSeq + count - 1 };
  }

  /**
   * Generate barcodes from a list of jewellery items (post-purchase)
   */
  async generateForJewelleryItems(
    organizationId: string,
    branchId: string,
    items: { id: string; barcode?: string }[],
  ) {
    const results: any[] = [];
    for (const item of items) {
      let barcodeStr = item.barcode;
      if (!barcodeStr) {
        const seq = await this.getNextSequence(organizationId, 'G');
        barcodeStr = `G${String(seq).padStart(8, '0')}`;
      }

      // Check barcode uniqueness
      const existingBarcode = await this.prisma.barcode.findUnique({ where: { barcode: barcodeStr } });
      if (existingBarcode) {
        throw new BadRequestException(`Barcode ${barcodeStr} already exists`);
      }

      const barcode = await this.prisma.barcode.create({
        data: {
          organizationId,
          branchId,
          barcode: barcodeStr,
          jewelleryItemId: item.id,
          isAssigned: true,
          printedCount: 0,
        },
      });

      // Update jewellery item with barcode
      await this.prisma.jewelleryItem.update({
        where: { id: item.id },
        data: { barcode: barcodeStr },
      });

      results.push(barcode);
    }
    return results;
  }

  /**
   * Assign barcode to jewellery item
   */
  async assignToJewellery(barcodeId: string, jewelleryItemId: string) {
    const barcode = await this.prisma.barcode.findUnique({ where: { id: barcodeId } });
    if (!barcode) throw new NotFoundException('Barcode not found');
    if (barcode.isAssigned) throw new BadRequestException('Barcode already assigned');

    const item = await this.prisma.jewelleryItem.findUnique({ where: { id: jewelleryItemId } });
    if (!item) throw new NotFoundException('Jewellery item not found');

    // Check if item already has a barcode
    if (item.barcode) {
      // Unassign old barcode
      await this.prisma.barcode.updateMany({
        where: { barcode: item.barcode },
        data: { jewelleryItemId: null, isAssigned: false },
      });
    }

    await this.prisma.jewelleryItem.update({
      where: { id: jewelleryItemId },
      data: { barcode: barcode.barcode },
    });

    return this.prisma.barcode.update({
      where: { id: barcodeId },
      data: { jewelleryItemId, isAssigned: true },
    });
  }

  /**
   * Unassign barcode from jewellery
   */
  async unassign(barcodeId: string) {
    const barcode = await this.prisma.barcode.findUnique({ where: { id: barcodeId } });
    if (!barcode) throw new NotFoundException('Barcode not found');

    // Clear barcode on jewellery item
    if (barcode.jewelleryItemId) {
      await this.prisma.jewelleryItem.update({
        where: { id: barcode.jewelleryItemId },
        data: { barcode: '' },
      });
    }

    return this.prisma.barcode.update({
      where: { id: barcodeId },
      data: { jewelleryItemId: null, isAssigned: false },
    });
  }

  /**
   * Track barcode printing
   */
  async trackPrint(barcodeId: string) {
    const barcode = await this.prisma.barcode.findUnique({ where: { id: barcodeId } });
    if (!barcode) throw new NotFoundException('Barcode not found');

    return this.prisma.barcode.update({
      where: { id: barcodeId },
      data: { printedCount: { increment: 1 }, lastPrintedAt: new Date() },
    });
  }

  /**
   * Track batch print
   */
  async trackBatchPrint(barcodeIds: string[]) {
    const now = new Date();
    const results: any[] = [];
    for (const id of barcodeIds) {
      const barcode = await this.prisma.barcode.findUnique({ where: { id } });
      if (!barcode) continue;
      const updated = await this.prisma.barcode.update({
        where: { id },
        data: { printedCount: { increment: 1 }, lastPrintedAt: now },
      });
      results.push(updated);
    }
    return results;
  }

  /**
   * Get label data for printing (shop info + item details)
   */
  async getLabelData(barcode: string, organizationId: string) {
    const barcodeRecord = await this.prisma.barcode.findUnique({
      where: { barcode },
      include: {
        jewelleryItem: true,
        organization: { include: { settings: true } },
      },
    });

    if (!barcodeRecord) throw new NotFoundException('Barcode not found');

    const item = barcodeRecord.jewelleryItem;
    const settings = barcodeRecord.organization?.settings;

    return {
      shopName: settings?.shopName || 'Jewellery Shop',
      barcode: barcodeRecord.barcode,
      productName: item?.designCode || '',
      purity: item?.purity || '',
      weight: item?.netWeight ? `${item.netWeight.toFixed(3)}g` : '',
      grossWeight: item?.grossWeight ? `${item.grossWeight.toFixed(3)}g` : '',
      rate: item?.currentRate ? `₹${item.currentRate.toLocaleString('en-IN')}` : '',
      sku: item?.sku || '',
      makingCharge: item?.makingChargeType || '',
      status: item?.status || 'UNASSIGNED',
    };
  }

  /**
   * Search barcode by scanning (returns full item if assigned)
   */
  async scan(barcode: string, organizationId: string) {
    // First try to find the item directly in jewellery
    const item = await this.prisma.jewelleryItem.findFirst({
      where: { barcode, organizationId },
      include: { product: { select: { name: true } } },
    });

    if (item) {
      return { type: 'JEWELLERY_ITEM', item, barcode: item.barcode };
    }

    // Fall back to barcode-only
    const barcodeRecord = await this.prisma.barcode.findUnique({
      where: { barcode },
    });

    if (!barcodeRecord) {
      throw new NotFoundException('Barcode not found in inventory');
    }

    return { type: 'BARCODE_ONLY', barcode: barcodeRecord };
  }

  /**
   * Get barcode statistics
   */
  async getStats(organizationId: string) {
    const [total, assigned, unassigned, printedToday] = await Promise.all([
      this.prisma.barcode.count({ where: { organizationId } }),
      this.prisma.barcode.count({ where: { organizationId, isAssigned: true } }),
      this.prisma.barcode.count({ where: { organizationId, isAssigned: false } }),
      this.prisma.barcode.count({
        where: {
          organizationId,
          lastPrintedAt: {
            gte: new Date(new Date().setHours(0, 0, 0, 0)),
          },
        },
      }),
    ]);

    return { total, assigned, unassigned, printedToday };
  }
}