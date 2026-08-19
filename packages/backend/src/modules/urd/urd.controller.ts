import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { UrdService } from './urd.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
@UseGuards(JwtAuthGuard)
@Controller('urd')
export class UrdController {
  constructor(private urdService: UrdService) {}
  @Get() async findAll(@CurrentUser() u: any, @Query() q: any) { return this.urdService.findAll(u.organizationId, q); }
  @Post() async create(@Body() b: any, @CurrentUser() u: any) { return this.urdService.create(b, u.organizationId, u.branchId); }
}
