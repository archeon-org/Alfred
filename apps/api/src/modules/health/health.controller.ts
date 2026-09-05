import { Controller, Get } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { Public } from '../../common/decorators/public.decorator';
import { HealthService } from './health.service';

@Public()
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
