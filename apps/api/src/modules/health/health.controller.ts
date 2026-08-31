import { Controller, Get } from '@nestjs/common';
import { HealthCheck } from '@nestjs/terminus';
import { ok } from '../../common/api-response';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  getHealth() {
    return ok(this.healthService.getHealth());
  }

  @Get('live')
  @HealthCheck()
  checkLiveness() {
    return this.healthService.checkLiveness();
  }

  @Get('ready')
  @HealthCheck()
  checkReadiness() {
    return this.healthService.checkReadiness();
  }
}
