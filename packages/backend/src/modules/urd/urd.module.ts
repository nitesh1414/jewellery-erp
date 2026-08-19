import { Module } from '@nestjs/common';
import { UrdService } from './urd.service';
import { UrdController } from './urd.controller';
@Module({ controllers: [UrdController], providers: [UrdService], exports: [UrdService] })
export class UrdModule {}
