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
    // to the user's assigned (primary) branch.
    let branchId = payload.branchId || user.branchId || null;
    const requestedBranch = req.headers?.['x-branch-id'] as string | undefined;
    if (requestedBranch) {
      const branch = await this.prisma.branch.findFirst({
        where: { id: requestedBranch, organizationId: user.organizationId, isActive: true },
      });
      if (branch) branchId = branch.id;
    }

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      organizationId: user.organizationId,
      branchId,
    };
  }
}
