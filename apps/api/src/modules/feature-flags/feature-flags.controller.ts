import { Controller, Get } from '@nestjs/common';
import { ok } from '../../common/api-response';
import { Public } from '../../common/decorators/public.decorator';
import { FeatureFlagsService } from './feature-flags.service';

@Public()
@Controller('features')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  @Get()
  getFlags() {
    return ok(this.flags.getPublicFlags());
  }
}
