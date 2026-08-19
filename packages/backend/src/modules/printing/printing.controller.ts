import { Controller, UseGuards } from '@nestjs/common';
import { PrintingService } from './printing.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('printing')
export class PrintingController {
  constructor(private readonly printingService: PrintingService) {}
}
