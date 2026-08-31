import { Injectable } from '@nestjs/common';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DatabaseHealthIndicator {
  constructor(private readonly prisma: PrismaService) {}

  async check(): Promise<HealthIndicatorResult> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { database: { status: 'up' } };
    } catch {
      return { database: { status: 'down' } };
    }
  }
}
