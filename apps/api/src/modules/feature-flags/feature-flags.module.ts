import { Global, Module } from '@nestjs/common';
import { FeatureFlagGuard } from './feature-flag.guard';
import { FeatureFlagsController } from './feature-flags.controller';
import { FeatureFlagsService } from './feature-flags.service';

@Global()
@Module({
  controllers: [FeatureFlagsController],
  exports: [FeatureFlagsService],
  providers: [FeatureFlagGuard, FeatureFlagsService],
})
export class FeatureFlagsModule {}
