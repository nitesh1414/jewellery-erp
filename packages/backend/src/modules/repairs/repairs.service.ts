import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class RepairsService {
  constructor(private prisma: PrismaService) {}
}
