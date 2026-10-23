import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JobWorkService } from './job-work.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('job-work')
export class JobWorkController {
  constructor(private jobWorkService: JobWorkService) { }

  @Get('stats')
  async getStats(@CurrentUser() user: any, @Query() query: any) {
    return this.jobWorkService.getStats(user.organizationId, query.branchId || user.branchId || undefined);
  }

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.jobWorkService.findAll(user.organizationId, { ...query, branchId: query.branchId || user.branchId || undefined });
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobWorkService.findById(id, user.organizationId);
  }

  /** Job work OUT — metal / material is issued to the worker. */
  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    return this.jobWorkService.create(body, user.organizationId, user.branchId, user.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.jobWorkService.update(id, body, user.organizationId, user.id);
  }

  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.jobWorkService.updateStatus(id, body.status, user.organizationId, user.id, body.notes);
  }

  /** Job work IN — finished ornaments received, items + barcodes created. */
  @Post(':id/receive')
  async receive(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.jobWorkService.receive(id, body, user.organizationId, user.branchId, user.id);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jobWorkService.remove(id, user.organizationId);
  }
}
