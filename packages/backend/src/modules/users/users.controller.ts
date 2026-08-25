import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma.service';

const DEFAULT_ROLES = ['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'SALESMAN', 'CASHIER', 'INVENTORY_MANAGER', 'GOLDSMITH', 'KARIGAR', 'JOB_WORKER'];

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() u: any, @Query('role') role?: string, @Query('isActive') isActive?: string, @Query('branchId') branchId?: string, @Query('search') search?: string) {
    const where: any = { organizationId: u.organizationId };
    if (role) where.role = role;
    if (branchId) where.branchId = branchId;
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { email: { contains: search } },
      ];
    }
    const users = await this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: { branchAccess: { select: { branchId: true } } },
    });
    return users.map(({ password, branchAccess, ...rest }) => ({
      ...rest,
      branchIds: branchAccess.map((b) => b.branchId),
    }));
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() u: any) {
    const user = await this.prisma.user.findFirst({
      where: { id, organizationId: u.organizationId },
      include: { branchAccess: { select: { branchId: true } } },
    });
    if (!user) throw new Error('User not found');
    const { password, branchAccess, ...rest } = user;
    return { ...rest, branchIds: branchAccess.map((b) => b.branchId) };
  }

  @Post()
  async create(@CurrentUser() u: any, @Body() body: any) {
    if (!body?.email || !body?.name || !body?.password) throw new Error('Email, name, password required');
    if (body.role && !(await this.roleExists(body.role))) throw new Error('Invalid role');
    const exists = await this.prisma.user.findFirst({ where: { email: body.email } });
    if (exists) throw new Error('Email already exists');
    const hashed = await bcrypt.hash(body.password, 10);
    const branchIds: string[] = Array.isArray(body.branchIds) ? body.branchIds : (body.branchId ? [body.branchId] : []);
    const user = await this.prisma.user.create({
      data: {
        organizationId: u.organizationId,
        branchId: body.branchId || branchIds[0] || u.branchId || null,
        name: body.name,
        email: body.email.toLowerCase(),
        password: hashed,
        role: body.role || 'SALESMAN',
        isActive: body.isActive !== false,
        employeeId: body.employeeId,
        branchAccess: {
          create: branchIds.map((bid) => ({ branchId: bid })),
        },
      },
      include: { branchAccess: true },
    });
    const { password, branchAccess, ...rest } = user;
    return { ...rest, branchIds: branchAccess.map((b) => b.branchId) };
  }

  @Put(':id')
  async update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId: u.organizationId } });
    if (!user) throw new Error('User not found');
    if (body.password) body.password = await bcrypt.hash(body.password, 10);
    if (body.role && !(await this.roleExists(body.role))) throw new Error('Invalid role');
    if (body.email) body.email = body.email.toLowerCase();

    const { branchIds, ...updateData } = body;
    // Remove branch-related temp fields the schema doesn't have.
    const cleanData: any = { ...updateData };
    delete cleanData.branchId;

    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.user.update({
        where: { id },
        data: {
          ...cleanData,
          branchId: body.branchId || (Array.isArray(branchIds) && branchIds[0]) || user.branchId,
        },
      });
      // Replace multi-branch access (avoid createMany for SQLite compat).
      if (Array.isArray(branchIds)) {
        await tx.userBranch.deleteMany({ where: { userId: id } });
        for (const bid of branchIds) {
          await tx.userBranch.create({ data: { userId: id, branchId: bid } });
        }
      }
      return result;
    });

    const withBranches = await this.prisma.user.findUnique({
      where: { id },
      include: { branchAccess: { select: { branchId: true } } },
    });
    const { password, branchAccess, ...rest } = withBranches as any;
    return { ...rest, branchIds: branchAccess.map((b) => b.branchId) };
  }

  @Post(':id/branch')
  async assignBranch(@Param('id') id: string, @Body() body: any, @CurrentUser() u: any) {
    const updated = await this.prisma.user.update({
      where: { id },
      data: { branchId: body.branchId || null },
    });
    const { password, ...rest } = updated;
    return rest;
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() u: any) {
    if (id === u.id) throw new Error('Cannot delete yourself');
    const user = await this.prisma.user.findFirst({ where: { id, organizationId: u.organizationId } });
    if (!user) throw new Error('User not found');
    await this.prisma.user.update({ where: { id }, data: { isActive: false } });
    return { ok: true, deactivated: true };
  }

  /** A role is valid if it is one of the built-in defaults or a custom role. */
  private async roleExists(name: string): Promise<boolean> {
    if (DEFAULT_ROLES.includes(name)) return true;
    const role = await this.prisma.role.findFirst({ where: { name } });
    return !!role;
  }
}
