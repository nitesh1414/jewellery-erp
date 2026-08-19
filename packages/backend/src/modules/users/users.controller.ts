import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma.service';

const VALID_ROLES = new Set(['SUPER_ADMIN', 'OWNER', 'BRANCH_MANAGER', 'ACCOUNTANT', 'SALESMAN', 'CASHIER', 'INVENTORY_MANAGER', 'GOLDSMITH', 'KARIGAR', 'JOB_WORKER']);

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
    });
    return users.map(({ password, ...rest }) => rest);
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() u: any) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId: u.organizationId } });
    if (!user) throw new Error('User not found');
    const { password, ...rest } = user;
    return rest;
  }

  @Post()
  async create(@CurrentUser() u: any, @Body() body: any) {
    if (!body?.email || !body?.name || !body?.password) throw new Error('Email, name, password required');
    if (!VALID_ROLES.has(body.role || 'SALESMAN')) throw new Error('Invalid role');
    const exists = await this.prisma.user.findFirst({ where: { email: body.email } });
    if (exists) throw new Error('Email already exists');
    const hashed = await bcrypt.hash(body.password, 10);
    const user = await this.prisma.user.create({
      data: {
        organizationId: u.organizationId,
        branchId: body.branchId || u.branchId || null,
        name: body.name,
        email: body.email.toLowerCase(),
        password: hashed,
        role: body.role || 'SALESMAN',
        isActive: body.isActive !== false,
        employeeId: body.employeeId,
      },
    });
    const { password, ...rest } = user;
    return rest;
  }

  @Put(':id')
  async update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    const user = await this.prisma.user.findFirst({ where: { id, organizationId: u.organizationId } });
    if (!user) throw new Error('User not found');
    if (body.password) body.password = await bcrypt.hash(body.password, 10);
    if (body.role && !VALID_ROLES.has(body.role)) throw new Error('Invalid role');
    if (body.email) body.email = body.email.toLowerCase();
    const updated = await this.prisma.user.update({ where: { id }, data: { ...body } });
    const { password, ...rest } = updated;
    return rest;
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
}
