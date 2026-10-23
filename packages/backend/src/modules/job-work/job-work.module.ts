import { Module } from '@nestjs/common';
import { JobWorkService } from './job-work.service';
import { JobWorkController } from './job-work.controller';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  controllers: [JobWorkController],
  providers: [JobWorkService],
  exports: [JobWorkService],
})
export class JobWorkModule { }
