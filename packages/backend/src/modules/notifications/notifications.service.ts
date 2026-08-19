import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class NotificationsService {
  constructor(private prisma: PrismaService) {}

  async list(organizationId: string, params: any = {}) {
    const { unreadOnly, page = 1, limit = 50 } = params;
    const where: any = { organizationId };
    if (unreadOnly === 'true') where.status = 'UNREAD';
    const [items, total, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: +limit,
        skip: (+page - 1) * +limit,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { organizationId, status: 'UNREAD' } }),
    ]);
    return { items, total, unread, page: +page, limit: +limit };
  }

  async unreadCount(organizationId: string) {
    return this.prisma.notification.count({ where: { organizationId, status: 'UNREAD' } });
  }

  async create(organizationId: string, branchId: string | undefined, data: any) {
    return this.prisma.notification.create({
      data: {
        organizationId,
        branchId,
        type: data.type || 'BILL_GENERATED',
        channel: data.channel || 'IN_APP',
        title: data.title,
        message: data.message,
        recipientId: data.recipientId,
        recipientMobile: data.recipientMobile,
        relatedEntityType: data.relatedEntityType,
        relatedEntityId: data.relatedEntityId,
        status: 'UNREAD',
      },
    });
  }

  async markRead(id: string, organizationId: string) {
    await this.prisma.notification.updateMany({
      where: { id, organizationId },
      data: { status: 'READ' },
    });
    return { ok: true };
  }

  async markAllRead(organizationId: string) {
    await this.prisma.notification.updateMany({
      where: { organizationId, status: 'UNREAD' },
      data: { status: 'READ' },
    });
    return { ok: true };
  }

  async remove(id: string, organizationId: string) {
    await this.prisma.notification.deleteMany({ where: { id, organizationId } });
    return { ok: true };
  }

  async clearAll(organizationId: string) {
    await this.prisma.notification.deleteMany({ where: { organizationId } });
    return { ok: true };
  }

  /**
   * Auto-post business notifications from key events.
   * Called by other services (sales, job orders, payments).
   */
  async notify(
    organizationId: string,
    branchId: string | undefined,
    type: string,
    title: string,
    message: string,
    related?: { entityType?: string; entityId?: string; recipientId?: string; recipientMobile?: string },
  ) {
    return this.prisma.notification.create({
      data: {
        organizationId,
        branchId,
        type,
        title,
        message,
        recipientId: related?.recipientId,
        recipientMobile: related?.recipientMobile,
        relatedEntityType: related?.entityType,
        relatedEntityId: related?.entityId,
        status: 'UNREAD',
      },
    });
  }
}
