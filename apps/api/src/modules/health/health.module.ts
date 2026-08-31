import { Module } from '@nestjs/common';
import { TerminusModule } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database-health.indicator';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [DatabaseHealthIndicator, HealthService],
})
export class HealthModule {}
