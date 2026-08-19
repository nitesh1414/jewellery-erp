import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { BarcodesService } from './barcodes.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('barcodes')
export class BarcodesController {
  constructor(private barcodesService: BarcodesService) {}

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.barcodesService.findAll(user.organizationId, query);
  }

  @Get('stats')
  async getStats(@CurrentUser() user: any) {
    return this.barcodesService.getStats(user.organizationId);
  }

  @Get('next-sequence')
  async getNextSequence(@CurrentUser() user: any, @Query('prefix') prefix?: string) {
    const seq = await this.barcodesService.getNextSequence(user.organizationId, prefix || 'G');
    return { sequence: seq, nextBarcode: `${prefix || 'G'}${String(seq).padStart(8, '0')}` };
  }

  @Get('label/:barcode')
  async getLabelData(@Param('barcode') barcode: string, @CurrentUser() user: any) {
    return this.barcodesService.getLabelData(barcode, user.organizationId);
  }

  @Get('scan/:barcode')
  async scan(@Param('barcode') barcode: string, @CurrentUser() user: any) {
    return this.barcodesService.scan(barcode, user.organizationId);
  }

  @Post('generate')
  async generate(
    @Body() body: { count?: number; prefix?: string },
    @CurrentUser() user: any,
  ) {
    return this.barcodesService.generate(
      user.organizationId,
      user.branchId,
      body.count || 1,
      body.prefix || 'G',
    );
  }

  @Post('generate-for-jewellery')
  async generateForJewellery(@Body() body: { items: { id: string; barcode?: string }[] }, @CurrentUser() user: any) {
    return this.barcodesService.generateForJewelleryItems(user.organizationId, user.branchId, body.items || []);
  }

  @Post(':id/assign')
  async assign(
    @Param('id') id: string,
    @Body('jewelleryItemId') jewelleryItemId: string,
  ) {
    return this.barcodesService.assignToJewellery(id, jewelleryItemId);
  }

  @Post(':id/unassign')
  async unassign(@Param('id') id: string) {
    return this.barcodesService.unassign(id);
  }

  @Post(':id/print')
  async print(@Param('id') id: string) {
    return this.barcodesService.trackPrint(id);
  }

  @Post('batch/print')
  async batchPrint(@Body('barcodeIds') barcodeIds: string[]) {
    return this.barcodesService.trackBatchPrint(barcodeIds || []);
  }
}