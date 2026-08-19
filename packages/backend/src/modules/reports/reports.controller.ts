import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ReportsService } from './reports.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reportsService: ReportsService) {}
  @Get('sales') async salesReport(@CurrentUser() u: any, @Query() q: any) { return this.reportsService.salesReport(u.organizationId, q); }
  @Get('hsn') async hsnSummary(@CurrentUser() u: any, @Query() q: any) { return this.reportsService.hsnSummary(u.organizationId, q); }
  @Get('inventory') async inventoryReport(@CurrentUser() u: any) { return this.reportsService.inventoryReport(u.organizationId); }
  @Get('job-work') async jobWorkReport(@CurrentUser() u: any, @Query() q: any) { return this.reportsService.jobWorkReport(u.organizationId, q); }
}
