import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

/**
 * Ornament master ("ledger master") — catalogue of ornaments with a
 * male / female / unisex classification used across inventory, billing
 * and job work. An ornament can be linked to a metal ledger (metal + purity),
 * which lets the item-entry forms filter the list and show live stock.
 */
@Injectable()
export class OrnamentsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Live stock per ornament (in-stock jewellery items), keyed by ornament name
   * and by name + metal + purity so a form can show the figure that matters.
   */
  private async getStockByOrnament(organizationId: string, branchId?: string) {
    const where: any = { organizationId, status: 'IN_STOCK' };
    if (branchId) where.branchId = branchId;
    const rows = await this.prisma.jewelleryItem.groupBy({
      by: ['ornament', 'metalType', 'purity'],
      where: { ...where, ornament: { not: null } },
      _sum: { netWeight: true, quantity: true },
      _count: true,
    });

    const byName = new Map<string, { pieces: number; weight: number }>();
    const byNameMetal = new Map<string, { pieces: number; weight: number }>();
    for (const row of rows) {
      const name = String(row.ornament || '').trim();
      if (!name) continue;
      const pieces = Number(row._sum.quantity) || Number(row._count) || 0;
      const weight = Number(row._sum.netWeight) || 0;
      const key = name.toLowerCase();
      const total = byName.get(key) || { pieces: 0, weight: 0 };
      byName.set(key, { pieces: total.pieces + pieces, weight: Math.round((total.weight + weight) * 1000) / 1000 });
      const metalKey = `${key}|${String(row.metalType || '').toUpperCase()}|${String(row.purity || '').toUpperCase()}`;
      const metalTotal = byNameMetal.get(metalKey) || { pieces: 0, weight: 0 };
      byNameMetal.set(metalKey, { pieces: metalTotal.pieces + pieces, weight: Math.round((metalTotal.weight + weight) * 1000) / 1000 });
    }
    return { byName, byNameMetal };
  }

  async findAll(
    organizationId: string,
    query: { search?: string; gender?: string; category?: string; isActive?: string; metalLedgerAccountId?: string },
    branchId?: string,
  ) {
    const where: any = { organizationId };
    if (query.gender) where.gender = query.gender;
    if (query.category) where.category = query.category;
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    if (query.metalLedgerAccountId) where.metalLedgerAccountId = query.metalLedgerAccountId;
    if (query.search) {
      where.OR = [{ name: { contains: query.search } }, { category: { contains: query.search } }];
    }
    const [items, counts, stock] = await Promise.all([
      this.prisma.ornamentType.findMany({ where, orderBy: [{ gender: 'asc' }, { name: 'asc' }] }),
      this.prisma.ornamentType.groupBy({ by: ['gender'], where: { organizationId }, _count: true }),
      this.getStockByOrnament(organizationId, branchId),
    ]);

    const withStock = items.map((o: any) => {
      const key = String(o.name || '').toLowerCase();
      const total = stock.byName.get(key) || { pieces: 0, weight: 0 };
      return {
        ...o,
        stockPieces: total.pieces,
        stockWeight: total.weight,
      };
    });

    return { items: withStock, counts };
  }

  /**
   * Ornament list with stock for the metal + purity of a metal ledger —
   * used by the item-entry forms.
   */
  async findAllWithStock(
    organizationId: string,
    query: { metalLedgerAccountId?: string; metalType?: string; purity?: string; isActive?: string },
    branchId?: string,
  ) {
    let metalType = (query.metalType || '').toUpperCase();
    let purity = (query.purity || '').toUpperCase();

    // No metal given? Take it from the selected metal ledger.
    if (query.metalLedgerAccountId && (!metalType || !purity)) {
      const account = await this.prisma.ledgerAccount.findFirst({
        where: { id: query.metalLedgerAccountId, organizationId },
      });
      if (account) {
        metalType = (account.metalType || '').toUpperCase();
        purity = (account.purity || '').toUpperCase();
      }
    }

    const where: any = { organizationId };
    if (query.isActive === 'true') where.isActive = true;
    if (query.metalLedgerAccountId) where.metalLedgerAccountId = query.metalLedgerAccountId;

    const [items, stock] = await Promise.all([
      this.prisma.ornamentType.findMany({ where, orderBy: [{ name: 'asc' }] }),
      this.getStockByOrnament(organizationId, branchId),
    ]);

    return items.map((o: any) => {
      const key = String(o.name || '').toLowerCase();
      const metalKey = `${key}|${metalType}|${purity}`;
      const metalStock = stock.byNameMetal.get(metalKey);
      const total = stock.byName.get(key) || { pieces: 0, weight: 0 };
      return {
        ...o,
        stockPieces: metalStock ? metalStock.pieces : 0,
        stockWeight: metalStock ? metalStock.weight : 0,
        totalPieces: total.pieces,
        totalWeight: total.weight,
        metalType,
        purity,
      };
    });
  }

  async create(data: any, organizationId: string) {
    if (!data.name?.trim()) throw new BadRequestException('Ornament name is required');
    const gender = ['MALE', 'FEMALE', 'UNISEX'].includes(data.gender) ? data.gender : 'UNISEX';
    const exists = await this.prisma.ornamentType.findFirst({ where: { organizationId, name: data.name.trim() } });
    if (exists) throw new BadRequestException(`"${data.name}" already exists in the master`);
    return this.prisma.ornamentType.create({
      data: {
        organizationId,
        name: data.name.trim(),
        gender,
        category: data.category || null,
        notes: data.notes || null,
        metalLedgerAccountId: data.metalLedgerAccountId || null,
      },
    });
  }

  async update(id: string, data: any, organizationId: string) {
    const existing = await this.prisma.ornamentType.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Ornament not found');
    const update: any = {};
    if (data.name !== undefined) update.name = data.name.trim();
    if (data.gender !== undefined) update.gender = ['MALE', 'FEMALE', 'UNISEX'].includes(data.gender) ? data.gender : existing.gender;
    if (data.category !== undefined) update.category = data.category;
    if (data.notes !== undefined) update.notes = data.notes;
    if (data.isActive !== undefined) update.isActive = !!data.isActive;
    if (data.metalLedgerAccountId !== undefined) update.metalLedgerAccountId = data.metalLedgerAccountId || null;
    return this.prisma.ornamentType.update({ where: { id }, data: update });
  }

  async remove(id: string, organizationId: string) {
    const existing = await this.prisma.ornamentType.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Ornament not found');
    await this.prisma.ornamentType.delete({ where: { id } });
    return { deleted: true };
  }
}
