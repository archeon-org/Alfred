import { Injectable } from '@nestjs/common';
import { HealthCheckService } from '@nestjs/terminus';
import { DatabaseHealthIndicator } from './database-health.indicator';

@Injectable()
export class HealthService {
  constructor(
    private readonly health: HealthCheckService,
    private readonly database: DatabaseHealthIndicator,
  ) {}

  getHealth() {
    return {
      service: 'alfred-api',
      status: 'ok',
      timestamp: new Date().toISOString(),
    };
  }

  checkLiveness() {
    return this.health.check([]);
  }

  checkReadiness() {
    return this.health.check([() => this.database.check()]);
  }
}
