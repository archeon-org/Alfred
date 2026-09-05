import { Injectable } from '@nestjs/common';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';

@Injectable()
export class PlatformService {
  constructor(private readonly featureFlags: FeatureFlagsService) {}

  getStatus() {
    const features = this.featureFlags.getPublicFlags();
    return {
      name: 'Alfred',
      layers: ['web', 'api', 'agent'],
      enabledCapabilities: Object.freeze([
        ...(features.agentRuntime ? ['orchestration'] : []),
        ...(features.teams ? ['teams'] : []),
        ...(features.skills ? ['skills'] : []),
        ...(features.runtimeMemory ? ['runtime-memory'] : []),
      ]),
      features,
    };
  }
}
