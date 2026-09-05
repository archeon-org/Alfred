import { Injectable } from '@nestjs/common';

@Injectable()
export class StreamService {
  getCapabilities() {
    return Object.freeze({
      protocol: 'AG-UI',
      status: 'reserved',
      transport: 'SSE',
    });
  }
}
