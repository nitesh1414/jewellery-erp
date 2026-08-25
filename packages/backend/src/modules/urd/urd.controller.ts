import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { UrdService } from './urd.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
@UseGuards(JwtAuthGuard)
@Controller('urd')
export class UrdController {
  constructor(private urdService: UrdService) {}
  @Get() async findAll(@CurrentUser() u: any, @Query() q: any) { return this.urdService.findAll(u.organizationId, { ...q, branchId: q.branchId || u.branchId || undefined }); }
  @Get(':id') async findById(@Param('id') id: string, @CurrentUser() u: any) { return this.urdService.findById(id, u.organizationId); }
  @Post() async create(@Body() b: any, @CurrentUser() u: any) { return this.urdService.create(b, u.organizationId, u.branchId); }
  @Put(':id') async update(@Param('id') id: string, @Body() b: any, @CurrentUser() u: any) { return this.urdService.update(id, b, u.organizationId); }
}
