import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class RatesService {
  constructor(private prisma: PrismaService) {}

  /**
   * Daily rate schedule.
   *
   * Rates saved earlier today must stay visible, so the cut-off is the END of
   * today (the previous "start of today" filter hid a row the moment it was
   * saved, because saving stamps it with the current time).
   */
  async getCurrentRates(organizationId: string) {
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    return this.prisma.rateMaster.findMany({
      where: { organizationId, effectiveDate: { lte: endOfToday } },
      orderBy: [{ metalType: 'asc' }, { purity: 'asc' }],
    });
  }

  /** Historical rates — every change, newest first, with its date. */
  async getRateHistory(organizationId: string, limit = 200) {
    const history = await this.prisma.rateHistory.findMany({
      where: { rateMaster: { organizationId } },
      orderBy: [{ changedAt: 'desc' }],
      take: Number(limit) || 200,
    });
    // The rate that replaced each historical row (for a "from → to" view)
    const masterIds = Array.from(new Set(history.map((h) => h.rateMasterId)));
    const masters = masterIds.length
      ? await this.prisma.rateMaster.findMany({ where: { id: { in: masterIds } } })
      : [];
    const byId = new Map<string, any>(masters.map((m) => [m.id, m]));
    return history.map((h) => ({
      id: h.id,
      rateMasterId: h.rateMasterId,
      metalType: h.metalType,
      purity: h.purity,
      rate: h.rate,
      previousRate: h.rate,
      currentRate: byId.get(h.rateMasterId)?.rate ?? null,
      effectiveDate: h.effectiveDate,
      changedAt: h.changedAt,
    }));
  }

  async updateRate(id: string, rate: number, userId: string) {
    const existing = await this.prisma.rateMaster.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Rate not found');

    // Save history
    await this.prisma.rateHistory.create({
      data: {
        rateMasterId: id,
        metalType: existing.metalType,
        purity: existing.purity,
        rate: existing.rate,
        effectiveDate: existing.effectiveDate,
      },
    });

    return this.prisma.rateMaster.update({
      where: { id },
      data: { rate, effectiveDate: new Date() },
    });
  }

  async create(data: { organizationId: string; metalType: string; purity: string; rate: number }) {
    return this.prisma.rateMaster.create({ data: { ...data, effectiveDate: new Date() } });
  }

  /**
   * Create the rate for a metal + purity, or update it when one already
   * exists — the schedule lists every metal × purity, so saving an empty row
   * must add the rate instead of failing or creating a duplicate.
   */
  async upsertRate(data: {
    organizationId: string;
    metalType: string;
    purity: string;
    rate: number;
    effectiveDate?: Date | string;
  }) {
    const metalType = String(data.metalType || '').toUpperCase();
    const purity = String(data.purity || '').toUpperCase();
    const rate = Number(data.rate);
    if (!metalType || !purity) throw new BadRequestException('Metal and purity are required');
    if (!Number.isFinite(rate) || rate < 0) throw new BadRequestException('Enter a valid rate');

    const effectiveDate = data.effectiveDate ? new Date(data.effectiveDate) : new Date();
    const existing = await this.prisma.rateMaster.findFirst({
      where: { organizationId: data.organizationId, metalType, purity },
    });

    if (existing) {
      await this.prisma.rateHistory.create({
        data: {
          rateMasterId: existing.id,
          metalType,
          purity,
          rate: existing.rate,
          effectiveDate: existing.effectiveDate,
        },
      });
      return this.prisma.rateMaster.update({
        where: { id: existing.id },
        data: { rate, effectiveDate },
      });
    }

    return this.prisma.rateMaster.create({
      data: { organizationId: data.organizationId, metalType, purity, rate, effectiveDate },
    });
  }
}
