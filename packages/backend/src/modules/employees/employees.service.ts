import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

/**
 * Worker / employee master with salary & payment tracking.
 * Used by job orders for assignments (goldsmiths, karigars, polishers…).
 */
@Injectable()
export class EmployeesService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, query: { search?: string; role?: string; isActive?: string }) {
    const where: any = { organizationId };
    if (query.role) where.role = query.role;
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    if (query.search) {
      where.OR = [
        { name: { contains: query.search } },
        { employeeCode: { contains: query.search } },
        { mobile: { contains: query.search } },
      ];
    }
    const employees = await this.prisma.employee.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { payments: true } } },
    });
    return employees;
  }

  async findById(id: string, organizationId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, organizationId },
      include: {
        payments: { orderBy: { date: 'desc' }, take: 100 },
      },
    });
    if (!employee) throw new NotFoundException('Worker not found');
    const totals = await this.prisma.workerPayment.aggregate({
      where: { employeeId: id, organizationId },
      _sum: { amount: true },
    });
    const salaryTotals = await this.prisma.workerPayment.aggregate({
      where: { employeeId: id, organizationId, type: 'SALARY' },
      _sum: { amount: true },
    });
    const advanceTotals = await this.prisma.workerPayment.aggregate({
      where: { employeeId: id, organizationId, type: 'ADVANCE' },
      _sum: { amount: true },
    });
    return {
      ...employee,
      totalPaid: totals._sum.amount || 0,
      totalSalary: salaryTotals._sum.amount || 0,
      totalAdvance: advanceTotals._sum.amount || 0,
    };
  }

  async create(data: any, organizationId: string) {
    const count = await this.prisma.employee.count({ where: { organizationId } });
    const employeeCode = data.employeeCode || `EMP${String(count + 1).padStart(4, '0')}`;
    const existing = await this.prisma.employee.findFirst({ where: { organizationId, employeeCode } });
    if (existing) throw new BadRequestException(`Employee code ${employeeCode} already exists`);
    return this.prisma.employee.create({
      data: {
        organizationId,
        branchId: data.branchId || null,
        employeeCode,
        name: data.name,
        mobile: data.mobile || null,
        email: data.email || null,
        role: data.role || 'GOLDSMITH',
        department: data.department || null,
        designation: data.designation || null,
        salary: data.salary ? Number(data.salary) : null,
      },
    });
  }

  async update(id: string, data: any, organizationId: string) {
    const existing = await this.prisma.employee.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Worker not found');
    const update: any = {};
    for (const key of ['name', 'mobile', 'email', 'role', 'department', 'designation', 'employeeCode']) {
      if (data[key] !== undefined) update[key] = data[key];
    }
    if (data.salary !== undefined) update.salary = data.salary === null ? null : Number(data.salary);
    if (data.isActive !== undefined) update.isActive = !!data.isActive;
    return this.prisma.employee.update({ where: { id }, data: update });
  }

  async remove(id: string, organizationId: string) {
    const existing = await this.prisma.employee.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Worker not found');
    // detach assignments? keep history — just deactivate is safer, but hard delete requested
    const [assignments] = await Promise.all([this.prisma.jobAssignment.count({ where: { employeeId: id } })]);
    if (assignments > 0) {
      // keep history: deactivate instead of delete
      await this.prisma.employee.update({ where: { id }, data: { isActive: false } });
      await this.prisma.workerPayment.deleteMany({ where: { employeeId: id } });
      return { deleted: false, deactivated: true, message: 'Worker has job history — deactivated instead of deleted' };
    }
    await this.prisma.workerPayment.deleteMany({ where: { employeeId: id } });
    await this.prisma.employee.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Record a salary / payment / advance for a worker.
   * SALARY  → monthly salary paid
   * PAYMENT → piece-rate / per-job payment
   * ADVANCE → advance against future salary
   */
  async addPayment(employeeId: string, data: any, organizationId: string, userId?: string) {
    const employee = await this.prisma.employee.findFirst({ where: { id: employeeId, organizationId } });
    if (!employee) throw new NotFoundException('Worker not found');
    const amount = Number(data.amount);
    if (!amount || amount <= 0) throw new BadRequestException('Amount must be positive');
    const type = ['SALARY', 'PAYMENT', 'ADVANCE'].includes(data.type) ? data.type : 'PAYMENT';

    return this.prisma.$transaction(async (tx) => {
      const payment = await tx.workerPayment.create({
        data: {
          organizationId,
          branchId: employee.branchId,
          employeeId,
          type,
          amount,
          periodMonth: data.periodMonth || null,
          paymentMode: data.paymentMode || 'CASH',
          reference: data.reference || null,
          date: data.date ? new Date(data.date) : new Date(),
          notes: data.notes || null,
        },
      });
      await tx.auditLog.create({
        data: {
          organizationId,
          branchId: employee.branchId,
          userId: userId || 'system',
          userName: 'System',
          action: 'WORKER_PAYMENT',
          entityType: 'Employee',
          entityId: employeeId,
          newValue: JSON.stringify({ type, amount, mode: payment.paymentMode }),
        },
      });
      return payment;
    });
  }

  async listPayments(organizationId: string, query: { employeeId?: string; type?: string; page?: number; limit?: number; fromDate?: string; toDate?: string }) {
    const page = Number(query.page ?? 1) || 1;
    const limit = Math.min(200, Number(query.limit ?? 50) || 50);
    const where: any = { organizationId };
    if (query.employeeId) where.employeeId = query.employeeId;
    if (query.type) where.type = query.type;
    if (query.fromDate || query.toDate) {
      where.date = {};
      if (query.fromDate) where.date.gte = new Date(query.fromDate);
      if (query.toDate) where.date.lte = new Date(query.toDate);
    }
    const [items, total, sum] = await Promise.all([
      this.prisma.workerPayment.findMany({
        where,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { employee: { select: { name: true, employeeCode: true, role: true } } },
      }),
      this.prisma.workerPayment.count({ where }),
      this.prisma.workerPayment.aggregate({ where, _sum: { amount: true } }),
    ]);
    return { items, total, page, limit, totalAmount: sum._sum.amount || 0 };
  }
}
