import { Controller, Get, Post, Delete, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { QuotationsService } from './quotations.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';

@Controller('quotations')
export class QuotationsController {
  constructor(private quotationsService: QuotationsService) {}

  /** PUBLIC — customer opens the quote link without logging in */
  @Public()
  @Get('public/:token')
  async findByToken(@Param('token') token: string) {
    return this.quotationsService.findByToken(token);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.quotationsService.findAll(user.organizationId, query);
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.quotationsService.findById(id, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    return this.quotationsService.create(body, user.organizationId, user.branchId, user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Put(':id/status')
  async updateStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() user: any) {
    return this.quotationsService.updateStatus(id, status, user.organizationId);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.quotationsService.remove(id, user.organizationId);
  }
}
