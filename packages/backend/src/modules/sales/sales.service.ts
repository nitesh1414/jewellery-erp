import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { v4 as uuid } from 'uuid';

@Injectable()
export class SalesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, query: {
    search?: string;
    status?: string;
    billType?: string;
    startDate?: string;
    endDate?: string;
    page?: number;
    limit?: number;
  }) {
    const search = query.search; const status = query.status; const billType = query.billType; const startDate = query.startDate; const endDate = query.endDate; const page = Number(query.page ?? 1) || 1; const limit = Number(query.limit ?? 20) || 20;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (status) where.status = status;
    if (billType) where.billType = billType;
    
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
      include: { items: true, payments: true },
    });
  }

  async create(data: any, userId: string, organizationId: string, branchId: string) {
    // Get settings for bill numbering
    const settings = await this.prisma.shopSettings.findUnique({
      where: { organizationId },
    });

    if (!settings) {
      throw new BadRequestException('Shop settings not configured');
    }

    // Generate bill number
    const prefix = data.billType === 'GST' ? 'GST' : 
                   data.billType === 'ESTIMATE' ? 'EST' :
                   data.billType === 'PROFORMA' ? 'PRO' : 'NG';
    
    const year = new Date().getFullYear();
    const billNumber = `${prefix}-${year}-${String(settings.nextBillNumber).padStart(6, '0')}`;

    // Calculate bill using backend engine
    const calculated = this.calculateBill(data.items);

    // Validate payment
    const totalPaid = (data.payments || []).reduce((sum: number, p: any) => sum + p.amount, 0);
    const balanceAmount = calculated.netAmount - totalPaid;

    // Use a transaction to create the sale and update inventory
    const sale = await this.prisma.$transaction(async (tx) => {
      // Create the sale
      const saleRecord = await tx.sale.create({
        data: {
          organizationId,
          branchId,
          billNumber,
          billType: data.billType || 'GST',
          status: totalPaid >= calculated.netAmount ? 'CONFIRMED' : 'DRAFT',
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

        // Update jewellery item status if barcode is present
        if (item.jewelleryItemId) {
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

      // Create payments
      if (data.payments && data.payments.length > 0) {
        for (const payment of data.payments) {
          await tx.salePayment.create({
            data: {
              saleId: saleRecord.id,
              amount: payment.amount,
              paymentMode: payment.paymentMode,
              reference: payment.reference,
              date: new Date(),
              employeeId: userId,
            },
          });
        }
      }

      // Update customer ledger if customer exists
      if (data.customerId) {
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

      // Update bill number sequence
      await tx.shopSettings.update({
        where: { organizationId },
        data: { nextBillNumber: settings.nextBillNumber + 1 },
      });

      // Create in-app notification
      await tx.notification.create({
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
  async addPayment(id: string, data: { amount: number; paymentMode: string; reference?: string }, userId: string, organizationId: string) {
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
      await tx.salePayment.create({
        data: {
          saleId: id,
          amount: data.amount,
          paymentMode: data.paymentMode,
          reference: data.reference || '',
          date: new Date(),
          employeeId: userId,
        },
      });

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
      status: { notIn: ['CANCELLED', 'DRAFT'] },
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
  private calculateBill(items: any[]) {
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

      // GST (3% total - 1.5% each for intra-state)
      const gstRate = item.gstRate || 3;
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