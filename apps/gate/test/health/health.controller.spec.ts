import { HealthController } from 'src/health/health.controller';

describe('HealthController', () => {
  const controller = new HealthController();

  it('returns health payload', () => {
    const result = controller.check();

    expect(result.status).toBe('ok');
    expect(new Date(result.timestamp).toString()).not.toBe('Invalid Date');
    expect(typeof result.uptime).toBe('number');
  });
});
