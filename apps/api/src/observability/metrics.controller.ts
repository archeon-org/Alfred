import { Controller, Get, Header, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { MetricsAccessGuard } from './metrics-access.guard';
import { DocScrapeMetrics } from './metrics.openapi';
import { MetricsService } from './metrics.service';

@ApiTags('observability')
@Controller('metrics')
@Public()
@SkipThrottle({ authenticated: true, ip: true })
@UseGuards(MetricsAccessGuard)
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get()
  @DocScrapeMetrics()
  @Header('Cache-Control', 'no-store')
  @Header('Content-Type', 'text/plain; version=0.0.4; charset=utf-8')
  metricsPayload(): Promise<string> {
    return this.metrics.render();
  }
}
