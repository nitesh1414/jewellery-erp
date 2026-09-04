import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private inventoryService: InventoryService) {}

  @Get('summary')
  async getSummary(@CurrentUser() user: any) {
    return this.inventoryService.getSummary(user.organizationId, user.branchId);
  }

  @Get('stock')
  async getStockBalance(@CurrentUser() user: any) {
    return this.inventoryService.getStockBalance(user.organizationId, user.branchId);
  }

  /** Raw metal / material stock held in the metal ledger accounts. */
  @Get('metal-stock')
  async getMetalStock(@CurrentUser() user: any) {
    const rows = await this.inventoryService.getMetalLedgerStock(user.organizationId, user.branchId);
    return {
      items: rows,
      totalGrams: Math.round(rows.reduce((s, r) => s + r.grams, 0) * 1000) / 1000,
      totalValue: Math.round(rows.reduce((s, r) => s + r.value, 0) * 100) / 100,
    };
  }

  @Get('transactions')
  async getTransactions(@CurrentUser() user: any, @Query() query: any) {
    return this.inventoryService.getTransactions(user.organizationId, query);
  }

  @Get('transaction-types')
  async getTransactionTypes() {
    return this.inventoryService.getTransactionTypes();
  }

  @Get('low-stock')
  async getLowStockAlerts(@CurrentUser() user: any, @Query('threshold') threshold?: number) {
    return this.inventoryService.getLowStockAlerts(user.organizationId, user.branchId, threshold || 2);
  }

  @Get('valuation')
  async getValuation(@CurrentUser() user: any) {
    return this.inventoryService.getValuation(user.organizationId, user.branchId);
  }

  @Get('dead-stock')
  async getDeadStock(@CurrentUser() user: any, @Query('days') days?: number) {
    return this.inventoryService.getDeadStock(user.organizationId, days || 180, user.branchId);
  }

  @Post('adjust')
  async adjustStock(@Body() body: any, @CurrentUser() user: any) {
    return this.inventoryService.adjustStock({
      ...body,
      organizationId: user.organizationId,
      branchId: user.branchId,
      userId: user.id,
    });
  }

  @Post('transfer')
  async transferStock(@Body() body: any, @CurrentUser() user: any) {
    return this.inventoryService.transferStock({
      ...body,
      organizationId: user.organizationId,
      fromBranchId: user.branchId,
      userId: user.id,
    });
  }
}