import { Module } from '@nestjs/common';
import { OrnamentsController } from './ornaments.controller';
import { OrnamentsService } from './ornaments.service';

@Module({
  controllers: [OrnamentsController],
  providers: [OrnamentsService],
})
export class OrnamentsModule {}
