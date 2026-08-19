import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SuppliersService } from './suppliers.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('suppliers')
export class SuppliersController {
  constructor(private suppliersService: SuppliersService) {}
  @Get() async findAll(@CurrentUser() u: any, @Query() q: any) { return this.suppliersService.findAll(u.organizationId, q); }
  @Get(':id') async findById(@Param('id') id: string, @CurrentUser() u: any) { return this.suppliersService.findById(id, u.organizationId); }
  @Post() async create(@Body() b: any, @CurrentUser() u: any) { return this.suppliersService.create(b, u.organizationId); }
}
