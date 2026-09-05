import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { MetricsAccessGuard } from './metrics-access.guard';
import { MetricsService } from './metrics.service';

@Controller('metrics')
@Public()
@SkipThrottle({ authenticated: true, ip: true })
@UseGuards(MetricsAccessGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metricsPayload(): Promise<string> {
    return this.metrics.render();
  }
}
