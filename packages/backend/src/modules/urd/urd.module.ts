import { Module } from '@nestjs/common';
import { UrdService } from './urd.service';
import { UrdController } from './urd.controller';
import { LedgerService } from '../ledger/ledger.service';
import { PrismaService } from '../../common/prisma.service';
@Module({
  controllers: [UrdController],
  providers: [UrdService, LedgerService, PrismaService],
  exports: [UrdService],
})
export class UrdModule { }
