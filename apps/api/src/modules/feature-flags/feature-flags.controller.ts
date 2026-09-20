import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ok } from '../../common/api-response';
import { Public } from '../../common/decorators/public.decorator';
import { DocGetFeatureFlags } from './feature-flags.openapi';
import { FeatureFlagsService } from './feature-flags.service';

@ApiTags('platform')
@Public()
@Controller('features')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  @DocGetFeatureFlags()
  getFlags() {
    return ok(this.flags.getPublicFlags());
  }
}
