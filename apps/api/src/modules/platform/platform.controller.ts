import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ok } from '../../common/api-response';
import { PlatformService } from './platform.service';

@ApiBearerAuth('bearerAuth')
@Controller('platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('status')
  getStatus() {
    return ok(this.platformService.getStatus());
  }
}
