import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { UrdService } from './urd.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
@UseGuards(JwtAuthGuard)
@Controller('urd')
export class UrdController {
  constructor(private urdService: UrdService) { }
  @Get('stats/overview') async stats(@CurrentUser() u: any, @Query('branchId') branchId?: string) {
    return this.urdService.getStats(u.organizationId, branchId || u.branchId || undefined);
  }
  @Get() async findAll(@CurrentUser() u: any, @Query() q: any) { return this.urdService.findAll(u.organizationId, { ...q, branchId: q.branchId || u.branchId || undefined }); }
  @Get(':id') async findById(@Param('id') id: string, @CurrentUser() u: any) { return this.urdService.findById(id, u.organizationId); }
  @Post() async create(@Body() b: any, @CurrentUser() u: any) { return this.urdService.create(b, u.organizationId, u.branchId, u.id); }
  @Put(':id') async update(@Param('id') id: string, @Body() b: any, @CurrentUser() u: any) { return this.urdService.update(id, b, u.organizationId, u.id); }
  /**
   * Payment adjustment — pay the customer for the old gold (cash / bank out).
   */
  @Post(':id/settle') async settle(@Param('id') id: string, @Body() b: any, @CurrentUser() u: any) {
    return this.urdService.settle(id, b || {}, u.organizationId, u.id);
  }
  /**
   * Adjust the old gold against one of the customer's unpaid bills.
   */
  @Post(':id/adjust') async adjust(@Param('id') id: string, @Body() b: any, @CurrentUser() u: any) {
    return this.urdService.adjust(id, b || {}, u.organizationId, u.id);
  }
  /**
   * Outgoing — sell / melt the old gold out (metal out, money in).
   */
  @Post(':id/sell') async sell(@Param('id') id: string, @Body() b: any, @CurrentUser() u: any) {
    return this.urdService.sell(id, b || {}, u.organizationId, u.id);
  }
}
