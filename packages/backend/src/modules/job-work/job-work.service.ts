import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { LedgerService } from '../ledger/ledger.service';

/** Job work OUT → IN status flow. */
export const JOB_WORK_STATUSES = ['GIVEN', 'IN_PROCESS', 'COMPLETED', 'CANCELLED'] as const;
export const JOB_WORK_STATUS_LABELS: Record<string, string> = {
  GIVEN: 'Given to worker',
  IN_PROCESS: 'In process',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

const ALLOWED: Record<string, string[]> = {
  GIVEN: ['IN_PROCESS', 'COMPLETED', 'CANCELLED'],
  IN_PROCESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: ['GIVEN'],
};

function round2(n: any): number {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function round3(n: any): number {
  return Math.round((Number(n) || 0) * 1000) / 1000;
}

/** Net weight = gross − stone − other (never negative). */
function netWeightOf(gross: any, stone: any, other: any): number {
  const g = Number(gross) || 0;
  const s = Number(stone) || 0;
  const o = Number(other) || 0;
  return round3(Math.max(0, g - s - o));
}

/** Grams with up to 3 decimals and no trailing zeros: 15, 12.5, 10.25 … */
function g3(value: any): string {
  return String(Math.round((Number(value) || 0) * 1000) / 1000);
}

@Injectable()
export class JobWorkService {
  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
  ) { }

  // ---------------------------------------------------------------- helpers

  private async nextJobNumber(tx: any, organizationId: string): Promise<string> {
    const prefix = `JWO-${new Date().getFullYear()}-`;
    const last = await tx.jobWork.findFirst({
      where: { organizationId, jobNumber: { startsWith: prefix } },
      orderBy: { jobNumber: 'desc' },
    });
    const lastNum = last ? parseInt(String(last.jobNumber).split('-').pop() || '0', 10) : 0;
    return `${prefix}${String((Number.isFinite(lastNum) ? lastNum : 0) + 1).padStart(5, '0')}`;
  }

  /** Recompute the gram / value totals stored on the job work header. */
  private async recomputeTotals(tx: any, jobWorkId: string) {
    const [materials, items] = await Promise.all([
      tx.jobWorkMaterial.findMany({ where: { jobWorkId } }),
      tx.jobWorkItem.findMany({ where: { jobWorkId } }),
    ]);
    const issuedWeight = materials
      .filter((m: any) => String(m.kind).toUpperCase() === 'METAL')
      .reduce((s: number, m: any) => s + (Number(m.weight) || 0), 0);
    const issuedValue = materials.reduce((s: number, m: any) => s + (Number(m.value) || 0), 0);
    const received = items.filter((i: any) => i.status === 'RECEIVED');
    const receivedWeight = received.reduce((s: number, i: any) => s + (Number(i.netWeight) || 0), 0);

    await tx.jobWork.update({
      where: { id: jobWorkId },
      data: {
        totalIssuedWeight: round3(issuedWeight),
        totalIssuedValue: round2(issuedValue),
        totalReceivedWeight: round3(receivedWeight),
      },
    });
  }

  private async load(id: string, organizationId: string, tx: any = this.prisma) {
    const job = await tx.jobWork.findFirst({
      where: { id, organizationId },
      include: {
        worker: { select: { id: true, name: true, mobile: true, role: true } },
        items: { orderBy: { createdAt: 'asc' } },
        materials: { orderBy: { createdAt: 'asc' } },
        history: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!job) throw new NotFoundException('Job work not found');
    return job;
  }

  // ------------------------------------------------------------------ reads

  async findAll(
    organizationId: string,
    query: {
      search?: string;
      status?: string;
      workerId?: string;
      branchId?: string;
      startDate?: string;
      endDate?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const { search, status, workerId, branchId, startDate, endDate, page = 1, limit = 20 } = query;
    const where: any = { organizationId };
    if (branchId) where.branchId = branchId;
    if (status && status !== 'ALL') where.status = String(status).toUpperCase();
    if (workerId) where.workerId = workerId;
    if (startDate || endDate) {
      where.issueDate = {};
      if (startDate) where.issueDate.gte = new Date(startDate);
      if (endDate) where.issueDate.lte = new Date(endDate);
    }
    if (search) {
      where.OR = [
        { jobNumber: { contains: search, mode: 'insensitive' } },
        { workerName: { contains: search, mode: 'insensitive' } },
        { notes: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.jobWork.findMany({
        where,
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          worker: { select: { id: true, name: true, mobile: true, role: true } },
          items: { orderBy: { createdAt: 'asc' } },
          materials: { orderBy: { createdAt: 'asc' } },
        },
      }),
      this.prisma.jobWork.count({ where }),
    ]);

    return { items, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }

  async findById(id: string, organizationId: string) {
    return this.load(id, organizationId);
  }

  /** Counts + metal out + wages payable, for the dashboard cards. */
  async getStats(organizationId: string, branchId?: string) {
    const where: any = { organizationId };
    if (branchId) where.branchId = branchId;

    const [all, metalAccounts] = await Promise.all([
      this.prisma.jobWork.findMany({
        where,
        select: { status: true, totalIssuedWeight: true, totalIssuedValue: true, returnWeight: true, wages: true, wagesPaid: true, dueDate: true },
      }),
      this.prisma.ledgerAccount.findMany({
        where: { organizationId, type: 'METAL' },
        select: { id: true, name: true, metalType: true, purity: true, grams: true },
      }),
    ]);

    const byStatus: Record<string, number> = { GIVEN: 0, IN_PROCESS: 0, COMPLETED: 0, CANCELLED: 0 };
    let metalOut = 0;
    let metalValue = 0;
    let returned = 0;
    let wages = 0;
    let wagesPaid = 0;
    let overdue = 0;
    const today = new Date();

    for (const j of all) {
      byStatus[j.status] = (byStatus[j.status] || 0) + 1;
      const open = j.status === 'GIVEN' || j.status === 'IN_PROCESS';
      if (open) {
        metalOut += Number(j.totalIssuedWeight) || 0;
        metalValue += Number(j.totalIssuedValue) || 0;
      }
      returned += Number(j.returnWeight) || 0;
      wages += Number(j.wages) || 0;
      wagesPaid += Number(j.wagesPaid) || 0;
      if (open && j.dueDate && new Date(j.dueDate) < today) overdue += 1;
    }

    return {
      total: all.length,
      byStatus,
      given: byStatus.GIVEN || 0,
      inProcess: byStatus.IN_PROCESS || 0,
      completed: byStatus.COMPLETED || 0,
      cancelled: byStatus.CANCELLED || 0,
      open: (byStatus.GIVEN || 0) + (byStatus.IN_PROCESS || 0),
      overdue,
      metalOutGrams: round3(metalOut),
      metalOutValue: round2(metalValue),
      returnedGrams: round3(returned),
      wagesPayable: round2(wages - wagesPaid),
      wagesTotal: round2(wages),
      wagesPaid: round2(wagesPaid),
      metalAccounts,
    };
  }

  // -------------------------------------------------------- job work OUT

  async create(data: any, organizationId: string, branchId: string, userId: string) {
    const workerName = (data.workerName || '').toString().trim();
    if (!workerName) throw new BadRequestException('Worker name is required');

    const materials = (data.materials || []).filter(
      (m: any) => m && (Number(m.weight) > 0 || Number(m.quantity) > 0 || Number(m.value) > 0),
    );
    const items = (data.items || []).filter(
      (i: any) => i && (i.ornament || i.category || Number(i.expectedWeight) > 0 || Number(i.quantity) > 0),
    );

    return this.prisma.$transaction(async (tx) => {
      const jobNumber = await this.nextJobNumber(tx, organizationId);
      const issueDate = data.issueDate ? new Date(data.issueDate) : new Date();

      const job = await tx.jobWork.create({
        data: {
          organizationId,
          branchId,
          jobNumber,
          workerId: data.workerId || null,
          workerName,
          workerMobile: data.workerMobile || null,
          issueDate,
          dueDate: data.dueDate ? new Date(data.dueDate) : null,
          status: 'GIVEN',
          notes: data.notes || null,
          createdById: userId,
        },
      });

      // ---- material handed over: metal leaves its metal ledger right away
      for (const m of materials) {
        const isMetal = String(m.kind || 'METAL').toUpperCase() !== 'OTHER';
        const weight = isMetal ? Number(m.weight) || 0 : 0;
        const quantity = isMetal ? 1 : Number(m.quantity) || 1;
        const rate = Number(m.rate) || 0;
        const value = Number(m.value) > 0
          ? Number(m.value)
          : round2(isMetal ? weight * rate : quantity * rate);

        let accountId: string | null = null;
        if (isMetal && weight > 0) {
          const account = await this.ledger.resolveMetalAccount(
            {
              organizationId,
              branchId,
              accountId: m.metalLedgerAccountId || null,
              metalType: m.metalType,
              purity: m.purity,
            },
            tx,
          );
          accountId = account.id;
          await this.ledger.postMetalMovement(
            {
              organizationId,
              branchId,
              accountId: account.id,
              type: 'DEBIT',
              grams: weight,
              rate,
              metalType: m.metalType,
              purity: m.purity,
              date: issueDate,
              description: `Job work OUT ${jobNumber} — ${g3(weight)} g ${m.metalType || ''} ${m.purity || ''} issued to ${workerName}`.trim(),
              reference: jobNumber,
              linkedTo: 'JOB_WORK_ISSUE',
              linkedId: job.id,
              employeeId: job.workerId || undefined,
              employeeName: workerName,
            },
            tx,
          );
        }

        await tx.jobWorkMaterial.create({
          data: {
            jobWorkId: job.id,
            kind: isMetal ? 'METAL' : 'OTHER',
            metalType: isMetal ? m.metalType || null : null,
            purity: isMetal ? m.purity || null : null,
            name: m.name || (isMetal ? `${m.metalType || ''} ${m.purity || ''}`.trim() : null),
            weight: round3(weight),
            quantity,
            rate,
            value: round2(value),
            metalLedgerAccountId: accountId,
            notes: m.notes || null,
          },
        });
      }

      // ---- ornaments the worker has to make
      for (const it of items) {
        await tx.jobWorkItem.create({
          data: {
            jobWorkId: job.id,
            ornament: it.ornament || null,
            category: it.category || null,
            metalType: it.metalType || data.metalType || 'GOLD',
            purity: it.purity || data.purity || '22K',
            quantity: Number(it.quantity) || 1,
            expectedWeight: Number(it.expectedWeight) || 0,
            currentRate: Number(it.currentRate) || 0,
            makingChargeType: it.makingChargeType || null,
            makingChargeValue: Number(it.makingChargeValue) || 0,
            huid: it.huid || null,
            hsnCode: it.hsnCode || null,
            size: it.size || null,
            notes: it.notes || null,
          },
        });
      }

      await tx.jobWorkStatusLog.create({
        data: {
          jobWorkId: job.id,
          toStatus: 'GIVEN',
          changedBy: userId,
          notes: `${g3(materials.reduce((s: number, m: any) => s + (Number(m.weight) || 0), 0))} g issued to ${workerName}`,
        },
      });

      await this.recomputeTotals(tx, job.id);
      return this.load(job.id, organizationId, tx);
    });
  }

  async update(id: string, data: any, organizationId: string, userId: string) {
    const job = await this.load(id, organizationId);
    if (job.status === 'COMPLETED') throw new BadRequestException('A completed job work cannot be edited');
    if (job.status === 'CANCELLED') throw new BadRequestException('A cancelled job work cannot be edited');

    return this.prisma.$transaction(async (tx) => {
      await tx.jobWork.update({
        where: { id },
        data: {
          workerId: data.workerId !== undefined ? data.workerId || null : job.workerId,
          workerName: data.workerName || job.workerName,
          workerMobile: data.workerMobile !== undefined ? data.workerMobile || null : job.workerMobile,
          issueDate: data.issueDate ? new Date(data.issueDate) : job.issueDate,
          dueDate: data.dueDate !== undefined ? (data.dueDate ? new Date(data.dueDate) : null) : job.dueDate,
          notes: data.notes !== undefined ? data.notes : job.notes,
        },
      });

      // Material changed → put the old metal back, then issue the new lot
      if (Array.isArray(data.materials)) {
        await this.ledger.reverseMetalMovements(organizationId, 'JOB_WORK_ISSUE', id, tx);
        await tx.jobWorkMaterial.deleteMany({ where: { jobWorkId: id } });

        for (const m of data.materials) {
          const isMetal = String(m.kind || 'METAL').toUpperCase() !== 'OTHER';
          const weight = isMetal ? Number(m.weight) || 0 : 0;
          const quantity = isMetal ? 1 : Number(m.quantity) || 1;
          const rate = Number(m.rate) || 0;
          const value = Number(m.value) > 0 ? Number(m.value) : round2(isMetal ? weight * rate : quantity * rate);
          if (!isMetal && quantity <= 0 && !value) continue;

          let accountId: string | null = null;
          if (isMetal && weight > 0) {
            const account = await this.ledger.resolveMetalAccount(
              { organizationId, branchId: job.branchId, accountId: m.metalLedgerAccountId || null, metalType: m.metalType, purity: m.purity },
              tx,
            );
            accountId = account.id;
            await this.ledger.postMetalMovement(
              {
                organizationId,
                branchId: job.branchId,
                accountId: account.id,
                type: 'DEBIT',
                grams: weight,
                rate,
                metalType: m.metalType,
                purity: m.purity,
                date: job.issueDate,
                description: `Job work OUT ${job.jobNumber} — ${g3(weight)} g ${m.metalType || ''} ${m.purity || ''} issued to ${data.workerName || job.workerName}`.trim(),
                reference: job.jobNumber,
                linkedTo: 'JOB_WORK_ISSUE',
                linkedId: id,
                employeeId: job.workerId || undefined,
                employeeName: data.workerName || job.workerName,
              },
              tx,
            );
          }

          await tx.jobWorkMaterial.create({
            data: {
              jobWorkId: id,
              kind: isMetal ? 'METAL' : 'OTHER',
              metalType: isMetal ? m.metalType || null : null,
              purity: isMetal ? m.purity || null : null,
              name: m.name || (isMetal ? `${m.metalType || ''} ${m.purity || ''}`.trim() : null),
              weight: round3(weight),
              quantity,
              rate,
              value: round2(value),
              metalLedgerAccountId: accountId,
              notes: m.notes || null,
            },
          });
        }
      }

      // Ornament lines can still be edited while nothing has been received
      if (Array.isArray(data.items)) {
        for (const it of data.items) {
          if (it?.id) {
            const existing = await tx.jobWorkItem.findFirst({ where: { id: it.id, jobWorkId: id } });
            if (!existing) continue;
            if (existing.status === 'RECEIVED') continue; // already a stock item
            await tx.jobWorkItem.update({
              where: { id: it.id },
              data: {
                ornament: it.ornament ?? existing.ornament,
                category: it.category ?? existing.category,
                metalType: it.metalType || existing.metalType,
                purity: it.purity || existing.purity,
                quantity: Number(it.quantity) || existing.quantity,
                expectedWeight: Number(it.expectedWeight) || 0,
                currentRate: Number(it.currentRate) || existing.currentRate,
                makingChargeType: it.makingChargeType ?? existing.makingChargeType,
                makingChargeValue: Number(it.makingChargeValue) || existing.makingChargeValue,
                huid: it.huid ?? existing.huid,
                hsnCode: it.hsnCode ?? existing.hsnCode,
                size: it.size ?? existing.size,
                notes: it.notes ?? existing.notes,
              },
            });
          } else {
            await tx.jobWorkItem.create({
              data: {
                jobWorkId: id,
                ornament: it.ornament || null,
                category: it.category || null,
                metalType: it.metalType || 'GOLD',
                purity: it.purity || '22K',
                quantity: Number(it.quantity) || 1,
                expectedWeight: Number(it.expectedWeight) || 0,
                currentRate: Number(it.currentRate) || 0,
                makingChargeType: it.makingChargeType || null,
                makingChargeValue: Number(it.makingChargeValue) || 0,
                huid: it.huid || null,
                hsnCode: it.hsnCode || null,
                size: it.size || null,
                notes: it.notes || null,
              },
            });
          }
        }
        if (data.replaceItems) {
          const keep = data.items.map((i: any) => i?.id).filter(Boolean);
          await tx.jobWorkItem.deleteMany({ where: { jobWorkId: id, status: 'PENDING', id: { notIn: keep.length ? keep : ['__none__'] } } });
        }
      }

      await this.recomputeTotals(tx, id);
      return this.load(id, organizationId, tx);
    });
  }

  async updateStatus(id: string, status: string, organizationId: string, userId: string, notes?: string) {
    const next = String(status || '').toUpperCase();
    if (!JOB_WORK_STATUSES.includes(next as any)) throw new BadRequestException(`Unknown status ${status}`);

    const job = await this.load(id, organizationId);
    if (job.status === next) return job;
    if (!ALLOWED[job.status]?.includes(next)) {
      throw new BadRequestException(`Cannot move a job work from ${JOB_WORK_STATUS_LABELS[job.status] || job.status} to ${JOB_WORK_STATUS_LABELS[next] || next}`);
    }

    return this.prisma.$transaction(async (tx) => {
      // Cancelling puts every issued gram back into its metal ledger
      if (next === 'CANCELLED') {
        await this.ledger.reverseMetalMovements(organizationId, 'JOB_WORK_ISSUE', id, tx);
        await this.ledger.reverseMetalMovements(organizationId, 'JOB_WORK_RETURN', id, tx);
        await tx.jobWork.update({ where: { id }, data: { status: next, completedDate: null, returnWeight: 0 } });
      } else if (next === 'GIVEN' && job.status === 'CANCELLED') {
        // re-opening issues the metal again
        for (const m of job.materials) {
          if (String(m.kind).toUpperCase() !== 'METAL' || !(Number(m.weight) > 0)) continue;
          const account = await this.ledger.resolveMetalAccount(
            { organizationId, branchId: job.branchId, accountId: m.metalLedgerAccountId || null, metalType: m.metalType, purity: m.purity },
            tx,
          );
          await tx.jobWorkMaterial.update({ where: { id: m.id }, data: { metalLedgerAccountId: account.id } });
          await this.ledger.postMetalMovement(
            {
              organizationId,
              branchId: job.branchId,
              accountId: account.id,
              type: 'DEBIT',
              grams: Number(m.weight) || 0,
              rate: Number(m.rate) || 0,
              metalType: m.metalType,
              purity: m.purity,
              date: new Date(),
              description: `Job work OUT ${job.jobNumber} — ${g3(m.weight)} g ${m.metalType || ''} ${m.purity || ''} re-issued to ${job.workerName}`.trim(),
              reference: job.jobNumber,
              linkedTo: 'JOB_WORK_ISSUE',
              linkedId: id,
              employeeId: job.workerId || undefined,
              employeeName: job.workerName,
            },
            tx,
          );
        }
        await tx.jobWork.update({ where: { id }, data: { status: next, completedDate: null } });
      } else {
        await tx.jobWork.update({
          where: { id },
          data: { status: next, completedDate: next === 'COMPLETED' ? new Date() : null },
        });
      }

      await tx.jobWorkStatusLog.create({
        data: { jobWorkId: id, fromStatus: job.status, toStatus: next, changedBy: userId, notes: notes || null },
      });

      return this.load(id, organizationId, tx);
    });
  }

  // --------------------------------------------------------- job work IN

  /**
   * Receive the finished ornaments. Each received line becomes a jewellery
   * item with its own barcode; the metal handed out was already taken out of
   * the metal ledger when the job was issued, so only the wastage / scrap the
   * worker brings back is credited back into it.
   */
  async receive(
    id: string,
    data: {
      items?: any[];
      returnWeight?: number;
      returnMetalType?: string;
      returnPurity?: string;
      returnRate?: number;
      wages?: number;
      wagesPaid?: number;
      paymentMode?: string;
      reference?: string;
      receivedDate?: string;
      notes?: string;
    },
    organizationId: string,
    branchId: string,
    userId: string,
  ) {
    const job = await this.load(id, organizationId);
    if (job.status === 'CANCELLED') throw new BadRequestException('A cancelled job work cannot be received');
    if (job.status === 'COMPLETED') throw new BadRequestException('This job work is already completed');

    const receivedDate = data.receivedDate ? new Date(data.receivedDate) : new Date();
    const lines = (data.items || []).filter((i: any) => i && Number(i.grossWeight) > 0);
    if (!lines.length) throw new BadRequestException('Enter the gross weight of at least one finished ornament');

    return this.prisma.$transaction(async (tx) => {
      const created: any[] = [];

      for (const line of lines) {
        const record = line?.id ? job.items.find((i: any) => i.id === line.id) : null;
        if (record && record.status === 'RECEIVED') continue;

        const grossWeight = Number(line.grossWeight) || 0;
        const stoneWeight = Number(line.stoneWeight) || 0;
        const otherWeight = Number(line.otherWeight) || 0;
        const netWeight = Number(line.netWeight) > 0 ? round3(line.netWeight) : netWeightOf(grossWeight, stoneWeight, otherWeight);
        const metalType = line.metalType || record?.metalType || 'GOLD';
        const purity = line.purity || record?.purity || '22K';
        const currentRate = Number(line.currentRate) || Number(record?.currentRate) || 0;
        const ornament = line.ornament || record?.ornament || null;
        const category = line.category || record?.category || null;
        const hsnCode = line.hsnCode || record?.hsnCode || '7113';
        const makingChargeType = line.makingChargeType || record?.makingChargeType || 'PERCENTAGE';
        const makingChargeValue = Number(line.makingChargeValue) || Number(record?.makingChargeValue) || 0;
        const labourCharge = Number(line.labourCharge) || 0;

        // --- barcode (same series as the rest of the inventory)
        const lastBarcode = await tx.barcode.findFirst({ where: { organizationId }, orderBy: { createdAt: 'desc' } });
        const nextSeq = lastBarcode ? parseInt(lastBarcode.barcode.replace(/\D/g, ''), 10) + 1 : 1;
        const barcodeStr = `G${String(nextSeq).padStart(8, '0')}`;

        const barcodeRecord = await tx.barcode.create({
          data: { organizationId, branchId, barcode: barcodeStr, jewelleryItemId: null, isAssigned: true },
        });

        const item = await tx.jewelleryItem.create({
          data: {
            organizationId,
            branchId,
            barcode: barcodeStr,
            sku: line.sku || `SKU-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            category: category || '',
            subCategory: line.subCategory || '',
            designCode: line.designCode || ornament || barcodeStr,
            metalType,
            purity,
            grossWeight,
            stoneWeight,
            ornament,
            ornamentGender: line.ornamentGender || null,
            otherWeight,
            netWeight,
            quantity: Number(line.quantity) || Number(record?.quantity) || 1,
            size: line.size || record?.size || '',
            color: line.color || '',
            brand: line.brand || '',
            purchaseRate: currentRate,
            currentRate,
            makingChargeType,
            makingChargeValue,
            hallmarkNumber: line.huid || record?.huid || '',
            certificateNumber: '',
            hsnCode,
            status: 'IN_STOCK',
            location: '',
            purchaseDate: receivedDate,
          },
        });

        await tx.barcode.update({
          where: { id: barcodeRecord.id },
          data: { jewelleryItemId: item.id, isAssigned: true },
        });

        await tx.stockTransaction.create({
          data: {
            organizationId,
            branchId,
            transactionType: 'PURCHASE',
            transactionId: item.id,
            jewelleryItemId: item.id,
            barcode: barcodeStr,
            metalType,
            purity,
            weight: netWeight,
            quantity: item.quantity,
            rate: currentRate,
            value: round2(netWeight * currentRate),
            reference: job.jobNumber,
            notes: `Job work IN ${job.jobNumber} — ${ornament || item.designCode} made by ${job.workerName}`,
            createdById: userId,
          },
        });

        if (record) {
          await tx.jobWorkItem.update({
            where: { id: record.id },
            data: {
              grossWeight,
              stoneWeight,
              otherWeight,
              netWeight,
              currentRate,
              ornament,
              category,
              metalType,
              purity,
              huid: line.huid || record.huid || null,
              hsnCode,
              size: line.size || record.size || null,
              makingChargeType,
              makingChargeValue,
              labourCharge,
              jewelleryItemId: item.id,
              barcode: barcodeStr,
              status: 'RECEIVED',
              receivedAt: receivedDate,
            },
          });
        }

        created.push({ id: item.id, barcode: barcodeStr, netWeight, ornament });
      }

      // --- wastage / scrap the worker brought back goes back into the metal ledger
      const returnWeight = Number(data.returnWeight) || 0;
      if (returnWeight > 0) {
        const metalType = data.returnMetalType || job.materials.find((m: any) => String(m.kind).toUpperCase() === 'METAL')?.metalType || 'GOLD';
        const purity = data.returnPurity || job.materials.find((m: any) => String(m.kind).toUpperCase() === 'METAL')?.purity || '22K';
        const rate = Number(data.returnRate) || Number(job.materials.find((m: any) => String(m.kind).toUpperCase() === 'METAL')?.rate) || 0;
        const account = await this.ledger.resolveMetalAccount(
          { organizationId, branchId, accountId: null, metalType, purity },
          tx,
        );
        await this.ledger.postMetalMovement(
          {
            organizationId,
            branchId,
            accountId: account.id,
            type: 'CREDIT',
            grams: returnWeight,
            rate,
            metalType,
            purity,
            date: receivedDate,
            description: `Job work IN ${job.jobNumber} — ${g3(returnWeight)} g ${metalType} ${purity} wastage / scrap returned by ${job.workerName}`,
            reference: job.jobNumber,
            linkedTo: 'JOB_WORK_RETURN',
            linkedId: id,
            employeeId: job.workerId || undefined,
            employeeName: job.workerName,
          },
          tx,
        );
      }

      // --- labour / making charges payable to the worker
      const wages = Number(data.wages) || 0;
      const wagesPaid = Math.min(Number(data.wagesPaid) || 0, wages);
      if (wagesPaid > 0 && job.workerId) {
        await tx.workerPayment.create({
          data: {
            organizationId,
            branchId,
            employeeId: job.workerId,
            type: 'PAYMENT',
            amount: wagesPaid,
            paymentMode: data.paymentMode || 'CASH',
            reference: data.reference || job.jobNumber,
            date: receivedDate,
            notes: `Job work wages — ${job.jobNumber}`,
          },
        });
      }

      const receivedCount = await tx.jobWorkItem.count({ where: { jobWorkId: id, status: 'RECEIVED' } });
      const totalLines = await tx.jobWorkItem.count({ where: { jobWorkId: id } });
      const allReceived = totalLines > 0 && receivedCount >= totalLines;

      await tx.jobWork.update({
        where: { id },
        data: {
          status: allReceived ? 'COMPLETED' : 'IN_PROCESS',
          completedDate: allReceived ? receivedDate : null,
          returnWeight: round3(returnWeight),
          wages,
          wagesPaid,
          notes: data.notes !== undefined ? data.notes : job.notes,
        },
      });

      await tx.jobWorkStatusLog.create({
        data: {
          jobWorkId: id,
          fromStatus: job.status,
          toStatus: allReceived ? 'COMPLETED' : 'IN_PROCESS',
          changedBy: userId,
          notes: `${created.length} ornament(s) received${returnWeight > 0 ? `, ${g3(returnWeight)} g scrap returned` : ''} — barcodes ${created.map((c) => c.barcode).join(', ')}`,
        },
      });

      await this.recomputeTotals(tx, id);
      const updated = await this.load(id, organizationId, tx);
      return { ...updated, receivedItems: created };
    });
  }

  async remove(id: string, organizationId: string) {
    const job = await this.load(id, organizationId);
    await this.prisma.$transaction(async (tx) => {
      // Metal goes back to the ledger before the record disappears
      await this.ledger.reverseMetalMovements(organizationId, 'JOB_WORK_ISSUE', id, tx);
      await this.ledger.reverseMetalMovements(organizationId, 'JOB_WORK_RETURN', id, tx);
      await tx.jobWork.delete({ where: { id } });
    });
    return { deleted: true, jobNumber: job.jobNumber };
  }
}
