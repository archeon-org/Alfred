import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../common/api-response';
import { RequiresFeature } from '../feature-flags/requires-feature.decorator';
import { DocGetStreamCapabilities } from './stream.openapi';
import { StreamService } from './stream.service';

@ApiTags('executions')
@ApiBearerAuth('bearerAuth')
@RequiresFeature('agUiStreaming')
@Controller('stream')
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @Get('capabilities')
  @DocGetStreamCapabilities()
  getCapabilities() {
    return ok(this.streamService.getCapabilities());
  }
}
