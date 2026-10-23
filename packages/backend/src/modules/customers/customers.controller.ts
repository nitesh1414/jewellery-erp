import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Get('cities')
  async cities(@CurrentUser() user: any) {
    return this.customersService.listCities(user.organizationId);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('search') search?: string,
    @Query('city') city?: string,
    @Query('page') page?: number,
    @Query('limit') limit?: number,
  ) {
    return this.customersService.findAll(user.organizationId, { search, city, page, limit });
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customersService.findById(id, user.organizationId);
  }

  @Post()
  @RequirePermissions('CUSTOMERS_CREATE')
  async create(@Body() body: any, @CurrentUser() user: any) {
    return this.customersService.create({
      ...body,
      organizationId: user.organizationId,
      branchId: user.branchId,
    });
  }

  @Put(':id')
  @RequirePermissions('CUSTOMERS_EDIT')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.customersService.update(id, user.organizationId, body);
  }

  @Get(':id/ledger')
  async getLedger(@Param('id') id: string, @CurrentUser() user: any) {
    return this.customersService.getLedger(id, user.organizationId);
  }
}