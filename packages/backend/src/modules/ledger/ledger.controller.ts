import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { LedgerService } from './ledger.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('ledger')
@UseGuards(JwtAuthGuard)
export class LedgerController {
  constructor(private service: LedgerService) {}

  // ===== Accounts =====
  @Get('accounts')
  async listAccounts(@CurrentUser() u: any, @Query('inactive') inactive?: string, @Query('type') type?: string) {
    return this.service.listAccounts(u.organizationId, inactive === '1', type);
  }

  @Get('accounts/:id')
  async getAccount(@Param('id') id: string, @CurrentUser() u: any) {
    return this.service.getAccount(id, u.organizationId);
  }

  @Post('accounts')
  async createAccount(@CurrentUser() u: any, @Body() body: any) {
    return this.service.createAccount(u.organizationId, u.branchId, body);
  }

  @Put('accounts/:id')
  async updateAccount(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    return this.service.updateAccount(id, u.organizationId, body);
  }

  @Delete('accounts/:id')
  async deleteAccount(@Param('id') id: string, @CurrentUser() u: any) {
    return this.service.deleteAccount(id, u.organizationId);
  }

  // ===== Entries =====
  @Get('entries')
  async listEntries(@CurrentUser() u: any, @Query() q: any) {
    return this.service.listEntries(u.organizationId, q);
  }

  @Post('entries')
  async createEntry(@CurrentUser() u: any, @Body() body: any) {
    return this.service.createEntry(u.organizationId, u.branchId, body, { id: u.id, name: u.name });
  }

  @Delete('entries/:id')
  async deleteEntry(@Param('id') id: string, @CurrentUser() u: any) {
    return this.service.deleteEntry(id, u.organizationId);
  }

  // ===== Expenses =====
  @Get('expenses')
  async listExpenses(@CurrentUser() u: any, @Query() q: any) {
    return this.service.listExpenses(u.organizationId, { ...q, branchId: q.branchId || u.branchId || undefined });
  }

  @Post('expenses')
  async createExpense(@CurrentUser() u: any, @Body() body: any) {
    return this.service.createExpense(u.organizationId, u.branchId, body, { id: u.id, name: u.name });
  }

  @Delete('expenses/:id')
  async deleteExpense(@Param('id') id: string, @CurrentUser() u: any) {
    return this.service.deleteExpense(id, u.organizationId);
  }

  // ===== Income =====
  @Get('income')
  async listIncome(@CurrentUser() u: any, @Query() q: any) {
    return this.service.listIncome(u.organizationId, { ...q, branchId: q.branchId || u.branchId || undefined });
  }

  @Post('income')
  async createIncome(@CurrentUser() u: any, @Body() body: any) {
    return this.service.createIncome(u.organizationId, u.branchId, body, { id: u.id, name: u.name });
  }

  @Delete('income/:id')
  async deleteIncome(@Param('id') id: string, @CurrentUser() u: any) {
    return this.service.deleteIncome(id, u.organizationId);
  }
}
