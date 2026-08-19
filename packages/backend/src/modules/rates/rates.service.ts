import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class RatesService {
  constructor(private prisma: PrismaService) {}

  async getCurrentRates(organizationId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return this.prisma.rateMaster.findMany({
      where: { organizationId, effectiveDate: { lte: today } },
      orderBy: [{ metalType: 'asc' }, { purity: 'asc' }],
    });
  }

  async updateRate(id: string, rate: number, userId: string) {
    const existing = await this.prisma.rateMaster.findUnique({ where: { id } });
    if (!existing) throw new Error('Rate not found');

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
}
