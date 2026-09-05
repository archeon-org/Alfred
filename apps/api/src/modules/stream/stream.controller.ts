import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { ok } from '../../common/api-response';
import { RequiresFeature } from '../feature-flags/requires-feature.decorator';
import { StreamService } from './stream.service';

@ApiBearerAuth('bearerAuth')
@RequiresFeature('agUiStreaming')
@Controller('stream')
export class StreamController {
  constructor(private readonly streamService: StreamService) {}

  @Get('capabilities')
  getCapabilities() {
    return ok(this.streamService.getCapabilities());
  }
}
