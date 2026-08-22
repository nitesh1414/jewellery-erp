import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SalesService } from './sales.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('sales')
export class SalesController {
  constructor(private salesService: SalesService) {}

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('billType') billType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.salesService.findAll(user.organizationId, {
      search, status, billType, startDate, endDate, page, limit,
    });
  }

  @Get('today')
  async getTodaySummary(@CurrentUser() user: any) {
    return this.salesService.getTodaySummary(user.organizationId, user.branchId);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.salesService.findById(id, user.organizationId);
  }

  @Get('bill/:billNumber')
  async findByBillNumber(@Param('billNumber') billNumber: string, @CurrentUser() user: any) {
    return this.salesService.findByBillNumber(billNumber, user.organizationId);
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    return this.salesService.create(body, user.id, user.organizationId, user.branchId);
  }

  @Put(':id')
  async updateEstimate(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.salesService.updateEstimate(id, body, user.id, user.organizationId);
  }

  @Put(':id/confirm')
  async confirmEstimate(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.salesService.confirmEstimate(id, body || {}, user.id, user.organizationId, user.branchId);
  }

  @Put(':id/status')
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string,
    @CurrentUser() user: any,
  ) {
    return this.salesService.updateStatus(id, status, user.id, user.organizationId);
  }

  @Post(':id/cancel')
  async cancel(
    @Param('id') id: string,
    @Body('reason') reason: string,
    @CurrentUser() user: any,
  ) {
    return this.salesService.cancel(id, reason, user.id, user.organizationId);
  }

  @Post(':id/payment')
  async addPayment(
    @Param('id') id: string,
    @Body() body: { amount: number; paymentMode: string; reference?: string },
    @CurrentUser() user: any,
  ) {
    return this.salesService.addPayment(id, body, user.id, user.organizationId);
  }
}