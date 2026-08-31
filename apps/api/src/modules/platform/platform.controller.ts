import { Controller, Get } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { PlatformService } from './platform.service';

@Controller('platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('status')
  getStatus() {
    return ok(this.platformService.getStatus());
  }
}
