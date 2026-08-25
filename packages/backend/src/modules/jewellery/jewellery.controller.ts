import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JewelleryService } from './jewellery.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('jewellery')
export class JewelleryController {
  constructor(private jewelleryService: JewelleryService) {}

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.jewelleryService.findAll(user.organizationId, { ...query, branchId: query.branchId || user.branchId || undefined });
  }

  @Get('stats')
  async getStats(@CurrentUser() user: any) {
    return this.jewelleryService.getStats(user.organizationId, user.branchId);
  }

  @Get('categories')
  async getCategories(@CurrentUser() user: any) {
    return this.jewelleryService.getCategories(user.organizationId);
  }

  @Get('barcode/:barcode')
  async findByBarcode(@Param('barcode') barcode: string, @CurrentUser() user: any) {
    return this.jewelleryService.findByBarcode(barcode, user.organizationId, user.branchId);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.jewelleryService.findById(id, user.organizationId);
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    return this.jewelleryService.create(body, user.organizationId, user.branchId, user.id);
  }

  @Post('bulk')
  async bulkCreate(@Body('items') items: any[], @CurrentUser() user: any) {
    return this.jewelleryService.bulkCreate(items, user.organizationId, user.branchId, user.id);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.jewelleryService.update(id, user.organizationId, body);
  }

  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() user: any) {
    return this.jewelleryService.updateStatus(id, status, user.organizationId, user.id);
  }
}