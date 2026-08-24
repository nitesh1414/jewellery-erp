import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PurchasesService } from './purchases.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('purchases')
export class PurchasesController {
  constructor(private purchasesService: PurchasesService) {}

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.purchasesService.findAll(user.organizationId, { ...query, branchId: query.branchId || user.branchId || undefined });
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.purchasesService.findById(id, user.organizationId);
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    return this.purchasesService.create({ ...body, createdById: user.id }, user.organizationId, user.branchId, user.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.purchasesService.update(id, body, user.organizationId, user.branchId, user.id);
  }
}