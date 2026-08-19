import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
@UseGuards(JwtAuthGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private paymentsService: PaymentsService) {}
  @Get() async findAll(@CurrentUser() u: any, @Query() q: any) { return this.paymentsService.findAll(u.organizationId, q); }
  @Post() async create(@Body() b: any, @CurrentUser() u: any) { return this.paymentsService.create(b, u.organizationId, u.branchId, u.id); }
}
