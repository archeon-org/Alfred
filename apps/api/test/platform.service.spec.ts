import { describe, expect, it } from 'vitest';
import { PlatformService } from '../src/modules/platform/platform.service';

describe('PlatformService', () => {
  it('exposes the scaffolded layers', () => {
    expect(new PlatformService().getStatus()).toEqual(
      expect.objectContaining({
        layers: ['web', 'api', 'agent'],
      }),
    );
  });
});
