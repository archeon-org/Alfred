import { Injectable } from '@nestjs/common';

@Injectable()
export class PlatformService {
  getStatus() {
    return {
      name: 'Alfred',
      layers: ['web', 'api', 'agent'],
      capabilities: ['orchestration', 'subagents', 'skills', 'review', 'testing'],
    };
  }
}
