import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

/** Net weight = weight (gross) − stone weight (− other weight). */
function computeNetWeight(gross: any, stone: any, other: any): number {
  const g = Number(gross) || 0;
  const s = Number(stone) || 0;
  const o = Number(other) || 0;
  return Math.round(Math.max(0, g - s - o) * 1000) / 1000;
}

function round2(n: number): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/** Grams with up to 3 decimals and no trailing zeros: 15, 12.5, 10.25 … */
function g3(value: any): string {
  return String(Math.round((Number(value) || 0) * 1000) / 1000);
}

/** Ledger wording for an ornament line: GROSS … - STONE WEIGHT … - OTHER … */
function ornamentWeightNote(item: any): string {
  return `GROSS ${g3(item?.grossWeight)} g - STONE WEIGHT ${g3(item?.stoneWeight)} g - OTHER ${g3(item?.otherWeight)} g`;
}

@Injectable()
export class PurchasesService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
  ) {}

  async findAll(organizationId: string, query: {
    search?: string;
    supplierId?: string;
    metalType?: string;
    purity?: string;
    entryType?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, supplierId, metalType, purity, entryType, branchId, startDate, endDate, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };
    if (branchId) where.branchId = branchId;

    if (supplierId) where.supplierId = supplierId;
    if (metalType) where.metalType = metalType;
    if (purity) where.purity = purity;
    if (entryType) where.entryType = String(entryType).toUpperCase();
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


  /**
   * Money paid to the supplier at purchase time:
   *   • a PurchasePayment row (payment history of the bill)
   *   • a DEBIT entry on the cash / bank account it was paid from
   * The supplier ledger is already updated by the caller.
   */
  private async postPurchasePayment(
    tx: any,
    params: {
      organizationId: string;
      branchId: string;
      purchaseId: string;
      amount: number;
      paymentMode?: string;
      reference?: string;
      accountId?: string | null;
      invoiceNumber?: string;
      supplierName?: string;
      date?: Date | string;
      userId?: string;
    },
  ) {
    const amount = Number(params.amount) || 0;
    if (amount <= 0) return null;

    await tx.purchasePayment.create({
      data: {
        purchaseId: params.purchaseId,
        amount,
        paymentMode: params.paymentMode || 'CASH',
        reference: params.reference || null,
        date: params.date ? new Date(params.date) : new Date(),
        notes: `Paid against ${params.invoiceNumber || 'purchase'}${params.supplierName ? ' - ' + params.supplierName : ''}`,
      },
    });

    // Which account paid? Use the one picked on the form, else the default
    // cash account of the organisation.
    let account: any = null;
    if (params.accountId) {
      account = await tx.ledgerAccount.findFirst({ where: { id: params.accountId, organizationId: params.organizationId } });
    }
    if (!account) {
      account = await tx.ledgerAccount.findFirst({
        where: { organizationId: params.organizationId, type: 'CASH', isActive: true },
        orderBy: { isPrimary: 'desc' },
      });
    }
    if (!account) return null;

    await tx.ledgerEntry.create({
      data: {
        organizationId: params.organizationId,
        branchId: params.branchId,
        accountId: account.id,
        type: 'DEBIT',
        amount,
        date: params.date ? new Date(params.date) : new Date(),
        description: `Purchase payment ${params.invoiceNumber || ''} - ${params.supplierName || 'supplier'}`.trim(),
        reference: params.invoiceNumber,
        linkedTo: 'PURCHASE_PAYMENT',
        linkedId: params.purchaseId,
        employeeId: params.userId,
      },
    });
    await tx.ledgerAccount.update({
      where: { id: account.id },
      data: { currentBalance: { decrement: amount } },
    });
    return account;
  }

  // Aggregate totak helpers for single-line vs multi-item purchases
  private aggregateLineTotals(data: any) {
    const itemsRaw = (data.items || []).filter((i: any) => i && this.lineWeight(i) > 0);
    if (itemsRaw.length === 0) {
      // Legacy single-entry purchase
      const net = data.netWeight !== undefined && data.netWeight !== null && Number(data.netWeight) > 0
        ? Number(data.netWeight)
        : computeNetWeight(data.grossWeight, data.stoneWeight, data.otherWeight);
      const amount = Math.round((net * (data.rate || 0)) * 100) / 100;
      return {
        hasItems: false,
        metalType: data.metalType || 'GOLD',
        purity: data.purity || '22K',
        grossWeight: Number(data.grossWeight || 0),
        netWeight: net,
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
    const gross = itemsRaw.reduce((s: number, i: any) => s + (Number(i.grossWeight) || 0), 0);
    const net = itemsRaw.reduce((s: number, i: any) => s + this.lineWeight(i), 0);
    const qty = itemsRaw.reduce((s: number, i: any) => s + (Number(i.quantity) || 1), 0);
    const amount = itemsRaw.reduce((s: number, i: any) => s + Math.round((this.lineWeight(i) * (Number(i.rate) || 0)) * 100) / 100, 0);
    const makingCharges = itemsRaw.reduce((s: number, i: any) => s + (Number(i.makingCharges) || 0), 0);
    const stoneCharges = itemsRaw.reduce((s: number, i: any) => s + (Number(i.stoneCharges) || 0), 0);
    const otherCharges = itemsRaw.reduce((s: number, i: any) => s + (Number(i.otherCharges) || 0), 0);
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
   * Billable weight of a line: net weight when given, otherwise
   * gross − stone − other (Net Weight = Weight − Stone Weight).
   */
  private lineWeight(item: any): number {
    const net = Number(item?.netWeight);
    if (net > 0) return net;
    return computeNetWeight(item?.grossWeight, item?.stoneWeight, item?.otherWeight);
  }

  /** Weight in grams of a raw-metal line (bullion has no stone weight). */
  private metalGrams(item: any): number {
    const grams = Number(item?.grossWeight ?? item?.weight ?? item?.netWeight) || 0;
    return grams > 0 ? grams : Number(item?.netWeight) || 0;
  }

  private totalAmountOf(totals: any, data: any) {
    return Math.round((totals.amount
      + totals.makingCharges
      + totals.stoneCharges
      + totals.otherCharges
      + (Number(data.cgst) || 0)
      + (Number(data.sgst) || 0)
      + (Number(data.igst) || 0)) * 100) / 100;
  }

  /**
   * Create a purchase.
   *
   * entryType = METAL     → raw metal / bullion purchase: the weight is credited
   *                         (added) to the metal ledger of that metal + purity.
   * entryType = ORNAMENT  → readymade jewellery purchase: items are barcoded into
   *                         inventory and the gross weight of each line is debited
   *                         (deducted) from the metal ledger selected on the line.
   */
  async create(data: any, organizationId: string, branchId: string, userId: string, metalLedgerAccountId?: string) {
    const entryType = String(data.entryType || 'ORNAMENT').toUpperCase() === 'METAL' ? 'METAL' : 'ORNAMENT';
    return entryType === 'METAL'
      ? this.createMetalPurchase(data, organizationId, branchId, userId, metalLedgerAccountId)
      : this.createOrnamentPurchase(data, organizationId, branchId, userId, metalLedgerAccountId);
  }

  // =====================================================================
  // METAL (bullion) PURCHASE — adds grams to the metal ledger
  // =====================================================================

  private async createMetalPurchase(
    data: any,
    organizationId: string,
    branchId: string,
    userId: string,
    metalLedgerAccountId?: string,
  ) {
    const lines = (data.items || []).filter((i: any) => i && this.metalGrams(i) > 0);
    const legacyGrams = Number(data.netWeight ?? data.grossWeight ?? 0) || 0;
    if (lines.length === 0 && legacyGrams <= 0) {
      throw new BadRequestException('Add at least one metal line with a weight in grams');
    }

    const rawLines = lines.length
      ? lines.map((i: any) => ({
          metalType: (i.metalType || data.metalType || 'GOLD').toUpperCase(),
          purity: i.purity || data.purity || '22K',
          grams: this.metalGrams(i),
          rate: Number(i.rate ?? data.rate) || 0,
          accountId: i.metalLedgerAccountId || null,
          notes: i.notes || i.designCode || '',
        }))
      : [{
          metalType: (data.metalType || 'GOLD').toUpperCase(),
          purity: data.purity || '22K',
          grams: legacyGrams,
          rate: Number(data.rate) || 0,
          accountId: null,
          notes: '',
        }];

    const metalTypes = new Set(rawLines.map((l) => l.metalType));
    const purities = new Set(rawLines.map((l) => l.purity));
    const totalGrams = Math.round(rawLines.reduce((s, l) => s + l.grams, 0) * 1000) / 1000;
    const amount = rawLines.reduce((s, l) => s + Math.round(l.grams * l.rate * 100) / 100, 0);
    const totalAmount = this.totalAmountOf(
      { amount, makingCharges: Number(data.makingCharges) || 0, stoneCharges: Number(data.stoneCharges) || 0, otherCharges: Number(data.otherCharges) || 0 },
      data,
    );
    const paidAmount = Math.round((Number(data.paidAmount) || 0) * 100) / 100;
    const balanceAmount = Math.round((totalAmount - paidAmount) * 100) / 100;

    const purchase = await this.prisma.$transaction(async (tx) => {
      const record = await tx.purchase.create({
        data: {
          organizationId,
          branchId,
          supplierId: data.supplierId,
          invoiceNumber: data.invoiceNumber || `PUR-${Date.now()}`,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
          entryType: 'METAL',
          metalType: metalTypes.size === 1 ? [...metalTypes][0] : 'MIXED',
          purity: purities.size === 1 ? [...purities][0] : 'MIXED',
          grossWeight: totalGrams,
          netWeight: totalGrams,
          quantity: rawLines.length,
          rate: totalGrams > 0 ? Math.round((amount / totalGrams) * 100) / 100 : 0,
          amount: Math.round(amount * 100) / 100,
          makingCharges: Number(data.makingCharges) || 0,
          stoneCharges: Number(data.stoneCharges) || 0,
          otherCharges: Number(data.otherCharges) || 0,
          cgst: Number(data.cgst) || 0,
          sgst: Number(data.sgst) || 0,
          igst: Number(data.igst) || 0,
          totalAmount,
          paidAmount,
          balanceAmount,
          notes: data.notes,
        },
      });

      let firstAccountId: string | null = metalLedgerAccountId || null;

      for (const line of rawLines) {
        const account = await this.ledger.resolveMetalAccount(
          {
            organizationId,
            branchId,
            accountId: line.accountId || metalLedgerAccountId || null,
            metalType: line.metalType,
            purity: line.purity,
          },
          tx,
        );
        if (!firstAccountId) firstAccountId = account.id;

        const lineAmount = Math.round(line.grams * line.rate * 100) / 100;

        // Metal IN (CREDIT) — the purchased weight joins the metal stock
        await this.ledger.postMetalMovement(
          {
            organizationId,
            branchId,
            accountId: account.id,
            type: 'CREDIT',
            grams: line.grams,
            amount: lineAmount,
            rate: line.rate,
            metalType: line.metalType,
            purity: line.purity,
            date: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
            description: `Metal purchase — ${record.invoiceNumber} · ${line.grams} g ${line.metalType} ${line.purity}`,
            reference: data.invoiceNumber || record.invoiceNumber,
            linkedTo: 'PURCHASE',
            linkedId: record.id,
            employeeId: userId,
          },
          tx,
        );

        await tx.purchaseItem.create({
          data: {
            purchaseId: record.id,
            designCode: line.notes || `${line.metalType} ${line.purity}`,
            metalType: line.metalType,
            purity: line.purity,
            grossWeight: line.grams,
            stoneWeight: 0,
            otherWeight: 0,
            netWeight: line.grams,
            quantity: 1,
            rate: line.rate,
            lineAmount,
            metalLedgerAccountId: account.id,
          },
        });

        await tx.stockTransaction.create({
          data: {
            organizationId,
            branchId,
            transactionType: 'METAL_PURCHASE',
            transactionId: record.id,
            metalType: line.metalType,
            purity: line.purity,
            weight: line.grams,
            quantity: 1,
            rate: line.rate,
            value: lineAmount,
            reference: data.invoiceNumber || record.invoiceNumber,
            notes: `Metal purchase: ${line.grams} g ${line.metalType} ${line.purity}`,
            createdById: userId,
          },
        });
      }

      if (firstAccountId) {
        await tx.purchase.update({ where: { id: record.id }, data: { metalLedgerAccountId: firstAccountId } });
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
          description: `Metal purchase ${data.invoiceNumber || record.invoiceNumber}`,
        },
      });

      // Money paid now leaves the cash / bank account
      try {
        await this.postPurchasePayment(tx, {
          organizationId,
          branchId,
          purchaseId: record.id,
          amount: paidAmount,
          paymentMode: data.paymentMode,
          reference: data.reference,
          accountId: data.accountId,
          invoiceNumber: data.invoiceNumber || record.invoiceNumber,
          supplierName: data.supplierName,
          date: data.invoiceDate,
          userId,
        });
      } catch (e) {
        console.warn('Purchase payment posting failed', e?.message);
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          branchId,
          userId,
          userName: 'System',
          action: 'CREATE_METAL_PURCHASE',
          entityType: 'Purchase',
          entityId: record.id,
          newValue: JSON.stringify({
            invoiceNumber: record.invoiceNumber,
            totalAmount,
            grams: totalGrams,
            lines: rawLines.length,
          }),
        },
      });

      return record;
    });

    return this.prisma.purchase.findUnique({
      where: { id: purchase.id },
      include: { supplier: { select: { name: true } }, items: true },
    });
  }

  // =====================================================================
  // ORNAMENT (jewellery) PURCHASE — creates inventory, deducts gross weight
  // from the metal ledger selected on each line
  // =====================================================================

  private async createOrnamentPurchase(
    data: any,
    organizationId: string,
    branchId: string,
    userId: string,
    metalLedgerAccountId?: string,
  ) {
    const totals = this.aggregateLineTotals(data);
    const totalAmount = this.totalAmountOf(totals, data);
    const paidAmount = Math.round((Number(data.paidAmount) || 0) * 100) / 100;
    const balanceAmount = Math.round((totalAmount - paidAmount) * 100) / 100;

    const purchase = await this.prisma.$transaction(async (tx) => {
      const record = await tx.purchase.create({
        data: {
          organizationId,
          branchId,
          supplierId: data.supplierId,
          invoiceNumber: data.invoiceNumber || `PUR-${Date.now()}`,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
          entryType: 'ORNAMENT',
          metalLedgerAccountId: metalLedgerAccountId || null,
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
          cgst: Number(data.cgst) || 0,
          sgst: Number(data.sgst) || 0,
          igst: Number(data.igst) || 0,
          totalAmount,
          paidAmount,
          balanceAmount,
          notes: data.notes,
        },
      });

      const itemsRaw = (data.items || []).filter((i: any) => i && this.lineWeight(i) > 0);

      // Persist line items so a purchase can hold many metals/purities.
      if (totals.hasItems) {
        for (const item of itemsRaw) {
          const netWeight = this.lineWeight(item);
          const lineAmount = Math.round((netWeight * (Number(item.rate) || 0)) * 100) / 100;
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
              grossWeight: Number(item.grossWeight) || 0,
              stoneWeight: Number(item.stoneWeight) || 0,
              otherWeight: Number(item.otherWeight) || 0,
              netWeight,
              quantity: Number(item.quantity) || 1,
              rate: Number(item.rate) || data.rate || 0,
              makingChargeType: item.makingChargeType || 'PERCENTAGE',
              makingChargeValue: Number(item.makingChargeValue) || 10,
              hallmarkNumber: item.hallmarkNumber || '',
              certificateNumber: item.certificateNumber || '',
              stoneCharges: Number(item.stoneCharges) || 0,
              otherCharges: Number(item.otherCharges) || 0,
              lineAmount,
              metalLedgerAccountId: item.metalLedgerAccountId || metalLedgerAccountId || null,
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

        // The metal ledger this ornament takes its metal from. Falls back to
        // the metal account matching the line's metal + purity when the line
        // does not pick one explicitly.
        const metalAccountId = await this.resolveOrnamentMetalAccount(
          tx,
          {
            organizationId,
            branchId,
            accountId: item.metalLedgerAccountId || metalLedgerAccountId || null,
            metalType: item.metalType || data.metalType || 'GOLD',
            purity: item.purity || data.purity || '22K',
          },
          false,
        );

        const barcodeRecord = await tx.barcode.create({
          data: {
            organizationId,
            branchId,
            barcode: barcodeStr,
            jewelleryItemId: null,
            isAssigned: true,
          },
        });

        const netWeight = this.lineWeight(item);
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
            grossWeight: Number(item.grossWeight) || 0,
            stoneWeight: Number(item.stoneWeight) || 0,
            ornament: item.ornament || null,
            ornamentGender: item.ornamentGender || null,
            otherWeight: Number(item.otherWeight) || 0,
            netWeight,
            quantity: Number(item.quantity) || 1,
            size: item.size || '',
            color: item.color || '',
            brand: item.brand || '',
            purchaseRate: Number(item.rate) || data.rate || 0,
            currentRate: Number(item.rate) || data.rate || 0,
            makingChargeType: item.makingChargeType || 'PERCENTAGE',
            makingChargeValue: Number(item.makingChargeValue) || 10,
            hallmarkNumber: item.hallmarkNumber || '',
            certificateNumber: item.certificateNumber || '',
            hsnCode: item.hsnCode || data.hsnCode || '7113',
            status: 'IN_STOCK',
            location: data.location || '',
            supplierId: data.supplierId,
            purchaseId: record.id,
            purchaseDate: new Date(data.invoiceDate || Date.now()),
            metalLedgerAccountId: metalAccountId || null,
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

        // Ornament entry — the NET weight (gross − stone − other) leaves the selected metal ledger
        const netGrams = this.lineWeight(item);
        if (metalAccountId && netGrams > 0) {
          const metalAccount = await tx.ledgerAccount.findFirst({
            where: { id: metalAccountId },
            select: { name: true },
          });
          await this.ledger.postMetalMovement(
            {
              organizationId,
              branchId,
              accountId: metalAccountId,
              type: 'DEBIT',
              grams: netGrams,
              rate: Number(item.rate) || data.rate || 0,
              metalType: jewelleryItem.metalType,
              purity: jewelleryItem.purity,
              date: data.invoiceDate ? new Date(data.invoiceDate) : new Date(),
              description: `Ornament purchase — ${jewelleryItem.designCode || jewelleryItem.sku} — ${ornamentWeightNote(item)} from ${metalAccount?.name || 'metal ledger'} → ornament stock`,
              reference: data.invoiceNumber || record.invoiceNumber,
              linkedTo: 'PURCHASE',
              linkedId: record.id,
              employeeId: userId,
            },
            tx,
          );
        }
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

      // Money paid now leaves the cash / bank account
      try {
        await this.postPurchasePayment(tx, {
          organizationId,
          branchId,
          purchaseId: record.id,
          amount: paidAmount,
          paymentMode: data.paymentMode,
          reference: data.reference,
          accountId: data.accountId,
          invoiceNumber: data.invoiceNumber || record.invoiceNumber,
          supplierName: data.supplierName,
          date: data.invoiceDate,
          userId,
        });
      } catch (e) {
        console.warn('Purchase payment posting failed', e?.message);
      }

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
   * Metal account for an ornament line: the explicitly selected ledger, else the
   * existing ledger of the same metal + purity. `create` decides whether a
   * missing ledger may be auto-created (metal purchases only).
   */
  private async resolveOrnamentMetalAccount(
    tx: any,
    params: { organizationId: string; branchId?: string; accountId?: string | null; metalType?: string; purity?: string },
    create: boolean,
  ): Promise<string | null> {
    if (params.accountId) return params.accountId;
    if (create) {
      const account = await this.ledger.resolveMetalAccount({ ...params, accountId: null }, tx);
      return account?.id || null;
    }
    const metalType = (params.metalType || '').toUpperCase();
    const purity = params.purity || '';
    const existing = await tx.ledgerAccount.findFirst({
      where: { organizationId: params.organizationId, type: 'METAL', metalType, purity },
    });
    if (existing) return existing.id;
    const byName = await tx.ledgerAccount.findFirst({
      where: { organizationId: params.organizationId, type: 'METAL', name: `${metalType} ${purity}`.trim() },
    });
    return byName?.id || null;
  }

  /**
   * Edit an existing purchase (invoice no., date, supplier, notes, payment and
   * line items). Line items are replaced; metal-ledger movements posted by the
   * purchase are reversed and re-posted so the gram stock stays correct.
   */
  async update(id: string, data: any, organizationId: string, branchId: string, userId: string) {
    const existing = await this.prisma.purchase.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });
    if (!existing) throw new NotFoundException('Purchase not found');

    const entryType = String(data.entryType || existing.entryType || 'ORNAMENT').toUpperCase() === 'METAL' ? 'METAL' : 'ORNAMENT';
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
      metalLedgerAccountId: i.metalLedgerAccountId,
    })));

    return this.prisma.$transaction(async (tx) => {
      await tx.purchase.update({
        where: { id },
        data: {
          supplierId: data.supplierId ?? existing.supplierId,
          invoiceNumber: data.invoiceNumber ?? existing.invoiceNumber,
          invoiceDate: data.invoiceDate ? new Date(data.invoiceDate) : existing.invoiceDate,
          entryType,
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
            grossWeight: Number(item.grossWeight) || 0,
            stoneWeight: Number(item.stoneWeight) || 0,
            otherWeight: Number(item.otherWeight) || 0,
            netWeight: this.lineWeight(item),
            quantity: Number(item.quantity) || 1,
            rate: Number(item.rate) || 0,
            makingChargeType: item.makingChargeType || 'PERCENTAGE',
            makingChargeValue: Number(item.makingChargeValue) || 10,
            hallmarkNumber: item.hallmarkNumber || '',
            certificateNumber: item.certificateNumber || '',
            stoneCharges: Number(item.stoneCharges) || 0,
            otherCharges: Number(item.otherCharges) || 0,
            lineAmount: Math.round((this.lineWeight(item) * (Number(item.rate) || 0)) * 100) / 100,
            metalLedgerAccountId: item.metalLedgerAccountId || data.metalLedgerAccountId || existing.metalLedgerAccountId || null,
          },
        });
      }

      // Re-post the metal ledger movements for the new lines
      await this.ledger.reverseMetalMovements(organizationId, 'PURCHASE', id, tx);
      for (const [index, item] of itemsRaw.entries()) {
        if (entryType === 'METAL') {
          const grams = this.metalGrams(item);
          if (grams <= 0) continue;
          const account = await this.ledger.resolveMetalAccount(
            {
              organizationId,
              branchId,
              accountId: item.metalLedgerAccountId || data.metalLedgerAccountId || existing.metalLedgerAccountId || null,
              metalType: item.metalType || totals.metalType,
              purity: item.purity || totals.purity,
            },
            tx,
          );
          await this.ledger.postMetalMovement(
            {
              organizationId,
              branchId,
              accountId: account.id,
              type: 'CREDIT',
              grams,
              rate: Number(item.rate) || 0,
              metalType: account.metalType || item.metalType,
              purity: account.purity || item.purity,
              date: data.invoiceDate ? new Date(data.invoiceDate) : existing.invoiceDate,
              description: `Metal purchase — ${data.invoiceNumber || existing.invoiceNumber} · ${grams} g`,
              reference: data.invoiceNumber || existing.invoiceNumber,
              linkedTo: 'PURCHASE',
              linkedId: id,
              employeeId: userId,
            },
            tx,
          );
          if (index === 0) {
            await tx.purchase.update({ where: { id }, data: { metalLedgerAccountId: account.id } });
          }
        } else {
          const netGrams = this.lineWeight(item);
          if (netGrams <= 0) continue;
          const metalAccountId = await this.resolveOrnamentMetalAccount(
            tx,
            {
              organizationId,
              branchId,
              accountId: item.metalLedgerAccountId || data.metalLedgerAccountId || existing.metalLedgerAccountId || null,
              metalType: item.metalType || totals.metalType,
              purity: item.purity || totals.purity,
            },
            false,
          );
          if (!metalAccountId) continue;
          const metalAccount = await tx.ledgerAccount.findFirst({
            where: { id: metalAccountId },
            select: { name: true },
          });
          await this.ledger.postMetalMovement(
            {
              organizationId,
              branchId,
              accountId: metalAccountId,
              type: 'DEBIT',
              grams: netGrams,
              rate: Number(item.rate) || 0,
              metalType: item.metalType || totals.metalType,
              purity: item.purity || totals.purity,
              date: data.invoiceDate ? new Date(data.invoiceDate) : existing.invoiceDate,
              description: `Ornament purchase — ${item.designCode || ''} — ${ornamentWeightNote(item)} from ${metalAccount?.name || 'metal ledger'} → ornament stock`.trim(),
              reference: data.invoiceNumber || existing.invoiceNumber,
              linkedTo: 'PURCHASE',
              linkedId: id,
              employeeId: userId,
            },
            tx,
          );
        }
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

    const [metalTotal] = await Promise.all([
      this.prisma.purchase.aggregate({ where: { ...where, entryType: 'METAL' }, _sum: { netWeight: true, totalAmount: true } }),
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
      metalWeight: metalTotal._sum.netWeight || 0,
      metalAmount: metalTotal._sum.totalAmount || 0,
      todayPurchases: todayPurchases.length,
      todayAmount: todayPurchases.reduce((s, p) => s + p.totalAmount, 0),
    };
  }
}
