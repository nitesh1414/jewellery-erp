import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employeesService: EmployeesService) {}

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.employeesService.findAll(user.organizationId, query);
  }

  @Get('payments')
  async listPayments(@CurrentUser() user: any, @Query() query: any) {
    return this.employeesService.listPayments(user.organizationId, query);
  }

  @Get(':id')
  async findById(@Param('id') id: string, @CurrentUser() user: any) {
    return this.employeesService.findById(id, user.organizationId);
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    return this.employeesService.create(body, user.organizationId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.employeesService.update(id, body, user.organizationId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.employeesService.remove(id, user.organizationId);
  }

  @Post(':id/payments')
  async addPayment(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.employeesService.addPayment(id, body, user.organizationId, user.id);
  }
}
