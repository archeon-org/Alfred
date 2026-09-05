import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { ok } from '../../common/api-response';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Public()
@SkipThrottle({ authenticated: true, ip: true })
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return ok(this.healthService.getHealth());
  }

  @Get('live')
  checkLiveness() {
    return this.healthService.checkLiveness();
  }

  @Get('ready')
  checkReadiness() {
    return this.healthService.checkReadiness();
  }
}
