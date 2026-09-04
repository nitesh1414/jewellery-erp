import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Inventory summary for dashboard
   */
  async getSummary(organizationId: string, branchId?: string) {
    const where: any = { organizationId, status: 'IN_STOCK' };
    if (branchId) where.branchId = branchId;

    const items = await this.prisma.jewelleryItem.findMany({ where });

    const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
    const totalPieces = items.length;
    const totalGoldWeight = items
      .filter(i => i.metalType === 'GOLD')
      .reduce((sum, i) => sum + i.netWeight, 0);
    const totalSilverWeight = items
      .filter(i => i.metalType === 'SILVER')
      .reduce((sum, i) => sum + i.netWeight, 0);
    const totalValue = items.reduce((sum, i) => sum + i.netWeight * i.currentRate, 0);
    const totalPurchaseValue = items.reduce((sum, i) => sum + i.netWeight * i.purchaseRate, 0);

    // Stock by purity
    const byPurity = new Map<string, { purity: string; weight: number; value: number; count: number }>();
    for (const item of items) {
      const key = `${item.metalType}-${item.purity}`;
      const existing = byPurity.get(key) || { purity: `${item.metalType} ${item.purity}`, weight: 0, value: 0, count: 0 };
      existing.weight += item.netWeight;
      existing.value += item.netWeight * item.currentRate;
      existing.count += item.quantity;
      byPurity.set(key, existing);
    }

    return {
      totalItems,
      totalPieces,
      totalGoldWeight: Math.round(totalGoldWeight * 1000) / 1000,
      totalSilverWeight: Math.round(totalSilverWeight * 1000) / 1000,
      totalValue: Math.round(totalValue),
      totalPurchaseValue: Math.round(totalPurchaseValue),
      estimatedProfit: Math.round(totalValue - totalPurchaseValue),
      stockByPurity: Array.from(byPurity.values()),
    };
  }

  /**
   * Stock in grams held in the metal / material ledgers (type = METAL),
   * grouped by metal + purity. Gram balances are recomputed from the ledger
   * entries (opening grams + credited − debited) so the figure is always live.
   */
  async getMetalLedgerStock(organizationId: string, branchId?: string) {
    const accountWhere: any = { organizationId, type: 'METAL', isActive: true };
    if (branchId) {
      accountWhere.OR = [{ branchId }, { branchId: null }];
    }
    const accounts = await this.prisma.ledgerAccount.findMany({
      where: accountWhere,
      orderBy: [{ metalType: 'asc' }, { purity: 'asc' }],
    });
    if (accounts.length === 0) return [];

    const movements = await this.prisma.ledgerEntry.groupBy({
      by: ['accountId', 'type'],
      where: { accountId: { in: accounts.map((a) => a.id) }, linkedTo: { not: 'OPENING' } },
      _sum: { grams: true, amount: true },
    });

    const byAccount = new Map<string, { grams: number; amount: number }>();
    for (const m of movements) {
      const entry = byAccount.get(m.accountId) || { grams: 0, amount: 0 };
      const sign = m.type === 'CREDIT' ? 1 : -1;
      entry.grams += (Number(m._sum.grams) || 0) * sign;
      entry.amount += (Number(m._sum.amount) || 0) * sign;
      byAccount.set(m.accountId, entry);
    }

    return accounts.map((a) => {
      const move = byAccount.get(a.id) || { grams: 0, amount: 0 };
      const grams = Math.round((Number(a.openingGrams || 0) + move.grams) * 1000) / 1000;
      const value = Math.round((Number(a.openingBalance || 0) + move.amount) * 100) / 100;
      return {
        metalType: (a.metalType || 'METAL').toUpperCase(),
        purity: a.purity || '',
        grams,
        value,
        ledgerAccountId: a.id,
        ledgerAccountName: a.name,
        rate: grams > 0 ? Math.round((value / grams) * 100) / 100 : 0,
      };
    });
  }

  /**
   * Stock balance by metal type and purity.
   *
   * Combines the ornament stock held as jewellery items with the raw
   * metal / material stock held in the metal ledgers, so one table answers
   * "how much of this metal + purity do we have".
   */
  async getStockBalance(organizationId: string, branchId?: string) {
    const where: any = { organizationId, status: 'IN_STOCK' };
    if (branchId) where.branchId = branchId;

    const items = await this.prisma.jewelleryItem.findMany({ where });
    const metalLedgers = await this.getMetalLedgerStock(organizationId, branchId);

    // Group by metal type and purity
    const grouped = new Map<string, {
      metalType: string;
      purity: string;
      totalWeight: number;
      totalQuantity: number;
      totalValue: number;
      totalPurchaseValue: number;
      pieceCount: number;
    }>();

    for (const item of items) {
      const key = `${item.metalType}-${item.purity}`;
      const existing = grouped.get(key) || {
        metalType: item.metalType,
        purity: item.purity,
        totalWeight: 0,
        totalQuantity: 0,
        totalValue: 0,
        totalPurchaseValue: 0,
        pieceCount: 0,
      };
      existing.totalWeight += item.netWeight;
      existing.totalQuantity += item.quantity;
      existing.totalValue += item.netWeight * item.currentRate;
      existing.totalPurchaseValue += item.netWeight * item.purchaseRate;
      existing.pieceCount += 1;
      grouped.set(key, existing);
    }

    // Ornament stock, keyed by "METAL|PURITY"
    const ornamentStock = new Map<string, {
      metalType: string;
      purity: string;
      ornamentWeight: number;
      totalQuantity: number;
      totalValue: number;
      totalPurchaseValue: number;
      pieceCount: number;
    }>();
    for (const s of grouped.values()) {
      ornamentStock.set(`${s.metalType}|${s.purity}`.toUpperCase(), {
        metalType: s.metalType,
        purity: s.purity,
        ornamentWeight: Math.round(s.totalWeight * 1000) / 1000,
        totalQuantity: s.totalQuantity,
        totalValue: Math.round(s.totalValue),
        totalPurchaseValue: Math.round(s.totalPurchaseValue),
        pieceCount: s.pieceCount,
      });
    }

    // Metal / material stock coming from the metal ledger accounts
    const metalStock = new Map<string, {
      metalType: string;
      purity: string;
      metalWeight: number;
      metalValue: number;
      ledgerAccountId: string;
      ledgerAccountName: string;
      rate: number;
    }>();
    for (const m of metalLedgers) {
      const key = `${m.metalType}|${m.purity}`.toUpperCase();
      const existing = metalStock.get(key);
      if (existing) {
        existing.metalWeight = Math.round((existing.metalWeight + m.grams) * 1000) / 1000;
        existing.metalValue = Math.round(existing.metalValue + m.value);
      } else {
        metalStock.set(key, {
          metalType: m.metalType,
          purity: m.purity,
          metalWeight: m.grams,
          metalValue: m.value,
          ledgerAccountId: m.ledgerAccountId,
          ledgerAccountName: m.ledgerAccountName,
          rate: m.rate,
        });
      }
    }

    // One row per metal + purity that holds ornaments, metal, or both
    const keys = Array.from(new Set([...ornamentStock.keys(), ...metalStock.keys()]));
    const stock = keys.map((key) => {
      const o = ornamentStock.get(key);
      const m = metalStock.get(key);
      const metalType = (o?.metalType || m?.metalType || '').toUpperCase();
      const purity = o?.purity || m?.purity || '';
      const metalWeight = m?.metalWeight || 0;
      const ornamentWeight = o?.ornamentWeight || 0;
      return {
        metalType,
        purity,
        // metalWeight: raw metal / material held in the metal ledger (grams)
        metalWeight: Math.round(metalWeight * 1000) / 1000,
        // ornamentWeight: net weight of the jewellery items in stock (grams)
        ornamentWeight: Math.round(ornamentWeight * 1000) / 1000,
        // totalWeight: everything available for this metal + purity
        totalWeight: Math.round((metalWeight + ornamentWeight) * 1000) / 1000,
        totalQuantity: o?.totalQuantity || 0,
        pieceCount: o?.pieceCount || 0,
        totalValue: Math.round((o?.totalValue || 0) + (m?.metalValue || 0)),
        totalPurchaseValue: Math.round(o?.totalPurchaseValue || 0),
        metalValue: Math.round(m?.metalValue || 0),
        ledgerAccountId: m?.ledgerAccountId || null,
        ledgerAccountName: m?.ledgerAccountName || null,
        metalRate: m?.rate || 0,
      };
    }).sort((a, b) => a.metalType.localeCompare(b.metalType) || a.purity.localeCompare(b.purity));

    const grandTotal = {
      totalWeight: Math.round(stock.reduce((s, i) => s + i.totalWeight, 0) * 1000) / 1000,
      metalWeight: Math.round(stock.reduce((s, i) => s + i.metalWeight, 0) * 1000) / 1000,
      ornamentWeight: Math.round(stock.reduce((s, i) => s + i.ornamentWeight, 0) * 1000) / 1000,
      totalValue: Math.round(stock.reduce((s, i) => s + i.totalValue, 0)),
      totalPurchaseValue: Math.round(stock.reduce((s, i) => s + i.totalPurchaseValue, 0)),
      totalPieces: stock.reduce((s, i) => s + i.pieceCount, 0),
    };

    return { stock, grandTotal, metalLedgers };
  }

  /**
   * Stock transactions with filters
   */
  async getTransactions(organizationId: string, query: {
    metalType?: string;
    purity?: string;
    transactionType?: string;
    jewelleryItemId?: string;
    barcode?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const {
      metalType, purity, transactionType, jewelleryItemId, barcode,
      startDate, endDate, page = 1, limit = 20,
    } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (metalType) where.metalType = metalType;
    if (purity) where.purity = purity;
    if (transactionType) where.transactionType = transactionType;
    if (jewelleryItemId) where.jewelleryItemId = jewelleryItemId;
    if (barcode) where.barcode = { contains: barcode };
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) where.createdAt.gte = new Date(startDate);
      if (endDate) where.createdAt.lte = new Date(endDate + 'T23:59:59.999Z');
    }

    const [items, total] = await Promise.all([
      this.prisma.stockTransaction.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.stockTransaction.count({ where }),
    ]);

    // Calculate running balance
    let runningBalance = 0;
    const transactionsWithBalance = items.map(t => {
      runningBalance += t.weight;
      return { ...t, runningBalance: Math.round(runningBalance * 1000) / 1000 };
    });

    return { items: transactionsWithBalance, total, page: +page, limit: +limit, totalPages: Math.ceil(total / +limit) };
  }

  /**
   * Low stock alerts (items with quantity <= threshold)
   */
  async getLowStockAlerts(organizationId: string, branchId?: string, threshold: number = 2) {
    const where: any = { organizationId, status: 'IN_STOCK' };
    if (branchId) where.branchId = branchId;

    const items = await this.prisma.jewelleryItem.findMany({
      where: { ...where, quantity: { lte: threshold } },
      orderBy: { quantity: 'asc' },
    });

    return {
      alerts: items.map(i => ({
        id: i.id,
        barcode: i.barcode,
        designCode: i.designCode,
        purity: i.purity,
        metalType: i.metalType,
        currentQuantity: i.quantity,
        threshold,
        netWeight: i.netWeight,
        value: i.netWeight * i.currentRate,
      })),
      totalItems: items.length,
      threshold,
    };
  }

  /**
   * Stock adjustment with reason
   */
  async adjustStock(data: {
    organizationId: string;
    branchId: string;
    jewelleryItemId: string;
    adjustmentType: 'WEIGHT' | 'QUANTITY' | 'VALUE' | 'STATUS' | 'LOCATION';
    newWeight?: number;
    newQuantity?: number;
    newRate?: number;
    newStatus?: string;
    newLocation?: string;
    reason: string;
    userId: string;
  }) {
    const item = await this.prisma.jewelleryItem.findFirst({
      where: { id: data.jewelleryItemId, organizationId: data.organizationId },
    });
    if (!item) throw new NotFoundException('Jewellery item not found');

    const oldValues = {
      netWeight: item.netWeight,
      quantity: item.quantity,
      currentRate: item.currentRate,
      status: item.status,
      location: item.location,
    };

    const updateData: any = {};
    if (data.adjustmentType === 'WEIGHT' && data.newWeight !== undefined) {
      updateData.netWeight = data.newWeight;
    }
    if (data.adjustmentType === 'QUANTITY' && data.newQuantity !== undefined) {
      updateData.quantity = data.newQuantity;
    }
    if (data.adjustmentType === 'VALUE' && data.newRate !== undefined) {
      updateData.currentRate = data.newRate;
    }
    if (data.adjustmentType === 'STATUS' && data.newStatus) {
      updateData.status = data.newStatus;
    }
    if (data.adjustmentType === 'LOCATION' && data.newLocation !== undefined) {
      updateData.location = data.newLocation;
    }

    if (Object.keys(updateData).length === 0) {
      throw new BadRequestException('No valid adjustment fields provided');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.jewelleryItem.update({
        where: { id: data.jewelleryItemId },
        data: updateData,
      });

      await tx.stockTransaction.create({
        data: {
          organizationId: data.organizationId,
          branchId: data.branchId,
          transactionType: 'ADJUSTMENT',
          transactionId: data.jewelleryItemId,
          jewelleryItemId: data.jewelleryItemId,
          barcode: item.barcode,
          metalType: item.metalType,
          purity: item.purity,
          weight: data.adjustmentType === 'WEIGHT' && data.newWeight !== undefined
            ? data.newWeight - item.netWeight : 0,
          quantity: data.adjustmentType === 'QUANTITY' && data.newQuantity !== undefined
            ? data.newQuantity - item.quantity : 0,
          rate: data.newRate || item.currentRate,
          value: 0,
          reference: `ADJ-${Date.now()}`,
          notes: `${data.adjustmentType}: ${data.reason}`,
          createdById: data.userId,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: data.organizationId,
          branchId: data.branchId,
          userId: data.userId,
          userName: 'System',
          action: 'STOCK_ADJUSTMENT',
          entityType: 'JewelleryItem',
          entityId: data.jewelleryItemId,
          oldValue: JSON.stringify(oldValues),
          newValue: JSON.stringify(updateData),
        },
      });
    });

    return { message: 'Stock adjusted successfully', changes: updateData };
  }

  /**
   * Transfer item between branches
   */
  async transferStock(data: {
    organizationId: string;
    fromBranchId: string;
    toBranchId: string;
    jewelleryItemId: string;
    userId: string;
    notes?: string;
  }) {
    const item = await this.prisma.jewelleryItem.findFirst({
      where: { id: data.jewelleryItemId, organizationId: data.organizationId },
    });
    if (!item) throw new NotFoundException('Jewellery item not found');
    if (item.status !== 'IN_STOCK') {
      throw new BadRequestException('Only items in stock can be transferred');
    }

    await this.prisma.$transaction(async (tx) => {
      // Update item branch
      await tx.jewelleryItem.update({
        where: { id: data.jewelleryItemId },
        data: { branchId: data.toBranchId },
      });

      // Outgoing transaction
      await tx.stockTransaction.create({
        data: {
          organizationId: data.organizationId,
          branchId: data.fromBranchId,
          transactionType: 'TRANSFER',
          transactionId: data.jewelleryItemId,
          jewelleryItemId: data.jewelleryItemId,
          barcode: item.barcode,
          metalType: item.metalType,
          purity: item.purity,
          weight: -item.netWeight,
          quantity: -item.quantity,
          rate: item.currentRate,
          value: -(item.netWeight * item.currentRate),
          reference: `TRANSFER-OUT-${data.toBranchId}`,
          notes: data.notes || `Transfer to branch ${data.toBranchId}`,
          createdById: data.userId,
        },
      });

      // Incoming transaction
      await tx.stockTransaction.create({
        data: {
          organizationId: data.organizationId,
          branchId: data.toBranchId,
          transactionType: 'TRANSFER',
          transactionId: data.jewelleryItemId,
          jewelleryItemId: data.jewelleryItemId,
          barcode: item.barcode,
          metalType: item.metalType,
          purity: item.purity,
          weight: item.netWeight,
          quantity: item.quantity,
          rate: item.currentRate,
          value: item.netWeight * item.currentRate,
          reference: `TRANSFER-IN-${data.fromBranchId}`,
          notes: data.notes || `Transfer from branch ${data.fromBranchId}`,
          createdById: data.userId,
        },
      });
    });

    return { message: 'Stock transferred successfully' };
  }

  /**
   * Get all transaction types for filtering
   */
  async getTransactionTypes() {
    return [
      'PURCHASE', 'SALE', 'SALE_RETURN', 'MANUFACTURING_ISSUE',
      'MANUFACTURING_RETURN', 'EXCHANGE_OUT', 'EXCHANGE_IN',
      'URD_RECEIVE', 'TRANSFER', 'ADJUSTMENT', 'MELTING', 'SCRAPPED',
      'OPENING_BALANCE',
    ];
  }

  /**
   * Stock valuation report
   */
  async getValuation(organizationId: string, branchId?: string) {
    const where: any = { organizationId, status: 'IN_STOCK' };
    if (branchId) where.branchId = branchId;

    const items = await this.prisma.jewelleryItem.findMany({ where });

    const valuation = {
      totalItems: items.length,
      totalWeight: Math.round(items.reduce((s, i) => s + i.netWeight, 0) * 1000) / 1000,
      totalCurrentValue: Math.round(items.reduce((s, i) => s + i.netWeight * i.currentRate, 0)),
      totalPurchaseValue: Math.round(items.reduce((s, i) => s + i.netWeight * i.purchaseRate, 0)),
      unrealizedProfit: Math.round(
        items.reduce((s, i) => s + i.netWeight * (i.currentRate - i.purchaseRate), 0)
      ),
      byMetal: {} as Record<string, { weight: number; value: number; purchaseValue: number; count: number }>,
    };

    for (const item of items) {
      const metal = item.metalType;
      if (!valuation.byMetal[metal]) {
        valuation.byMetal[metal] = { weight: 0, value: 0, purchaseValue: 0, count: 0 };
      }
      valuation.byMetal[metal].weight += item.netWeight;
      valuation.byMetal[metal].value += item.netWeight * item.currentRate;
      valuation.byMetal[metal].purchaseValue += item.netWeight * item.purchaseRate;
      valuation.byMetal[metal].count += item.quantity;
    }

    for (const metal of Object.keys(valuation.byMetal)) {
      const v = valuation.byMetal[metal];
      v.weight = Math.round(v.weight * 1000) / 1000;
      v.value = Math.round(v.value);
      v.purchaseValue = Math.round(v.purchaseValue);
    }

    return valuation;
  }

  /**
   * Dead stock (items not sold in X days)
   */
  async getDeadStock(organizationId: string, days: number = 180, branchId?: string) {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - days);

    const where: any = {
      organizationId,
      status: 'IN_STOCK',
      purchaseDate: { lte: threshold },
    };
    if (branchId) where.branchId = branchId;

    const items = await this.prisma.jewelleryItem.findMany({
      where,
      orderBy: { purchaseDate: 'asc' },
    });

    return {
      items: items.map(i => ({
        id: i.id,
        barcode: i.barcode,
        designCode: i.designCode,
        purity: i.purity,
        netWeight: i.netWeight,
        currentRate: i.currentRate,
        value: i.netWeight * i.currentRate,
        purchaseDate: i.purchaseDate,
        daysInStock: Math.floor((Date.now() - new Date(i.purchaseDate || Date.now()).getTime()) / (1000 * 60 * 60 * 24)),
      })),
      totalItems: items.length,
      totalValue: Math.round(items.reduce((s, i) => s + i.netWeight * i.currentRate, 0)),
      daysThreshold: days,
    };
  }
}