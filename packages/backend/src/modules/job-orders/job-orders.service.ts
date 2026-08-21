import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class JobOrdersService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, query: {
    search?: string;
    status?: string;
    employeeId?: string;
    page?: number;
    limit?: number;
  }) {
    const { search, status, employeeId, page = 1, limit = 20 } = query;
    const skip = (page - 1) * limit;

    const where: any = { organizationId };

    if (status) where.status = status;
    
    if (search) {
      where.OR = [
        { jobNumber: { contains: search } },
        { customerName: { contains: search } },
        { productDescription: { contains: search } },
      ];
    }

    if (employeeId) {
      where.assignments = { some: { employeeId } };
    }

    const [items, total] = await Promise.all([
      this.prisma.jobOrder.findMany({
        where,
        skip,
        take: +limit,
        orderBy: { createdAt: 'desc' },
        include: {
          assignments: { include: { employee: { select: { name: true } } } },
          _count: { select: { materials: true } },
        },
      }),
      this.prisma.jobOrder.count({ where }),
    ]);

    return { items, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async findById(id: string, organizationId: string) {
    const order = await this.prisma.jobOrder.findFirst({
      where: { id, organizationId },
      include: {
        assignments: {
          include: {
            employee: { select: { name: true, email: true } },
            materials: true,
            materialReturns: true,
          },
        },
        materials: true,
        statusHistory: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!order) throw new NotFoundException('Job order not found');
    return order;
  }

  async create(data: any, organizationId: string, branchId: string) {
    // Generate job number
    const count = await this.prisma.jobOrder.count({ where: { organizationId } });
    const year = new Date().getFullYear();
    const jobNumber = `JOB-${year}-${String(count + 1).padStart(5, '0')}`;

    const assignWorker = data.assignTo && data.assignTo.employeeId;

    const order = await this.prisma.jobOrder.create({
      data: {
        organizationId,
        branchId,
        jobNumber,
        customerId: data.customerId,
        customerName: data.customerName,
        customerMobile: data.customerMobile,
        productDescription: data.productDescription,
        purity: data.purity,
        metalType: data.metalType,
        expectedWeight: data.expectedWeight || 0,
        expectedDelivery: new Date(data.expectedDelivery),
        estimatedAmount: data.estimatedAmount || 0,
        advanceAmount: data.advanceAmount || 0,
        balanceAmount: (data.estimatedAmount || 0) - (data.advanceAmount || 0),
        status: assignWorker ? 'ASSIGNED' : 'CREATED',
        notes: data.notes,
      },
    });

    await this.prisma.jobStatusHistory.create({
      data: { jobOrderId: order.id, fromStatus: null, toStatus: order.status, changedBy: 'system' },
    });

    // Optional worker assignment straight from the create form
    if (assignWorker) {
      const employee = await this.prisma.employee.findFirst({
        where: { id: data.assignTo.employeeId, organizationId },
      });
      if (employee) {
        await this.prisma.jobAssignment.create({
          data: {
            jobOrderId: order.id,
            employeeId: employee.id,
            employeeName: employee.name,
            dueDate: data.assignTo.dueDate ? new Date(data.assignTo.dueDate) : new Date(data.expectedDelivery),
            status: 'ASSIGNED',
            notes: data.assignTo.notes || null,
          },
        });
      }
    }

    return this.prisma.jobOrder.findUnique({
      where: { id: order.id },
      include: { assignments: true },
    });
  }

  async assignEmployee(jobOrderId: string, data: {
    employeeId: string;
    employeeName?: string;
    dueDate: string;
    notes?: string;
  }) {
    const order = await this.prisma.jobOrder.findUnique({ where: { id: jobOrderId } });
    if (!order) throw new NotFoundException('Job order not found');
    if (['DELIVERED', 'CANCELLED'].includes(order.status)) {
      throw new BadRequestException('Cannot assign workers to a delivered/cancelled job');
    }
    const employee = await this.prisma.employee.findUnique({ where: { id: data.employeeId } });
    if (!employee) throw new NotFoundException('Worker not found');

    const assignment = await this.prisma.jobAssignment.create({
      data: {
        jobOrderId,
        employeeId: data.employeeId,
        employeeName: employee.name,
        dueDate: new Date(data.dueDate),
        status: 'ASSIGNED',
        notes: data.notes,
      },
    });

    // creating an assignment moves the order forward
    if (order.status === 'CREATED') {
      await this.prisma.jobStatusHistory.create({
        data: { jobOrderId, fromStatus: 'CREATED', toStatus: 'ASSIGNED', changedBy: 'system' },
      });
      await this.prisma.jobOrder.update({ where: { id: jobOrderId }, data: { status: 'ASSIGNED' } });
    }

    return assignment;
  }

  async updateStatus(jobOrderId: string, status: string, userId?: string) {
    const validTransitions: Record<string, string[]> = {
      'CREATED': ['ASSIGNED', 'CANCELLED'],
      'ASSIGNED': ['IN_PROGRESS', 'CREATED', 'CANCELLED'],
      'ACCEPTED': ['IN_PROGRESS', 'CANCELLED'], // legacy
      'IN_PROGRESS': ['READY', 'ASSIGNED', 'CANCELLED'],
      'QUALITY_CHECK': ['READY', 'IN_PROGRESS'], // legacy
      'READY': ['DELIVERED', 'IN_PROGRESS', 'CANCELLED'],
      'DELIVERED': [],
      'CANCELLED': ['CREATED'],
    };

    const order = await this.prisma.jobOrder.findUnique({ where: { id: jobOrderId } });
    if (!order) throw new NotFoundException('Job order not found');

    const allowedTransitions = validTransitions[order.status] || [];
    if (!allowedTransitions.includes(status)) {
      throw new BadRequestException(`Cannot transition from ${order.status} to ${status}`);
    }

    // keep assignments in sync with the order status
    if (['IN_PROGRESS', 'READY', 'DELIVERED', 'CANCELLED'].includes(status)) {
      await this.prisma.jobAssignment.updateMany({ where: { jobOrderId }, data: { status } });
    }

    await this.prisma.jobStatusHistory.create({
      data: {
        jobOrderId,
        fromStatus: order.status,
        toStatus: status,
        changedBy: userId,
      },
    });

    const updated = await this.prisma.jobOrder.update({
      where: { id: jobOrderId },
      data: { status },
    });

    // Notify when job becomes READY (customer's order ready)
    if (status === 'READY') {
      await this.prisma.notification.create({
        data: {
          organizationId: order.organizationId,
          branchId: order.branchId,
          type: 'ORDER_READY',
          title: 'Job ready: ' + order.jobNumber,
          message: order.productDescription + ' for ' + order.customerName + ' is READY for delivery',
          relatedEntityType: 'JobOrder',
          relatedEntityId: order.id,
          status: 'UNREAD',
        },
      });
    }

    return updated;
  }

  async issueMaterial(data: {
    jobOrderId: string;
    jobAssignmentId: string;
    employeeId: string;
    metalType: string;
    purity: string;
    weight: number;
    quantity: number;
    issuedById: string;
    notes?: string;
  }) {
    return this.prisma.jobMaterialIssue.create({
      data: {
        jobOrderId: data.jobOrderId,
        jobAssignmentId: data.jobAssignmentId,
        employeeId: data.employeeId,
        metalType: data.metalType,
        purity: data.purity,
        weight: data.weight,
        quantity: data.quantity || 1,
        issuedById: data.issuedById,
        notes: data.notes,
      },
    });
  }

  async returnMaterial(data: {
    materialIssueId: string;
    jobOrderId: string;
    jobAssignmentId: string;
    weight: number;
    approvedWastagePercent: number;
    notes?: string;
  }) {
    const issue = await this.prisma.jobMaterialIssue.findUnique({
      where: { id: data.materialIssueId },
    });

    if (!issue) throw new NotFoundException('Material issue record not found');

    const difference = issue.weight - data.weight;
    const approvedWastage = issue.weight * (data.approvedWastagePercent / 100);
    const excessWastage = Math.max(0, difference - approvedWastage);

    return this.prisma.jobMaterialReturn.create({
      data: {
        materialIssueId: data.materialIssueId,
        jobOrderId: data.jobOrderId,
        jobAssignmentId: data.jobAssignmentId,
        weight: data.weight,
        difference,
        wastage: difference,
        approvedWastage,
        excessWastage,
        notes: data.notes,
      },
    });
  }

  async getEmployeeJobs(employeeId: string, organizationId: string) {
    return this.prisma.jobOrder.findMany({
      where: {
        organizationId,
        assignments: { some: { employeeId } },
      },
      include: {
        assignments: {
          where: { employeeId },
          include: { materials: true, materialReturns: true },
        },
      },
      orderBy: { expectedDelivery: 'asc' },
    });
  }

  /**
   * Record an advance payment against a job order (token money flow)
   */
  async addAdvance(
    jobOrderId: string,
    amount: number,
    paymentMode: string,
    reference: string,
    userId: string,
  ) {
    const order = await this.prisma.jobOrder.findUnique({ where: { id: jobOrderId } });
    if (!order) throw new NotFoundException('Job order not found');
    if (amount <= 0) throw new BadRequestException('Advance amount must be positive');

    return this.prisma.$transaction(async (tx) => {
      const newAdvance = order.advanceAmount + amount;
      const newBalance = Math.max(0, (order.estimatedAmount || 0) - newAdvance);

      await tx.jobOrder.update({
        where: { id: jobOrderId },
        data: { advanceAmount: newAdvance, balanceAmount: newBalance },
      });

      // Record payment in payment ledger
      const transactionId = `JOBADV-${Date.now()}`;
      const payment = await tx.payment.create({
        data: {
          organizationId: order.organizationId,
          branchId: order.branchId,
          transactionId,
          customerId: order.customerId || undefined,
          amount,
          paymentMode,
          reference: reference || undefined,
          employeeId: userId,
          relatedTransactionId: jobOrderId,
          relatedTransactionType: 'JOB_ORDER',
          notes: `Advance for ${order.jobNumber}`,
        },
      });

      // Update customer ledger (debit = money customer owes)
      if (order.customerId) {
        const last = await tx.customerLedger.findFirst({
          where: { customerId: order.customerId },
          orderBy: { createdAt: 'desc' },
        });
        const balance = (last?.balance || 0) - amount;
        await tx.customerLedger.create({
          data: {
            customerId: order.customerId,
            transactionType: 'JOB_ADVANCE',
            transactionId: payment.id,
            transactionNo: order.jobNumber,
            date: new Date(),
            debit: 0,
            credit: amount,
            balance,
            description: `Advance for ${order.jobNumber}`,
          },
        });
      }

      // Audit
      await tx.auditLog.create({
        data: {
          organizationId: order.organizationId,
          branchId: order.branchId,
          userId,
          userName: 'System',
          action: 'JOB_ADVANCE',
          entityType: 'JobOrder',
          entityId: jobOrderId,
          newValue: JSON.stringify({ amount, paymentMode }),
        },
      });

      return {
        jobOrderId,
        jobNumber: order.jobNumber,
        advanceAmount: newAdvance,
        balanceAmount: newBalance,
        payment,
      };
    });
  }

  /**
   * Generate a final sale bill from a READY/DELIVERED job order
   * Takes the job's advance as part-payment and bills the balance
   */
  async generateFinalBill(
    jobOrderId: string,
    data: {
      netWeight: number;
      ratePerGram: number;
      makingCharges?: number;
      makingChargeType?: string;
      makingChargeValue?: number;
      hsnCode?: string;
      billType?: string;
      discount?: number;
      userId: string;
    },
  ) {
    const order = await this.prisma.jobOrder.findUnique({
      where: { id: jobOrderId },
      include: { customer: true },
    });
    if (!order) throw new NotFoundException('Job order not found');
    if (!['READY', 'DELIVERED'].includes(order.status)) {
      throw new BadRequestException('Job must be READY or DELIVERED to generate final bill');
    }

    const settings = await this.prisma.shopSettings.findUnique({
      where: { organizationId: order.organizationId },
    });
    if (!settings) throw new BadRequestException('Shop settings not configured');

    // Build the bill number
    const isGst = data.billType !== 'NON_GST';
    const prefix = isGst ? 'GST' : 'NG';
    const year = new Date().getFullYear();
    const billNumber = `${prefix}-${year}-${String(settings.nextBillNumber).padStart(6, '0')}`;

    // Item calculation (single item from job)
    const netWeight = data.netWeight;
    const ratePerGram = data.ratePerGram;
    const metalValue = Math.round(netWeight * ratePerGram * 100) / 100;

    // Making charges
    const mType = data.makingChargeType || 'PERCENTAGE';
    const mValue = data.makingChargeValue || 10;
    let making = 0;
    if (mType === 'PERCENTAGE') making = metalValue * (mValue / 100);
    else if (mType === 'PER_GRAM') making = netWeight * mValue;
    else making = mValue;
    making = Math.round(making * 100) / 100;

    const discount = data.discount || 0;
    const taxableAmount = Math.round((metalValue + making - discount) * 100) / 100;

    // GST 3% (1.5% + 1.5%)
    let cgst = 0, sgst = 0;
    if (isGst) {
      cgst = Math.round(taxableAmount * 0.015 * 100) / 100;
      sgst = Math.round(taxableAmount * 0.015 * 100) / 100;
    }
    const totalTax = Math.round((cgst + sgst) * 100) / 100;
    const netAmountBeforeRound = Math.round((taxableAmount + totalTax) * 100) / 100;
    const roundOff = Math.round(Math.round(netAmountBeforeRound) - netAmountBeforeRound);
    const netAmount = Math.round((netAmountBeforeRound + roundOff) * 100) / 100;

    // Advance acts as payment
    const paidAmount = order.advanceAmount;
    const balanceAmount = Math.max(0, Math.round((netAmount - paidAmount) * 100) / 100);

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.create({
        data: {
          organizationId: order.organizationId,
          branchId: order.branchId,
          billNumber,
          billType: isGst ? 'GST' : 'NON_GST',
          status: 'CONFIRMED',
          customerId: order.customerId || undefined,
          customerName: order.customerName,
          customerMobile: order.customerMobile || undefined,
          billDate: new Date(),
          taxableAmount,
          cgst,
          sgst,
          igst: 0,
          totalTax,
          discount,
          discountType: 'FIXED',
          urdDeduction: 0,
          roundOff,
          grossAmount: metalValue + making,
          netAmount,
          paidAmount,
          balanceAmount,
          paymentMode: undefined,
          salesmanId: data.userId,
          narration: `Final bill for job ${order.jobNumber} - ${order.productDescription}`,
          isGst,
        },
      });

      // Sale item
      await tx.saleItem.create({
        data: {
          saleId: sale.id,
          particular: `${order.productDescription} (Job ${order.jobNumber})`,
          hsnCode: data.hsnCode || '7113',
          purity: order.purity,
          quantity: 1,
          grossWeight: netWeight,
          netWeight,
          ratePerGram,
          metalValue,
          makingCharges: making,
          chargeDetails: JSON.stringify([{ type: 'MAKING', calculationType: mType, value: mValue, amount: making }]),
          discount,
          cgst,
          sgst,
          totalAmount: netAmount,
          sortOrder: 0,
        },
      });

      // Record advance as payment against this bill
      if (order.advanceAmount > 0) {
        await tx.salePayment.create({
          data: {
            saleId: sale.id,
            amount: order.advanceAmount,
            paymentMode: 'ADVANCE',
            reference: order.jobNumber,
            date: new Date(),
            employeeId: data.userId,
            notes: `Advance from job ${order.jobNumber}`,
          },
        });
      }

      // Customer ledger entry
      if (order.customerId) {
        const last = await tx.customerLedger.findFirst({
          where: { customerId: order.customerId },
          orderBy: { createdAt: 'desc' },
        });
        const balance = (last?.balance || 0) + netAmount - paidAmount;
        await tx.customerLedger.create({
          data: {
            customerId: order.customerId,
            transactionType: 'SALE',
            transactionId: sale.id,
            transactionNo: billNumber,
            date: new Date(),
            debit: netAmount,
            credit: paidAmount,
            balance,
            description: `Final bill ${billNumber} (job ${order.jobNumber})`,
          },
        });
      }

      // Mark job as DELIVERED
      await tx.jobStatusHistory.create({
        data: {
          jobOrderId,
          fromStatus: order.status,
          toStatus: 'DELIVERED',
          changedBy: data.userId,
          notes: 'Delivered with final bill ' + billNumber,
        },
      });
      await tx.jobOrder.update({
        where: { id: jobOrderId },
        data: { status: 'DELIVERED' },
      });

      // Increment bill sequence
      await tx.shopSettings.update({
        where: { organizationId: order.organizationId },
        data: { nextBillNumber: settings.nextBillNumber + 1 },
      });

      return tx.sale.findUnique({ where: { id: sale.id }, include: { items: true, payments: true } });
    });
  }

  /**
   * Get job-work summary statistics for reports
   */
  async getStats(organizationId: string) {
    const where = { organizationId };
    const [total, active, ready, delivered, delayed] = await Promise.all([
      this.prisma.jobOrder.count({ where }),
      this.prisma.jobOrder.count({ where: { ...where, status: { in: ['CREATED', 'ASSIGNED', 'ACCEPTED', 'IN_PROGRESS', 'QUALITY_CHECK'] } } }),
      this.prisma.jobOrder.count({ where: { ...where, status: 'READY' } }),
      this.prisma.jobOrder.count({ where: { ...where, status: 'DELIVERED' } }),
      this.prisma.jobOrder.count({
        where: {
          ...where,
          status: { notIn: ['DELIVERED', 'CANCELLED'] },
          expectedDelivery: { lt: new Date() },
        },
      }),
    ]);

    const orders = await this.prisma.jobOrder.findMany({ where });
    const totalAdvance = orders.reduce((s, o) => s + o.advanceAmount, 0);
    const totalEstimated = orders.reduce((s, o) => s + o.estimatedAmount, 0);
    const totalBalance = orders.reduce((s, o) => s + o.balanceAmount, 0);

    return {
      total, active, ready, delivered, delayed,
      totalAdvance, totalEstimated, totalBalance,
    };
  }
}