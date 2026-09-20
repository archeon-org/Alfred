import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { ok } from '../../common/api-response';
import { Public } from '../../common/decorators/public.decorator';
import { DocCheckLiveness, DocCheckReadiness, DocGetHealth } from './health.openapi';
import { HealthService } from './health.service';

@ApiTags('health')
@Public()
@SkipThrottle({ authenticated: true, ip: true })
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @DocGetHealth()
  getHealth() {
    return ok(this.healthService.getHealth());
  }

  @Get('live')
  @DocCheckLiveness()
  checkLiveness() {
    return this.healthService.checkLiveness();
  }

  @Get('ready')
  @DocCheckReadiness()
  checkReadiness() {
    return this.healthService.checkReadiness();
  }
}
