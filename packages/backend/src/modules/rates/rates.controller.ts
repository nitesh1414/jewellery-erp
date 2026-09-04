import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { RatesService } from './rates.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('rates')
export class RatesController {
  constructor(private ratesService: RatesService) {}

  /** Daily rate schedule (a rate saved today stays in the list). */
  @Get()
  async getCurrent(@CurrentUser() u: any) {
    return this.ratesService.getCurrentRates(u.organizationId);
  }

  /** Historical rates, newest first, each row carrying its date. */
  @Get('history')
  async getHistory(@CurrentUser() u: any, @Query('limit') limit?: string) {
    return this.ratesService.getRateHistory(u.organizationId, Number(limit) || 200);
  }

  /** Add or update the rate of a metal + purity. */
  @Post()
  async upsert(@Body() b: any, @CurrentUser() u: any) {
    return this.ratesService.upsertRate({ ...b, organizationId: u.organizationId });
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body('rate') rate: number, @CurrentUser() u: any) {
    return this.ratesService.updateRate(id, rate, u.id);
  }
}
