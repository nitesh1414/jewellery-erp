import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../../common/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async login(email: string, password: string, branchId?: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    
    if (!user || !user.isActive) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLogin: new Date() },
    });

    // Get user permissions (from the role's permission matrix in DB)
    const permissions = await this.getUserPermissions(user.role);

    // Multi-branch: the user can operate in any branch they were granted.
    const branchAccess = await this.prisma.userBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    });
    const branchIds = branchAccess.map((b) => b.branchId);

    const payload = {
      userId: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
      branchId: branchId || user.branchId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken: this.jwtService.sign(payload, { expiresIn: '7d' }),
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        branchId: user.branchId,
        branchIds,
        permissions,
      },
    };
  }

  async register(data: {
    name: string;
    email: string;
    password: string;
    role: string;
    organizationId: string;
    branchId?: string;
  }) {
    const existing = await this.prisma.user.findUnique({ where: { email: data.email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    const user = await this.prisma.user.create({
      data: {
        name: data.name,
        email: data.email,
        password: hashedPassword,
        role: data.role,
        organizationId: data.organizationId,
        branchId: data.branchId,
      },
    });

    const { password, ...result } = user;
    return result;
  }

  async refreshToken(token: string) {
    try {
      const decoded = this.jwtService.verify(token);
      const user = await this.prisma.user.findUnique({ where: { id: decoded.userId } });
      
      if (!user || !user.isActive) {
        throw new UnauthorizedException('Invalid token');
      }

      const payload = {
        userId: user.id,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId,
        branchId: user.branchId,
      };

      return {
        accessToken: this.jwtService.sign(payload),
      };
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async validateUser(userId: string) {
    return this.prisma.user.findUnique({ where: { id: userId } });
  }

  private async getUserPermissions(roleName: string): Promise<string[]> {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    if (!role) {
      // Default permissions based on role name
      return this.getDefaultPermissions(roleName);
    }

    return role.permissions.map(rp => rp.permission.name);
  }

  private getDefaultPermissions(role: string): string[] {
    const basePermissions = ['DASHBOARD_VIEW'];
    
    switch (role) {
      case 'SUPER_ADMIN':
      case 'OWNER':
        return [...basePermissions, 'BILLING_VIEW', 'BILLING_CREATE', 'BILLING_FINALIZE', 
                'INVENTORY_VIEW', 'INVENTORY_ADJUST', 'CUSTOMERS_VIEW', 'CUSTOMERS_CREATE',
                'REPORTS_VIEW', 'REPORTS_GST', 'REPORTS_FINANCIAL', 'REPORTS_EXPORT',
                'EMPLOYEES_VIEW', 'EMPLOYEES_MANAGE', 'JOB_WORK_VIEW', 'JOB_WORK_CREATE',
                'JOB_WORK_ASSIGN', 'PROFIT_VIEW', 'SALARY_VIEW', 'PURCHASE_COST_VIEW',
                'SETTINGS_MANAGE', 'USERS_MANAGE', 'ROLES_MANAGE', 'BRANCHES_MANAGE', 'AUDIT_VIEW'];
      case 'BRANCH_MANAGER':
        return [...basePermissions, 'BILLING_VIEW', 'BILLING_CREATE', 'BILLING_FINALIZE',
                'INVENTORY_VIEW', 'INVENTORY_ADJUST', 'CUSTOMERS_VIEW', 'CUSTOMERS_CREATE',
                'REPORTS_VIEW', 'REPORTS_GST', 'EMPLOYEES_VIEW', 'JOB_WORK_VIEW', 'JOB_WORK_CREATE',
                'JOB_WORK_ASSIGN'];
      case 'ACCOUNTANT':
        return [...basePermissions, 'BILLING_VIEW', 'BILLING_CANCEL', 'CUSTOMERS_VIEW',
                'REPORTS_VIEW', 'REPORTS_GST', 'REPORTS_FINANCIAL', 'REPORTS_EXPORT',
                'PROFIT_VIEW', 'PURCHASE_COST_VIEW', 'AUDIT_VIEW'];
      case 'SALESMAN':
        return [...basePermissions, 'BILLING_VIEW', 'BILLING_CREATE', 'BILLING_EDIT_DRAFT',
                'CUSTOMERS_VIEW', 'CUSTOMERS_CREATE', 'CUSTOMERS_EDIT'];
      case 'CASHIER':
        return [...basePermissions, 'BILLING_VIEW', 'BILLING_CREATE', 'CUSTOMERS_VIEW',
                'CUSTOMERS_CREATE'];
      case 'INVENTORY_MANAGER':
        return [...basePermissions, 'INVENTORY_VIEW', 'INVENTORY_ADJUST', 'INVENTORY_TRANSFER'];
      case 'GOLDSMITH':
      case 'KARIGAR':
      case 'JOB_WORKER':
        return [...basePermissions, 'JOB_WORK_VIEW'];
      default:
        return basePermissions;
    }
  }
}