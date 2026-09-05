import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { HealthController } from '@api/modules/health/health.controller';
import { HealthService } from '@api/modules/health/health.service';

const service = {
  getHealth: () => ({
    service: 'alfred-api',
    status: 'ok',
    timestamp: new Date(0).toISOString(),
  }),
} as HealthService;

describe('HealthController', () => {
  it('returns a standard response envelope', () => {
    const controller = new HealthController(service);
    const response = controller.getHealth();

    expect(response.success).toBe(true);
    expect(response.data).toMatchObject({
      service: 'alfred-api',
      status: 'ok',
    });
  });

  it('can be created through the Nest testing module', async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: service }],
    }).compile();

    expect(moduleRef.get(HealthController)).toBeInstanceOf(HealthController);
  });
});
