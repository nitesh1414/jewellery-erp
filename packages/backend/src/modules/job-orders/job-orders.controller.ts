import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JobOrdersService } from './job-orders.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('job-orders')
export class JobOrdersController {
  constructor(private jobOrdersService: JobOrdersService) {}

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.jobOrdersService.findAll(user.organizationId, { ...query, branchId: query.branchId || user.branchId || undefined });
  }

  @Get('my-jobs')
  async getMyJobs(@CurrentUser() user: any) {
    return this.jobOrdersService.getEmployeeJobs(user.id, user.organizationId);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobOrdersService.findById(id, user.organizationId);
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    return this.jobOrdersService.create(body, user.organizationId, user.branchId);
  }

  @Post(':id/assign')
  async assignEmployee(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.jobOrdersService.assignEmployee(id, body);
  }

  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() user: any) {
    return this.jobOrdersService.updateStatus(id, status, user.id);
  }

  @Post(':id/issue-material')
  async issueMaterial(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.jobOrdersService.issueMaterial({
      ...body,
      jobOrderId: id,
      issuedById: user.id,
    });
  }

  @Post('return-material')
  async returnMaterial(@Body() body: any, @CurrentUser() user: any) {
    return this.jobOrdersService.returnMaterial(body);
  }

  @Post(':id/advance')
  async addAdvance(
    @Param('id') id: string,
    @Body() body: { amount: number; paymentMode?: string; reference?: string },
    @CurrentUser() user: any,
  ) {
    return this.jobOrdersService.addAdvance(
      id,
      body.amount,
      body.paymentMode || 'CASH',
      body.reference || '',
      user.id,
    );
  }

  @Post(':id/final-bill')
  async generateFinalBill(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.jobOrdersService.generateFinalBill(id, { ...body, userId: user.id });
  }

  @Get('stats/overview')
  async getStats(@CurrentUser() user: any) {
    return this.jobOrdersService.getStats(user.organizationId);
  }
}