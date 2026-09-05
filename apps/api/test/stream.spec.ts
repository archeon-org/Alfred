import { describe, expect, it } from 'vitest';

import { StreamController } from '../src/modules/stream/stream.controller';
import { StreamService } from '../src/modules/stream/stream.service';
import { REQUIRED_FEATURE_FLAGS_KEY } from '../src/modules/feature-flags/requires-feature.decorator';

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
