import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

const DEFAULT_METALS = ['GOLD', 'SILVER', 'PLATINUM', 'PALLADIUM', 'ROSE_GOLD', 'WHITE_GOLD'];
const DEFAULT_PURITIES = ['24K', '22K', '20K', '18K', '14K', '10K', 'SILVER_999', 'SILVER_925', 'SILVER_900', 'SILVER_800', 'PLATINUM_950', 'PLATINUM_900'];

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async get(orgId: string) {
    let settings = await this.prisma.shopSettings.findUnique({ where: { organizationId: orgId } });
    if (!settings) {
      settings = await this.prisma.shopSettings.create({
        data: { organizationId: orgId, shopName: 'My Jewellery Shop' },
      });
    }
    // Parse custom catalogs if present
    const customMetals: string[] = settings.customMetals ? JSON.parse(settings.customMetals) : [];
    const customPurities: string[] = settings.customPurities ? JSON.parse(settings.customPurities) : [];

    return {
      ...settings,
      allMetals: Array.from(new Set([...DEFAULT_METALS, ...customMetals])),
      allPurities: Array.from(new Set([...DEFAULT_PURITIES, ...customPurities])),
      defaultMetals: DEFAULT_METALS,
      defaultPurities: DEFAULT_PURITIES,
      customMetals,
      customPurities,
    };
  }

  async update(orgId: string, data: any) {
    const existing = await this.prisma.shopSettings.findUnique({ where: { organizationId: orgId } });
    if (!existing) throw new NotFoundException('Settings not found');

    const update: any = {};
    for (const k of Object.keys(data)) {
      if (k === 'customMetals' || k === 'customPurities') {
        if (data[k] !== undefined) update[k] = JSON.stringify(data[k]);
      } else {
        update[k] = data[k];
      }
    }
    return this.prisma.shopSettings.update({ where: { organizationId: orgId }, data: update });
  }

  // Add a metal / purity to the catalog
  async addMetal(orgId: string, metal: string) {
    if (!metal || typeof metal !== 'string' || metal.trim().length === 0) {
      throw new BadRequestException('Metal name is required');
    }
    const normalized = metal.toUpperCase().replace(/\s+/g, '_').trim();
    const settings = await this.get(orgId);
    if (settings.allMetals.includes(normalized)) {
      throw new BadRequestException(`Metal "${normalized}" already exists`);
    }
    const customs = [...settings.customMetals, normalized];
    await this.update(orgId, { customMetals: customs });
    return { ...settings, allMetals: Array.from(new Set([...settings.defaultMetals, ...customs])), customMetals: customs };
  }

  async removeMetal(orgId: string, metal: string) {
    const settings = await this.get(orgId);
    if (settings.defaultMetals.includes(metal)) {
      throw new BadRequestException(`Cannot remove default metal "${metal}"`);
    }
    const customs = settings.customMetals.filter((m: string) => m !== metal);
    await this.update(orgId, { customMetals: customs });
    return { ...settings, allMetals: Array.from(new Set([...settings.defaultMetals, ...customs])), customMetals: customs };
  }

  async addPurity(orgId: string, purity: string) {
    if (!purity || typeof purity !== 'string' || purity.trim().length === 0) {
      throw new BadRequestException('Purity name is required');
    }
    const normalized = purity.toUpperCase().replace(/\s+/g, '_').trim();
    const settings = await this.get(orgId);
    if (settings.allPurities.includes(normalized)) {
      throw new BadRequestException(`Purity "${normalized}" already exists`);
    }
    const customs = [...settings.customPurities, normalized];
    await this.update(orgId, { customPurities: customs });
    return { ...settings, allPurities: Array.from(new Set([...settings.defaultPurities, ...customs])), customPurities: customs };
  }

  async removePurity(orgId: string, purity: string) {
    const settings = await this.get(orgId);
    if (settings.defaultPurities.includes(purity)) {
      throw new BadRequestException(`Cannot remove default purity "${purity}"`);
    }
    const customs = settings.customPurities.filter((p: string) => p !== purity);
    await this.update(orgId, { customPurities: customs });
    return { ...settings, allPurities: Array.from(new Set([...settings.defaultPurities, ...customs])), customPurities: customs };
  }
}
