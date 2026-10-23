import { Module } from '@nestjs/common';
import { JewelleryService } from './jewellery.service';
import { JewelleryController } from './jewellery.controller';
import { LedgerModule } from '../ledger/ledger.module';

@Module({
  imports: [LedgerModule],
  controllers: [JewelleryController],
  providers: [JewelleryService],
  exports: [JewelleryService],
})
export class JewelleryModule {}