import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../common/api-response';
import { DocGetPlatformStatus } from './platform.openapi';
import { PlatformService } from './platform.service';

@ApiTags('platform')
@ApiBearerAuth('bearerAuth')
@Controller('platform')
export class PlatformController {
  constructor(private readonly platformService: PlatformService) {}

  @Get('status')
  @DocGetPlatformStatus()
  getStatus() {
    return ok(this.platformService.getStatus());
  }
}
