import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { v4 as uuid } from 'uuid';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  /**
   * URD (old gold) handed over at the counter.
   * value       = net weight × rate
   * net value   = value − deduction (₹)
   * final value = net value − melting loss %
   * The final value is what the customer is credited with against the bill.
   */
  private normalizeUrdEntries(raw: any): any[] {
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    return list
      .map((entry: any) => {
        const netWeight = Number(entry?.netWeight) || 0;
        const rate = Number(entry?.rate) || 0;
        const deduction = Number(entry?.deduction) || 0;
        const meltingLoss = Number(entry?.meltingLoss) || 0;
        const value = Math.round(netWeight * rate * 100) / 100;
        const netValue = Math.round(Math.max(0, value - deduction) * 100) / 100;
        const finalValue = Math.round(netValue * (1 - meltingLoss / 100) * 100) / 100;
        return {
          metalType: (entry?.metalType || 'GOLD').toUpperCase(),
          purity: entry?.purity || '',
          grossWeight: Number(entry?.grossWeight) || 0,
          stoneWeight: Number(entry?.stoneWeight) || 0,
          netWeight,
          rate,
          deduction,
          meltingLoss,
          notes: entry?.notes || null,
          value,
          netValue,
          finalValue,
        };
      })
      .filter((e: any) => e.netWeight > 0 && e.finalValue > 0);
  }

  async findAll(organizationId: string, query: {
    search?: string;
    status?: string;
    billType?: string;
    branchId?: string;
    startDate?: string;
    endDate?: string;
    customerId?: string;
    unpaid?: boolean;
    page?: number;
    limit?: number;
  }) {
    const search = query.search; const status = query.status; const billType = query.billType; const branchId = query.branchId; const startDate = query.startDate; const endDate = query.endDate; const page = Number(query.page ?? 1) || 1; const limit = Number(query.limit ?? 20) || 20;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    // Scope to the active branch (selected in the header) when one is set.
    if (branchId) where.branchId = branchId;
    if (status) where.status = status;
    if (billType) where.billType = billType;
    if (query.customerId) where.customerId = query.customerId;
    if (query.unpaid) where.balanceAmount = { gt: 0 };
    
    if (startDate) {
      where.billDate = { ...where.billDate, gte: new Date(startDate) };
    }
    if (endDate) {
      where.billDate = { ...where.billDate, lte: new Date(endDate) };
    }

    if (search) {
      where.OR = [
        { billNumber: { contains: search } },
        { customerName: { contains: search } },
        { customerMobile: { contains: search } },
        { customerName: { contains: search } },
        { customerMobile: { contains: search } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.sale.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        include: {
          items: true,
          payments: true,
          customer: { select: { name: true, mobile: true } },
        },
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string, organizationId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, organizationId },
      include: {
        items: { orderBy: { sortOrder: 'asc' } },
        payments: true,
        returns: { include: { items: true } },
        urdTransactions: true,
      },
    });

    if (!sale) {
      throw new NotFoundException('Bill not found');
    }

    return sale;
  }

  async findByBillNumber(billNumber: string, organizationId: string) {
    return this.prisma.sale.findFirst({
      where: { billNumber, organizationId },
      include: { items: true, payments: true, urdTransactions: true },
    });
  }


  /**
   * Find (or create) a ledger account by name — used for the automatic
   * Sales / GST accounts so a bill is reflected in the books without any
   * setup.
   */
  private async resolveAccount(
    tx: any,
    params: { organizationId: string; branchId?: string | null; name: string; type: string; notes?: string },
  ) {
    let account = await tx.ledgerAccount.findFirst({
      where: { organizationId: params.organizationId, name: params.name },
    });
    if (!account) {
      account = await tx.ledgerAccount.create({
        data: {
          organizationId: params.organizationId,
          branchId: params.branchId ?? null,
          name: params.name,
          type: params.type,
          isPrimary: false,
          isActive: true,
          notes: params.notes || `Auto-created ${params.name} account`,
        },
      });
    }
    return account;
  }

  /**
   * Post the tax of a GST bill to the tax ledger: half CGST + half SGST for an
   * intra-state sale, the whole amount as IGST for an inter-state one. The
   * accounts are created on first use and the entries are linked to the bill
   * so they can be reversed (sale return / delete).
   */
  private async postGstLedger(
    tx: any,
    params: {
      organizationId: string;
      branchId?: string | null;
      saleId: string;
      billNumber: string;
      customerName?: string | null;
      isGst: boolean;
      cgst: number;
      sgst: number;
      igst: number;
      date?: Date | string;
      userId?: string;
    },
  ) {
    const { organizationId, branchId } = params;
    const taxes: { name: string; amount: number }[] = [];
    const total = (Number(params.cgst) || 0) + (Number(params.sgst) || 0) + (Number(params.igst) || 0);
    if (!params.isGst || total <= 0) return;

    if (Number(params.igst) > 0) {
      taxes.push({ name: 'IGST', amount: Number(params.igst) || 0 });
    } else {
      const cgst = Number(params.cgst) || 0;
      const sgst = Number(params.sgst) || 0;
      if (cgst > 0) taxes.push({ name: 'CGST', amount: cgst });
      if (sgst > 0) taxes.push({ name: 'SGST', amount: sgst });
      if (!cgst && !sgst) {
        // tax was entered as a single figure — split it like a local sale
        taxes.push({ name: 'CGST', amount: Math.round((total / 2) * 100) / 100 });
        taxes.push({ name: 'SGST', amount: Math.round((total - total / 2) * 100) / 100 });
      }
    }

    for (const tax of taxes) {
      if (!(tax.amount > 0)) continue;
      const account = await this.resolveAccount(tx, {
        organizationId,
        branchId,
        name: `${tax.name} Payable`,
        type: 'DUTIES_AND_TAXES',
        notes: `Auto-created ${tax.name} payable account (GST collected on sales)`,
      });
      await tx.ledgerEntry.create({
        data: {
          organizationId,
          branchId: branchId ?? null,
          accountId: account.id,
          type: 'CREDIT',
          amount: tax.amount,
          date: params.date ? new Date(params.date) : new Date(),
          description: `${tax.name} on ${params.billNumber} - ${params.customerName || 'customer'}`,
          reference: params.billNumber,
          linkedTo: 'SALE_TAX',
          linkedId: params.saleId,
          employeeId: params.userId,
        },
      });
      await tx.ledgerAccount.update({
        where: { id: account.id },
        data: { currentBalance: { increment: tax.amount } },
      });
    }
  }

  async create(data: any, userId: string, organizationId: string, branchId: string) {
    // Get settings for bill numbering
    const settings = await this.prisma.shopSettings.findUnique({
      where: { organizationId },
    });

    if (!settings) {
      throw new BadRequestException('Shop settings not configured');
    }

    // Estimated bills keep their own EST-… id, never touch stock or ledger
    // (stock/ledger are applied only when the estimate is confirmed to a bill)
    const isEstimate = data.billType === 'ESTIMATE';

    // Generate bill number
    const prefix = data.billType === 'GST' ? 'GST' : 
                   data.billType === 'ESTIMATE' ? 'EST' :
                   data.billType === 'PROFORMA' ? 'PRO' : 'NG';
    
    const year = new Date().getFullYear();
    const billNumber = `${prefix}-${year}-${String(settings.nextBillNumber).padStart(6, '0')}`;

    // Calculate bill using backend engine (GST rate from admin settings)
    const calculated = this.calculateBill(data.items, settings.defaultGstRate ?? 3, data.isGst !== false);

    // URD (old gold) handed over at the counter — its final value pays the bill.
    // An estimate keeps the payment plan as "proposed": it is recorded and
    // printed, but nothing is collected until the estimate becomes a bill.
    const urdEntries = this.normalizeUrdEntries(data.urdEntries || data.urd);
    const urdTotal = Math.round(urdEntries.reduce((sum: number, e: any) => sum + e.finalValue, 0) * 100) / 100;
    // Validate payment
    const cashlessTotal = (data.payments || []).reduce((sum: number, p: any) => sum + (Number(p.amount) || 0), 0);
    const totalPaid = isEstimate ? 0 : Math.round((cashlessTotal + urdTotal) * 100) / 100;
    const balanceAmount = Math.round((calculated.netAmount - totalPaid) * 100) / 100;

    // Use a transaction to create the sale and update inventory
    const sale = await this.prisma.$transaction(async (tx) => {
      // Create the sale
      const saleRecord = await tx.sale.create({
        data: {
          organizationId,
          branchId,
          billNumber,
          billType: data.billType || 'GST',
          status: isEstimate ? 'ESTIMATE' : (totalPaid >= calculated.netAmount && calculated.netAmount > 0 ? 'CONFIRMED' : 'DRAFT'),
          customerId: data.customerId,
          customerName: data.customerName,
          customerMobile: data.customerMobile,
          customerGstin: data.customerGstin,
          customerAddress: data.customerAddress,
          billDate: data.billDate ? new Date(data.billDate) : new Date(),
          taxableAmount: calculated.taxableAmount,
          cgst: calculated.totalCgst,
          sgst: calculated.totalSgst,
          igst: calculated.totalIgst,
          totalTax: calculated.totalTax,
          discount: calculated.totalDiscount,
          discountType: data.discountType || 'FIXED',
          urdDeduction: calculated.totalUrd,
          roundOff: calculated.roundOff,
          grossAmount: calculated.subtotal,
          netAmount: calculated.netAmount,
          paidAmount: totalPaid,
          balanceAmount,
          paymentMode: data.payments?.[0]?.paymentMode,
          salesmanId: data.salesmanId || userId,
          narration: data.narration,
          electronicReference: data.electronicReference,
          isGst: data.isGst !== false,
        },
      });

      // Create sale items
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const itemCalc = calculated.items[i];

        await tx.saleItem.create({
          data: {
            saleId: saleRecord.id,
            jewelleryItemId: item.jewelleryItemId,
            barcode: item.barcode,
            particular: item.particular,
            hsnCode: item.hsnCode,
            purity: item.purity,
            quantity: item.quantity || 1,
            grossWeight: item.grossWeight || 0,
            netWeight: item.netWeight || 0,
            ratePerGram: item.ratePerGram || 0,
            metalValue: itemCalc.metalValue,
            makingCharges: itemCalc.totalCharges,
            chargeDetails: JSON.stringify(item.chargeDetails || []),
            hallMarkAmount: itemCalc.hallMarkAmount,
            hallmarkNumber: item.hallmarkNumber || null,
            discount: itemCalc.discount,
            cgst: itemCalc.cgst,
            sgst: itemCalc.sgst,
            igst: itemCalc.igst,
            urd: itemCalc.urd,
            urdDocNumber: item.urdDocNumber,
            totalAmount: itemCalc.totalAmount,
            sortOrder: i,
          },
        });

        // Update jewellery item status if barcode is present (real bills only)
        if (item.jewelleryItemId && !isEstimate) {
          await tx.jewelleryItem.update({
            where: { id: item.jewelleryItemId },
            data: { status: 'SOLD' },
          });

          // Create stock transaction
          await tx.stockTransaction.create({
            data: {
              organizationId,
              branchId,
              transactionType: 'SALE',
              transactionId: saleRecord.id,
              jewelleryItemId: item.jewelleryItemId,
              barcode: item.barcode,
              metalType: item.purity?.includes('SILVER') ? 'SILVER' : 'GOLD',
              purity: item.purity,
              weight: -(item.netWeight || 0),
              quantity: -(item.quantity || 1),
              rate: item.ratePerGram || 0,
              value: -(itemCalc.metalValue || 0),
              reference: billNumber,
              createdById: userId,
            },
          });
        }
      }

      // URD / old gold received at the counter — record it against this bill and,
      // for a real bill, credit the metal ledger with the metal taken in.
      for (const entry of urdEntries) {
        const count = await tx.urdTransaction.count({ where: { organizationId } });
        const urdNumber = `URD-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
        entry.urdNumber = urdNumber;

        const record = await tx.urdTransaction.create({
          data: {
            organizationId,
            branchId,
            urdNumber,
            customerId: data.customerId || null,
            customerName: data.customerName || 'Walk-in Customer',
            metalType: entry.metalType,
            purity: entry.purity,
            grossWeight: entry.grossWeight,
            stoneWeight: entry.stoneWeight,
            netWeight: entry.netWeight,
            rate: entry.rate,
            value: entry.value,
            deduction: entry.deduction,
            meltingLoss: entry.meltingLoss,
            finalValue: entry.finalValue,
            paymentMode: 'URD',
            referenceBillId: saleRecord.id,
            notes: entry.notes ?? (isEstimate
              ? `Proposed against estimate ${billNumber}`
              : `Adjusted against bill ${billNumber}`),
            status: isEstimate ? 'PROPOSED' : 'ADJUSTED',
          },
        });

        // A real bill: the old gold joins the metal stock of that metal + purity.
        if (!isEstimate && entry.netWeight > 0) {
          try {
            const account = await this.ledger.resolveMetalAccount(
              { organizationId, branchId, metalType: entry.metalType, purity: entry.purity, accountId: entry.metalLedgerAccountId || null },
              tx,
            );
            if (account) {
              await this.ledger.postMetalMovement(
                {
                  organizationId,
                  branchId,
                  accountId: account.id,
                  type: 'CREDIT',
                  grams: entry.netWeight,
                  rate: entry.netWeight ? entry.finalValue / entry.netWeight : 0,
                  metalType: entry.metalType,
                  purity: entry.purity,
                  date: data.billDate ? new Date(data.billDate) : new Date(),
                  description:
                    `URD / old gold — ${data.customerName || 'Walk-in Customer'} · ${billNumber} · ${entry.netWeight} g ${entry.metalType} ${entry.purity}`.trim(),
                  reference: urdNumber,
                  linkedTo: 'URD',
                  linkedId: record.id,
                  employeeId: userId,
                },
                tx,
              );
            }
          } catch (e) {
            // Never fail a bill because the metal ledger could not be moved
            console.warn('URD metal ledger movement failed', urdNumber, e?.message);
          }
        }
      }

      // Create payments (estimates record them as proposed — nothing is collected)
      const paymentRows = [
        ...(data.payments || [])
          .filter((p: any) => (Number(p.amount) || 0) > 0)
          .map((p: any) => ({
            amount: Number(p.amount) || 0,
            paymentMode: p.paymentMode,
            reference: p.reference,
            accountId: isEstimate ? null : (p.accountId || null),
          })),
        // URD pays through its own payment line so the bill reads
        // "URD ₹… · CASH ₹… · ONLINE ₹…" exactly as the customer settled it.
        ...urdEntries.map((e: any) => ({
          amount: e.finalValue,
          paymentMode: 'URD',
          reference: e.urdNumber || null,
          accountId: null,
        })),
      ];

      if (paymentRows.length > 0) {
        for (const payment of paymentRows) {
          const created = await tx.salePayment.create({
            data: {
              saleId: saleRecord.id,
              amount: payment.amount,
              paymentMode: payment.paymentMode,
              reference: payment.reference,
              accountId: payment.accountId || null,
              isProposed: isEstimate,
              date: new Date(),
              employeeId: userId,
            },
          });
          // Record the money into the chosen cash/bank ledger account.
          if (payment.accountId && !isEstimate) {
            const acc = await tx.ledgerAccount.findFirst({ where: { id: payment.accountId, organizationId } });
            if (acc) {
              await tx.ledgerEntry.create({
                data: {
                  organizationId,
                  branchId,
                  accountId: payment.accountId,
                  type: 'CREDIT',
                  amount: payment.amount,
                  date: new Date(),
                  description: `Payment on ${billNumber}`,
                  reference: billNumber,
                  linkedTo: 'SALE_PAYMENT',
                  linkedId: created.id,
                  employeeId: userId,
                  employeeName: 'System',
                },
              });
              await tx.ledgerAccount.update({
                where: { id: payment.accountId },
                data: { currentBalance: { increment: payment.amount } },
              });
            }
          }
        }
      }

      // Update customer ledger if customer exists (real bills only)
      if (!isEstimate && data.customerId) {
        await tx.customerLedger.create({
          data: {
            customerId: data.customerId,
            transactionType: 'SALE',
            transactionId: saleRecord.id,
            transactionNo: billNumber,
            date: new Date(),
            debit: calculated.netAmount,
            credit: totalPaid,
            balance: balanceAmount,
            description: `Sale bill ${billNumber}`,
          },
        });
      }

      // Sales ledger (real bills only) — credit the organisation's Sales
      // account so a confirmed sale is reflected in the ledger & accounts,
      // just like in a standard billing/tally software. Estimates never touch
      // the ledger until they are confirmed into a bill.
      if (!isEstimate) {
        let salesAccount = await tx.ledgerAccount.findFirst({
          where: { organizationId, name: 'Sales' },
        });
        if (!salesAccount) {
          salesAccount = await tx.ledgerAccount.create({
            data: {
              organizationId,
              name: 'Sales',
              type: 'INCOME',
              isPrimary: false,
              isActive: true,
              notes: 'Auto-created Sales account for billing ledger',
            },
          });
        }
        await tx.ledgerEntry.create({
          data: {
            organizationId,
            branchId,
            accountId: salesAccount.id,
            type: 'CREDIT',
            amount: calculated.netAmount,
            date: data.billDate ? new Date(data.billDate) : new Date(),
            description: `Sales ${billNumber} - ${data.customerName}`,
            reference: billNumber,
            linkedTo: 'SALE',
            linkedId: saleRecord.id,
            employeeId: userId,
            employeeName: data.salesmanName || 'System',
          },
        });
        await tx.ledgerAccount.update({
          where: { id: salesAccount.id },
          data: { currentBalance: { increment: calculated.netAmount } },
        });

        // GST / tax ledger — CGST + SGST (local sale) or IGST (inter-state)
        try {
          await this.postGstLedger(tx, {
            organizationId,
            branchId,
            saleId: saleRecord.id,
            billNumber,
            customerName: data.customerName,
            isGst: data.isGst !== false,
            cgst: calculated.totalCgst,
            sgst: calculated.totalSgst,
            igst: calculated.totalIgst,
            date: data.billDate,
            userId,
          });
        } catch (e) {
          console.warn('GST ledger posting failed for', billNumber, e?.message);
        }
      }

      // Update bill number sequence
      await tx.shopSettings.update({
        where: { organizationId },
        data: { nextBillNumber: settings.nextBillNumber + 1 },
      });

      // Create in-app notification (real bills only)
      if (!isEstimate) await tx.notification.create({
        data: {
          organizationId,
          branchId,
          type: 'BILL_GENERATED',
          title: 'Bill ' + billNumber + ' generated',
          message: data.customerName + ' · ' + '₹' + calculated.netAmount.toLocaleString('en-IN') + (totalPaid > 0 ? ' · Paid ₹' + totalPaid.toLocaleString('en-IN') : ''),
          relatedEntityType: 'Sale',
          relatedEntityId: saleRecord.id,
          status: 'UNREAD',
        },
      });

      // Create audit log
      await tx.auditLog.create({
        data: {
          organizationId,
          branchId,
          userId,
          userName: data.salesmanName || 'System',
          action: 'CREATE_SALE',
          entityType: 'Sale',
          entityId: saleRecord.id,
          newValue: JSON.stringify({ billNumber, amount: calculated.netAmount }),
        },
      });

      return tx.sale.findUnique({
        where: { id: saleRecord.id },
        include: { items: true, payments: true },
      });
    });

    return sale;
  }

  /**
   * Estimated bills stay editable (items, rates, discount, customer) until
   * they are confirmed into a real bill.
   */
  async updateEstimate(id: string, data: any, userId: string, organizationId: string) {
    const estimate = await this.prisma.sale.findFirst({
      where: { id, organizationId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!estimate) throw new NotFoundException('Estimated bill not found');
    if (estimate.billType !== 'ESTIMATE') throw new BadRequestException('Only estimated bills can be edited');
    if (estimate.status !== 'ESTIMATE') throw new BadRequestException('This estimate is already ' + estimate.status + ' and can no longer be edited');

    if (!data.items || data.items.length === 0) throw new BadRequestException('Add at least one item');

    const settings = await this.prisma.shopSettings.findUnique({ where: { organizationId } });
    const calculated = this.calculateBill(data.items, settings?.defaultGstRate ?? 3, data.isGst !== false);
    const discount = data.discount ?? estimate.discount;
    const taxable = Math.max(0, calculated.taxableAmount - (calculated.totalDiscount || 0));

    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.saleItem.deleteMany({ where: { saleId: id } });
      for (let i = 0; i < data.items.length; i++) {
        const item = data.items[i];
        const itemCalc = calculated.items[i];
        await tx.saleItem.create({
          data: {
            saleId: id,
            jewelleryItemId: item.jewelleryItemId || null,
            barcode: item.barcode || null,
            particular: item.particular,
            hsnCode: item.hsnCode,
            purity: item.purity,
            quantity: item.quantity || 1,
            grossWeight: item.grossWeight || 0,
            netWeight: item.netWeight || 0,
            ratePerGram: item.ratePerGram || 0,
            metalValue: itemCalc.metalValue,
            makingCharges: itemCalc.totalCharges,
            chargeDetails: JSON.stringify(item.chargeDetails || []),
            hallMarkAmount: itemCalc.hallMarkAmount,
            hallmarkNumber: item.hallmarkNumber || null,
            discount: itemCalc.discount,
            cgst: itemCalc.cgst,
            sgst: itemCalc.sgst,
            igst: itemCalc.igst,
            urd: itemCalc.urd,
            urdDocNumber: item.urdDocNumber,
            totalAmount: itemCalc.totalAmount,
            sortOrder: i,
          },
        });
      }
      // Proposed settlement (URD / cash / online …) — stored and printed,
      // never collected while the document is still an estimate.
      await tx.salePayment.deleteMany({ where: { saleId: id } });
      await tx.urdTransaction.deleteMany({ where: { referenceBillId: id, status: 'PROPOSED' } });
      const urdEntries = this.normalizeUrdEntries(data.urdEntries || data.urd);
      for (const entry of urdEntries) {
        const count = await tx.urdTransaction.count({ where: { organizationId } });
        const urdNumber = `URD-${new Date().getFullYear()}-${String(count + 1).padStart(5, '0')}`;
        entry.urdNumber = urdNumber;
        await tx.urdTransaction.create({
          data: {
            organizationId,
            branchId: estimate.branchId,
            urdNumber,
            customerId: data.customerId || estimate.customerId || null,
            customerName: data.customerName || estimate.customerName,
            metalType: entry.metalType,
            purity: entry.purity,
            grossWeight: entry.grossWeight,
            stoneWeight: entry.stoneWeight,
            netWeight: entry.netWeight,
            rate: entry.rate,
            value: entry.value,
            deduction: entry.deduction,
            meltingLoss: entry.meltingLoss,
            finalValue: entry.finalValue,
            paymentMode: 'URD',
            referenceBillId: id,
            notes: entry.notes ?? `Proposed against estimate ${estimate.billNumber}`,
            status: 'PROPOSED',
          },
        });
      }
      const paymentRows = [
        ...(data.payments || [])
          .filter((p: any) => (Number(p.amount) || 0) > 0)
          .map((p: any) => ({ amount: Number(p.amount) || 0, paymentMode: p.paymentMode, reference: p.reference })),
        ...urdEntries.map((e: any) => ({ amount: e.finalValue, paymentMode: 'URD', reference: e.urdNumber || null })),
      ];
      for (const payment of paymentRows) {
        await tx.salePayment.create({
          data: {
            saleId: id,
            amount: payment.amount,
            paymentMode: payment.paymentMode,
            reference: payment.reference,
            accountId: null,
            isProposed: true,
            date: new Date(),
            employeeId: userId,
          },
        });
      }

      return tx.sale.update({
        where: { id },
        data: {
          customerId: data.customerId || null,
          customerName: data.customerName || estimate.customerName,
          customerMobile: data.customerMobile || null,
          customerGstin: data.customerGstin || null,
          customerAddress: data.customerAddress || null,
          taxableAmount: calculated.taxableAmount,
          cgst: calculated.totalCgst,
          sgst: calculated.totalSgst,
          igst: calculated.totalIgst,
          totalTax: calculated.totalTax,
          discount: calculated.totalDiscount || discount,
          grossAmount: calculated.subtotal,
          netAmount: calculated.netAmount,
          balanceAmount: calculated.netAmount,
          isGst: data.isGst !== false,
          narration: data.narration ?? estimate.narration,
        },
      });
    });

    return updated;
  }

  /**
   * Confirm an estimated bill → generates the real GST/Non-GST bill
   * (new bill number, stock movement, ledger, payments) and marks the
   * estimate CONVERTED for the audit trail.
   */
  async confirmEstimate(id: string, data: { billType?: string; payments?: any[]; urdEntries?: any[] }, userId: string, organizationId: string, branchId: string) {
    const estimate = await this.prisma.sale.findFirst({
      where: { id, organizationId },
      include: { items: { orderBy: { sortOrder: 'asc' } } },
    });
    if (!estimate) throw new NotFoundException('Estimated bill not found');
    if (estimate.billType !== 'ESTIMATE') throw new BadRequestException('This is not an estimated bill');
    if (estimate.status !== 'ESTIMATE') throw new BadRequestException('Estimate already ' + estimate.status.toLowerCase());

    if (!estimate.items || estimate.items.length === 0) {
      throw new BadRequestException('Estimate has no items');
    }

    const billType = data.billType === 'NON_GST' ? 'NON_GST' : 'GST';

    // Anything the estimate proposed (money and old gold) becomes real now:
    // the caller may send it, otherwise we carry over what was stored.
    const proposedPayments = await this.prisma.salePayment.findMany({ where: { saleId: id, isProposed: true } });
    const proposedUrd = await this.prisma.urdTransaction.findMany({ where: { referenceBillId: id, status: 'PROPOSED' } });
    const payments = (data.payments && data.payments.length ? data.payments : proposedPayments)
      .filter((p: any) => (Number(p?.amount) || 0) > 0)
      .map((p: any) => ({ amount: Number(p.amount) || 0, paymentMode: p.paymentMode || 'CASH', reference: p.reference || '' }));
    const urdEntries = (data.urdEntries && data.urdEntries.length ? data.urdEntries : proposedUrd)
      .filter((u: any) => (Number(u?.netWeight) || 0) > 0)
      .map((u: any) => ({
        metalType: u.metalType,
        purity: u.purity,
        grossWeight: Number(u.grossWeight) || 0,
        stoneWeight: Number(u.stoneWeight) || 0,
        netWeight: Number(u.netWeight) || 0,
        rate: Number(u.rate) || 0,
        value: Number(u.value) || 0,
        deduction: Number(u.deduction) || 0,
        meltingLoss: Number(u.meltingLoss) || 0,
        finalValue: Number(u.finalValue) || 0,
        notes: u.notes || null,
      }));

    const saleData: any = {
      billType,
      customerId: estimate.customerId,
      customerName: estimate.customerName,
      customerMobile: estimate.customerMobile,
      customerGstin: billType === 'GST' ? estimate.customerGstin : '',
      customerAddress: estimate.customerAddress,
      isGst: billType === 'GST',
      narration: (estimate.narration ? estimate.narration + ' | ' : '') + 'Confirmed from estimate ' + estimate.billNumber,
      payments,
      urdEntries,
      items: estimate.items.map((item) => ({
        jewelleryItemId: item.jewelleryItemId,
        barcode: item.barcode,
        particular: item.particular,
        hsnCode: item.hsnCode,
        purity: item.purity,
        quantity: item.quantity,
        grossWeight: item.grossWeight,
        netWeight: item.netWeight,
        ratePerGram: item.ratePerGram,
        metalValue: item.metalValue,
        makingCharges: item.makingCharges,
        chargeDetails: JSON.parse(item.chargeDetails || '[]'),
        hallMarkAmount: item.hallMarkAmount,
        hallmarkNumber: item.hallmarkNumber,
        discount: item.discount,
        urd: item.urd,
        urdDocNumber: item.urdDocNumber,
      })),
    };

    // create() runs the full bill pipeline (stock, metal ledger, GST, payments)
    const sale = await this.create(saleData, userId, organizationId, branchId);

    // the estimate's placeholders are replaced by the real rows on the bill
    await this.prisma.urdTransaction.deleteMany({ where: { referenceBillId: id, status: 'PROPOSED' } });
    await this.prisma.salePayment.deleteMany({ where: { saleId: id, isProposed: true } });

    await this.prisma.sale.update({
      where: { id },
      data: { status: 'CONVERTED', balanceAmount: 0, paidAmount: 0 },
    });

    return sale;
  }

  async updateStatus(id: string, status: string, userId: string, organizationId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, organizationId },
    });

    if (!sale) {
      throw new NotFoundException('Bill not found');
    }

    if (sale.status === 'FINALIZED') {
      throw new ForbiddenException('Cannot modify a finalized bill');
    }

    return this.prisma.sale.update({
      where: { id },
      data: { status },
    });
  }

  async cancel(id: string, reason: string, userId: string, organizationId: string) {
    const sale = await this.prisma.sale.findFirst({
      where: { id, organizationId },
      include: { items: true },
    });

    if (!sale) {
      throw new NotFoundException('Bill not found');
    }

    if (sale.status === 'CANCELLED') {
      throw new BadRequestException('Bill is already cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      // Update status
      await tx.sale.update({
        where: { id },
        data: { status: 'CANCELLED' },
      });

      // Restore jewellery items
      for (const item of sale.items) {
        if (item.jewelleryItemId) {
          await tx.jewelleryItem.update({
            where: { id: item.jewelleryItemId },
            data: { status: 'IN_STOCK' },
          });

          await tx.stockTransaction.create({
            data: {
              organizationId: sale.organizationId,
              branchId: sale.branchId,
              transactionType: 'SALE_RETURN',
              transactionId: id,
              jewelleryItemId: item.jewelleryItemId,
              barcode: item.barcode,
              metalType: item.purity?.includes('SILVER') ? 'SILVER' : 'GOLD',
              purity: item.purity,
              weight: item.netWeight,
              quantity: item.quantity,
              rate: item.ratePerGram,
              value: item.metalValue,
              reference: sale.billNumber,
              notes: `Cancelled: ${reason}`,
              createdById: userId,
            },
          });
        }
      }

      // Reverse the sales ledger entry so a cancelled bill drops out of the
      // sales/accounts ledger.
      const salesLedgerEntry = await tx.ledgerEntry.findFirst({
        where: { linkedTo: 'SALE', linkedId: id },
      });
      if (salesLedgerEntry) {
        await tx.ledgerAccount.update({
          where: { id: salesLedgerEntry.accountId },
          data: { currentBalance: { decrement: salesLedgerEntry.amount } },
        });
        await tx.ledgerEntry.delete({ where: { id: salesLedgerEntry.id } });
      }

      // Reverse the GST / tax entries (CGST + SGST or IGST) booked on the bill.
      const taxEntries = await tx.ledgerEntry.findMany({
        where: { linkedTo: 'SALE_TAX', linkedId: id },
      });
      for (const entry of taxEntries) {
        await tx.ledgerAccount.update({
          where: { id: entry.accountId },
          data: { currentBalance: { decrement: entry.amount } },
        });
        await tx.ledgerEntry.delete({ where: { id: entry.id } });
      }

      // Money taken back out of the cash/bank account when the bill is cancelled
      const paymentEntries = await tx.ledgerEntry.findMany({
        where: { linkedTo: 'SALE_PAYMENT', linkedId: id },
      });
      for (const entry of paymentEntries) {
        await tx.ledgerAccount.update({
          where: { id: entry.accountId },
          data: { currentBalance: { decrement: entry.amount } },
        });
        await tx.ledgerEntry.delete({ where: { id: entry.id } });
      }

      // Reverse the customer ledger (offset the sale debit).
      if (sale.customerId) {
        const last = await tx.customerLedger.findFirst({
          where: { customerId: sale.customerId },
          orderBy: { createdAt: 'desc' },
        });
        const balance = Math.round(((last?.balance || 0) - sale.netAmount) * 100) / 100;
        await tx.customerLedger.create({
          data: {
            customerId: sale.customerId,
            transactionType: 'SALE_CANCELLED',
            transactionId: id,
            transactionNo: sale.billNumber,
            date: new Date(),
            debit: 0,
            credit: sale.netAmount,
            balance,
            description: `Bill cancelled ${sale.billNumber}${reason ? ' - ' + reason : ''}`,
          },
        });
      }

      // Audit log
      await tx.auditLog.create({
        data: {
          organizationId: sale.organizationId,
          branchId: sale.branchId,
          userId,
          userName: 'System',
          action: 'CANCEL_SALE',
          entityType: 'Sale',
          entityId: id,
          oldValue: JSON.stringify({ status: sale.status }),
          newValue: JSON.stringify({ status: 'CANCELLED', reason }),
        },
      });

      return { message: 'Bill cancelled successfully' };
    });
  }

  /**
   * Add a payment to an existing bill (settle outstanding / half-payment flow)
   */
  async addPayment(id: string, data: { amount: number; paymentMode: string; reference?: string; accountId?: string }, userId: string, organizationId: string) {
    const sale = await this.prisma.sale.findFirst({ where: { id, organizationId } });
    if (!sale) throw new NotFoundException('Bill not found');
    if (['CANCELLED', 'RETURNED'].includes(sale.status)) {
      throw new BadRequestException(`Cannot add payment to ${sale.status} bill`);
    }
    if (data.amount <= 0) throw new BadRequestException('Amount must be positive');

    // Reject overpayment — amount cannot exceed remaining balance
    const remaining = Math.round((sale.netAmount - sale.paidAmount) * 100) / 100;
    if (data.amount > remaining + 0.001) {
      throw new BadRequestException(
        `Amount ₹${data.amount.toLocaleString('en-IN')} exceeds remaining balance ₹${remaining.toLocaleString('en-IN')}`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Add sale payment
      const salePayment = await tx.salePayment.create({
        data: {
          saleId: id,
          amount: data.amount,
          paymentMode: data.paymentMode,
          reference: data.reference || '',
          accountId: data.accountId || null,
          date: new Date(),
          employeeId: userId,
        },
      });

      // Record the money into the chosen cash/bank ledger account.
      if (data.accountId) {
        const acc = await tx.ledgerAccount.findFirst({ where: { id: data.accountId, organizationId } });
        if (acc) {
          await tx.ledgerEntry.create({
            data: {
              organizationId,
              branchId: sale.branchId,
              accountId: data.accountId,
              type: 'CREDIT',
              amount: data.amount,
              date: new Date(),
              description: `Payment received on ${sale.billNumber} (${data.paymentMode})`,
              reference: sale.billNumber,
              linkedTo: 'SALE_PAYMENT',
              linkedId: salePayment.id,
              employeeId: userId,
              employeeName: 'System',
            },
          });
          await tx.ledgerAccount.update({
            where: { id: data.accountId },
            data: { currentBalance: { increment: data.amount } },
          });
        }
      }

      const newPaid = Math.round((sale.paidAmount + data.amount) * 100) / 100;
      const newBalance = Math.round((sale.netAmount - newPaid) * 100) / 100;

      // Update sale
      const updated = await tx.sale.update({
        where: { id },
        data: {
          paidAmount: newPaid,
          balanceAmount: newBalance,
          status: newBalance <= 0 ? 'CONFIRMED' : sale.status,
          paymentMode: data.paymentMode,
        },
      });

      // Customer ledger credit
      if (sale.customerId) {
        const last = await tx.customerLedger.findFirst({
          where: { customerId: sale.customerId },
          orderBy: { createdAt: 'desc' },
        });
        const balance = (last?.balance || 0) - data.amount;
        await tx.customerLedger.create({
          data: {
            customerId: sale.customerId,
            transactionType: 'PAYMENT',
            transactionId: id,
            transactionNo: sale.billNumber,
            date: new Date(),
            debit: 0,
            credit: data.amount,
            balance,
            description: `Payment received on ${sale.billNumber} (${data.paymentMode})`,
          },
        });
      }

      // Audit
      await tx.auditLog.create({
        data: {
          organizationId: sale.organizationId,
          branchId: sale.branchId,
          userId,
          userName: 'System',
          action: 'SALE_PAYMENT',
          entityType: 'Sale',
          entityId: id,
          oldValue: JSON.stringify({ paidAmount: sale.paidAmount, balanceAmount: sale.balanceAmount }),
          newValue: JSON.stringify({ paidAmount: newPaid, balanceAmount: newBalance, amount: data.amount, mode: data.paymentMode }),
        },
      });

      return {
        saleId: id,
        billNumber: sale.billNumber,
        paidAmount: newPaid,
        balanceAmount: newBalance,
        settled: newBalance <= 0,
      };
    });
  }

  async getTodaySummary(organizationId: string, branchId?: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where: any = {
      organizationId,
      billDate: { gte: today },
      status: { notIn: ['CANCELLED', 'DRAFT', 'ESTIMATE'] },
      billType: { not: 'ESTIMATE' },
    };

    if (branchId) where.branchId = branchId;

    const sales = await this.prisma.sale.findMany({ where });

    const totalSales = sales.length;
    const totalAmount = sales.reduce((sum, s) => sum + s.netAmount, 0);
    const totalCollection = sales.reduce((sum, s) => sum + s.paidAmount, 0);
    const totalOutstanding = sales.reduce((sum, s) => sum + s.balanceAmount, 0);
    const totalCgst = sales.reduce((sum, s) => sum + s.cgst, 0);
    const totalSgst = sales.reduce((sum, s) => sum + s.sgst, 0);
    const totalIgst = sales.reduce((sum, s) => sum + s.igst, 0);

    return {
      totalSales,
      totalAmount,
      totalCollection,
      totalOutstanding,
      totalGst: totalCgst + totalSgst + totalIgst,
      totalCgst,
      totalSgst,
      totalIgst,
      averageBillValue: totalSales > 0 ? totalAmount / totalSales : 0,
    };
  }

  /**
   * Backend billing calculation engine
   */
  private calculateBill(items: any[], defaultGstRate = 3, isGst = true) {
    let subtotal = 0;
    let totalDiscount = 0;
    let totalUrd = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;

    const calculatedItems = items.map((item) => {
      const netWeight = item.netWeight || 0;
      const ratePerGram = item.ratePerGram || 0;
      const quantity = item.quantity || 1;

      // Metal value
      const metalValue = this.roundMoney(netWeight * ratePerGram * quantity);

      // Calculate charges
      let totalCharges = 0;
      const charges = item.chargeDetails || [];
      
      for (const charge of charges) {
        let chargeAmount = 0;
        switch (charge.calculationType) {
          case 'PERCENTAGE':
            chargeAmount = this.roundMoney(metalValue * (charge.value / 100));
            break;
          case 'PER_GRAM':
            chargeAmount = this.roundMoney(netWeight * charge.value);
            break;
          case 'FIXED_AMOUNT':
            chargeAmount = charge.value;
            break;
        }
        charge.amount = chargeAmount;
        totalCharges += chargeAmount;
      }

      // Making charges (backward compatibility)
      if (item.makingCharges && charges.length === 0) {
        totalCharges = item.makingCharges;
      }

      const makingCharges = this.roundMoney(totalCharges);
      const hallMarkAmount = charges
        .filter(c => c.type === 'HALLMARK')
        .reduce((sum: number, c: any) => sum + (c.amount || 0), 0);
      
      const discount = item.discount || 0;
      const urd = item.urd || 0;

      // Taxable amount
      const taxableAmount = this.roundMoney(metalValue + makingCharges - discount - urd);

      // GST rate comes from admin-configured settings (DB), never hard-coded.
      // A line can opt out of GST (e.g. URD/old gold) via item.gstIncluded.
      const gstRate = item.gstRate || (item.gstIncluded === false ? 0 : (isGst ? defaultGstRate : 0));
      const halfRate = gstRate / 2;
      const cgst = this.roundMoney(taxableAmount * (halfRate / 100));
      const sgst = this.roundMoney(taxableAmount * (halfRate / 100));
      const totalAmount = this.roundMoney(taxableAmount + cgst + sgst);

      subtotal += metalValue + makingCharges;
      totalDiscount += discount;
      totalUrd += urd;
      totalCgst += cgst;
      totalSgst += sgst;

      return {
        metalValue,
        totalCharges: makingCharges,
        chargeAmounts: charges,
        hallMarkAmount,
        discount,
        urd,
        taxableAmount,
        cgst,
        sgst,
        igst: 0,
        totalTax: cgst + sgst,
        totalAmount,
      };
    });

    const taxableAmount = this.roundMoney(subtotal - totalDiscount - totalUrd);
    const totalTax = this.roundMoney(totalCgst + totalSgst + totalIgst);
    const netAmountBeforeRound = this.roundMoney(taxableAmount + totalTax);
    const roundOff = this.roundMoney(Math.round(netAmountBeforeRound) - netAmountBeforeRound);
    const netAmount = this.roundMoney(netAmountBeforeRound + roundOff);

    return {
      items: calculatedItems,
      subtotal: this.roundMoney(subtotal),
      totalDiscount: this.roundMoney(totalDiscount),
      totalUrd: this.roundMoney(totalUrd),
      taxableAmount,
      totalCgst: this.roundMoney(totalCgst),
      totalSgst: this.roundMoney(totalSgst),
      totalIgst: 0,
      totalTax,
      roundOff,
      netAmount,
    };
  }

  private roundMoney(value: number): number {
    return Math.round(value * 100) / 100;
  }
}