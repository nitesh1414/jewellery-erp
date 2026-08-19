import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { SettingsService } from './settings.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma.service';

@Controller('settings')
@UseGuards(JwtAuthGuard)
export class SettingsController {
  constructor(
    private settingsService: SettingsService,
    private prisma: PrismaService,
  ) {}

  // ====== standard CRUD ======
  @Get()
  async get(@CurrentUser() u: any) {
    return this.settingsService.get(u.organizationId);
  }

  @Put()
  async update(@CurrentUser() u: any, @Body() body: any) {
    return this.settingsService.update(u.organizationId, body);
  }

  // ====== setup wizard ======
  @Get('setup/status')
  async setupStatus(@CurrentUser() u: any) {
    const settings = await this.settingsService.get(u.organizationId);
    return {
      setupCompleted: settings.setupCompleted,
      setupStep: settings.setupStep,
      shopName: settings.shopName,
    };
  }

  @Post('setup/complete')
  async markSetupComplete(@CurrentUser() u: any, @Body() body: any) {
    return this.prisma.shopSettings.update({
      where: { organizationId: u.organizationId },
      data: {
        setupCompleted: true,
        setupStep: 4,
        shopName: body.shopName || 'My Jewellery Shop',
        shopAddress: body.shopAddress,
        shopCity: body.shopCity,
        shopState: body.shopState,
        shopPin: body.shopPin,
        shopPhone: body.shopPhone,
        shopEmail: body.shopEmail,
        shopGstin: body.shopGstin,
        defaultGstRate: body.defaultGstRate ?? 3,
        defaultCgstRate: body.defaultCgstRate ?? 1.5,
        defaultSgstRate: body.defaultSgstRate ?? 1.5,
      },
    });
  }

  @Post('setup/step')
  async setSetupStep(@CurrentUser() u: any, @Body() body: any) {
    return this.prisma.shopSettings.update({
      where: { organizationId: u.organizationId },
      data: { setupStep: body.step || 0 },
    });
  }

  @Post('setup/seed-accounts')
  async seedDefaultAccounts(@CurrentUser() u: any, @Body() body: any) {
    // Create the default Cash + Bank accounts during setup wizard
    const orgId = u.organizationId;
    const branchId = body.branchId;
    const existing = await this.prisma.ledgerAccount.findMany({ where: { organizationId: orgId } });
    if (existing.length > 0) {
      return { message: 'Accounts already exist', accounts: existing };
    }
    const accounts = await Promise.all([
      this.prisma.ledgerAccount.create({
        data: {
          organizationId: orgId,
          branchId,
          name: 'Cash Counter',
          type: 'CASH',
          openingBalance: body.cashOpening || 0,
          currentBalance: body.cashOpening || 0,
          isPrimary: true,
          notes: 'Default cash counter',
        },
      }),
      this.prisma.ledgerAccount.create({
        data: {
          organizationId: orgId,
          branchId,
          name: body.bankAccountName || 'Bank Account',
          type: 'BANK',
          accountNumber: body.bankAccountNumber,
          bankName: body.bankName,
          ifscCode: body.bankIfscCode,
          openingBalance: body.bankOpening || 0,
          currentBalance: body.bankOpening || 0,
          notes: 'Default bank account',
        },
      }),
    ]);
    // Post opening balance entries if any
    for (const acc of accounts) {
      if (acc.openingBalance && acc.openingBalance !== 0) {
        await this.prisma.ledgerEntry.create({
          data: {
            organizationId: orgId,
            branchId,
            accountId: acc.id,
            type: 'CREDIT',
            amount: acc.openingBalance,
            description: 'Opening balance',
            linkedTo: 'OPENING',
          },
        });
      } else {
        await this.prisma.ledgerEntry.create({
          data: {
            organizationId: orgId,
            branchId,
            accountId: acc.id,
            type: 'CREDIT',
            amount: 0,
            description: 'Account opened',
            linkedTo: 'OPENING',
          },
        });
      }
    }
    return { message: 'Default accounts created', accounts };
  }

  // ====== metals / purities (already there) ======
  @Post('metals')
  async addMetal(@CurrentUser() u: any, @Body('metal') metal: string) {
    return this.settingsService.addMetal(u.organizationId, metal);
  }

  @Delete('metals/:metal')
  async removeMetal(@CurrentUser() u: any, @Param('metal') metal: string) {
    return this.settingsService.removeMetal(u.organizationId, metal);
  }

  @Post('purities')
  async addPurity(@CurrentUser() u: any, @Body('purity') purity: string) {
    return this.settingsService.addPurity(u.organizationId, purity);
  }

  @Delete('purities/:purity')
  async removePurity(@CurrentUser() u: any, @Param('purity') purity: string) {
    return this.settingsService.removePurity(u.organizationId, purity);
  }
}
