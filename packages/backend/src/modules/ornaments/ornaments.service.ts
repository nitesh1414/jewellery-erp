import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

/**
 * Ornament master ("ledger master") — catalogue of ornaments with a
 * male / female / unisex classification used across inventory, billing
 * and job work.
 */
@Injectable()
export class OrnamentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(organizationId: string, query: { search?: string; gender?: string; category?: string; isActive?: string }) {
    const where: any = { organizationId };
    if (query.gender) where.gender = query.gender;
    if (query.category) where.category = query.category;
    if (query.isActive === 'true') where.isActive = true;
    if (query.isActive === 'false') where.isActive = false;
    if (query.search) {
      where.OR = [{ name: { contains: query.search } }, { category: { contains: query.search } }];
    }
    const [items, counts] = await Promise.all([
      this.prisma.ornamentType.findMany({ where, orderBy: [{ gender: 'asc' }, { name: 'asc' }] }),
      this.prisma.ornamentType.groupBy({ by: ['gender'], where: { organizationId }, _count: true }),
    ]);
    return { items, counts };
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
    return this.prisma.ornamentType.update({ where: { id }, data: update });
  }

  async remove(id: string, organizationId: string) {
    const existing = await this.prisma.ornamentType.findFirst({ where: { id, organizationId } });
    if (!existing) throw new NotFoundException('Ornament not found');
    await this.prisma.ornamentType.delete({ where: { id } });
    return { deleted: true };
  }
}
