import { Controller, Get, Post, Put, Body, Param, UseGuards } from '@nestjs/common';
import { RatesService } from './rates.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('rates')
export class RatesController {
  constructor(private ratesService: RatesService) {}
  @Get() async getCurrent(@CurrentUser() u: any) { return this.ratesService.getCurrentRates(u.organizationId); }
  @Post() async create(@Body() b: any, @CurrentUser() u: any) { return this.ratesService.create({ ...b, organizationId: u.organizationId }); }
  @Put(':id') async update(@Param('id') id: string, @Body('rate') rate: number, @CurrentUser() u: any) { return this.ratesService.updateRate(id, rate, u.id); }
}
