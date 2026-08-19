import { Module } from '@nestjs/common';
import { JewelleryService } from './jewellery.service';
import { JewelleryController } from './jewellery.controller';

@Module({
  controllers: [JewelleryController],
  providers: [JewelleryService],
  exports: [JewelleryService],
})
export class JewelleryModule {}