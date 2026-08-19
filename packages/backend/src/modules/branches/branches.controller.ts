import { Body, Controller, Delete, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PrismaService } from '../../common/prisma.service';

@Controller('branches')
@UseGuards(JwtAuthGuard)
export class BranchesController {
  constructor(private prisma: PrismaService) {}

  @Get()
  async list(@CurrentUser() u: any) {
    return this.prisma.branch.findMany({
      where: { organizationId: u.organizationId },
      orderBy: [{ name: 'asc' }],
    });
  }

  @Get(':id')
  async getOne(@Param('id') id: string, @CurrentUser() u: any) {
    const branch = await this.prisma.branch.findFirst({ where: { id, organizationId: u.organizationId } });
    if (!branch) throw new Error('Branch not found');
    return branch;
  }

  @Post()
  async create(@CurrentUser() u: any, @Body() body: any) {
    if (!body?.name) throw new Error('Branch name required');
    const count = await this.prisma.branch.count({ where: { organizationId: u.organizationId } });
    const code = body.code || `BR${String(count + 1).padStart(3, '0')}`;
    return this.prisma.branch.create({
      data: {
        organizationId: u.organizationId,
        name: body.name,
        code,
        address: body.address,
        city: body.city,
        state: body.state,
        pin: body.pin,
        phone: body.phone,
        isActive: body.isActive !== false,
      },
    });
  }

  @Put(':id')
  async update(@Param('id') id: string, @CurrentUser() u: any, @Body() body: any) {
    const branch = await this.prisma.branch.findFirst({ where: { id, organizationId: u.organizationId } });
    if (!branch) throw new Error('Branch not found');
    const allowed = ['name', 'code', 'address', 'city', 'state', 'pin', 'phone', 'isActive'];
    const data: any = {};
    for (const k of allowed) {
      if (body[k] !== undefined) data[k] = body[k];
    }
    return this.prisma.branch.update({ where: { id }, data });
  }

  @Delete(':id')
  async remove(@Param('id') id: string, @CurrentUser() u: any) {
    const branch = await this.prisma.branch.findFirst({ where: { id, organizationId: u.organizationId } });
    if (!branch) throw new Error('Branch not found');
    return this.prisma.branch.update({ where: { id }, data: { isActive: false } });
  }
}
