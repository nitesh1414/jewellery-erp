import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  @Get()
  async list(@CurrentUser() u: any, @Query() q: any) {
    return this.notificationsService.list(u.organizationId, q);
  }

  @Get('unread-count')
  async unreadCount(@CurrentUser() u: any) {
    return { unread: await this.notificationsService.unreadCount(u.organizationId) };
  }

  @Post()
  async create(@CurrentUser() u: any, @Body() body: any) {
    return this.notificationsService.create(u.organizationId, u.branchId, body);
  }

  @Put(':id/read')
  async markRead(@Param('id') id: string, @CurrentUser() u: any) {
    return this.notificationsService.markRead(id, u.organizationId);
  }

  @Put('read-all')
  async markAllRead(@CurrentUser() u: any) {
    return this.notificationsService.markAllRead(u.organizationId);
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() u: any) {
    return this.notificationsService.remove(id, u.organizationId);
  }

  @Delete()
  async clearAll(@CurrentUser() u: any) {
    return this.notificationsService.clearAll(u.organizationId);
  }
}
