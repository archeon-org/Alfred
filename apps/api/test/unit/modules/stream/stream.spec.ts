import { describe, expect, it } from 'vitest';

import { REQUIRED_FEATURE_FLAGS_KEY } from '@api/modules/feature-flags/requires-feature.decorator';
import { StreamController } from '@api/modules/stream/stream.controller';
import { StreamService } from '@api/modules/stream/stream.service';

describe('stream capability boundary', () => {
  it('reserves AG-UI over SSE without starting a fake streaming implementation', () => {
    const service = new StreamService();
    const capabilities = service.getCapabilities();
    const controller = new StreamController(service);

    expect(capabilities).toEqual({ protocol: 'AG-UI', status: 'reserved', transport: 'SSE' });
    expect(Object.isFrozen(capabilities)).toBe(true);
    expect(controller.getCapabilities()).toEqual({ data: capabilities, success: true });
    expect(Reflect.getMetadata(REQUIRED_FEATURE_FLAGS_KEY, StreamController)).toEqual([
      'agUiStreaming',
    ]);
  });
});
