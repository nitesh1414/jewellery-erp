import { Controller, Get, Post, Put, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { OrnamentsService } from './ornaments.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('ornaments')
export class OrnamentsController {
  constructor(private ornamentsService: OrnamentsService) {}

  @Get()
  async findAll(@CurrentUser() user: any, @Query() query: any) {
    return this.ornamentsService.findAll(user.organizationId, query, user.branchId);
  }

  /**
   * Ornaments with the stock held in a metal + purity (taken from the metal
   * ledger when one is selected) — drives the ornament picker in item entry.
   */
  @Get('with-stock')
  async findAllWithStock(@CurrentUser() user: any, @Query() query: any) {
    return this.ornamentsService.findAllWithStock(user.organizationId, query, user.branchId);
  }

  @Post()
  async create(@Body() body: any, @CurrentUser() user: any) {
    return this.ornamentsService.create(body, user.organizationId);
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any, @CurrentUser() user: any) {
    return this.ornamentsService.update(id, body, user.organizationId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.ornamentsService.remove(id, user.organizationId);
  }
}
