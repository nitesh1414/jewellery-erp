import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';

@Injectable()
export class PrintingService {
  constructor(private prisma: PrismaService) {}
}
