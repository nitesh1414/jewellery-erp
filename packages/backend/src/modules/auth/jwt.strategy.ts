import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { Request } from 'express';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET || 'jewellery-erp-secret-key-change-in-production',
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: any) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.userId } });
    
    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or inactive');
    }

    // Multi-branch support: the client may send a `x-branch-id` header to
    // choose the branch the current action is performed for. Always default
    // to the user's assigned (primary) branch. The user may only switch to a
    // branch they were granted access to (multi-branch operator).
    const branchAccess = await this.prisma.userBranch.findMany({
      where: { userId: user.id },
      select: { branchId: true },
    });
    const allowedBranchIds = new Set([
      ...branchAccess.map((b) => b.branchId),
      user.branchId as string,
    ].filter(Boolean));

    let branchId = payload.branchId || user.branchId || null;
    const requestedBranch = req.headers?.['x-branch-id'] as string | undefined;
    // Owners/admins can access any branch in the org; others only granted ones.
    const isOwnerLike = user.role === 'SUPER_ADMIN' || user.role === 'OWNER';
    if (requestedBranch) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: requestedBranch, organizationId: user.organizationId, isActive: true },
      });
      if (branch && (isOwnerLike || allowedBranchIds.has(branch.id))) {
        branchId = branch.id;
      }
    } else if (!isOwnerLike && branchId && !allowedBranchIds.has(branchId)) {
      // Fall back to the first granted branch when primary is not accessible.
      branchId = branchAccess[0]?.branchId ?? null;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      branchId,
      branchIds: Array.from(allowedBranchIds),
      permissions: user.role ? await this.getRolePermissions(user.role) : [],
    };
  }

  /** Resolve a role's permissions from the DB permission matrix. */
  private async getRolePermissions(roleName: string): Promise<string[]> {
    const role = await this.prisma.role.findUnique({
      where: { name: roleName },
      include: { permissions: { include: { permission: true } } },
    });
    if (role) return role.permissions.map((rp) => rp.permission.name);
    return [];
  }
}
}
