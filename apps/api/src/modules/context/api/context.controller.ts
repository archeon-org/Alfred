import type { ContextDocumentKind } from '@alfred/contracts';
import { Body, Controller, Get, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ok } from '../../../common/api-response';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { ResourceIdPipe } from '../../../common/validation/resource-id.pipe';
import { ContextService } from '../application/context.service';
import { SaveContextDocumentDto } from './dto/save-context-document.dto';

@ApiTags('context')
@ApiBearerAuth('bearerAuth')
@Controller('context/personal')
export class PersonalContextController {
  constructor(private readonly context: ContextService) {}
  @Get()
  async list(@CurrentUser() principal: AuthPrincipal) {
    return ok(await this.context.list(principal));
  }
  @Put(':kind')
  async save(
    @CurrentUser() principal: AuthPrincipal,
    @Param('kind') kind: ContextDocumentKind,
    @Body() body: SaveContextDocumentDto,
  ) {
    return ok(await this.context.save(principal, kind, body));
  }
}

@ApiTags('context')
@ApiBearerAuth('bearerAuth')
@Controller('projects/:projectId/context-documents')
export class ProjectContextController {
  constructor(private readonly context: ContextService) {}
  @Get()
  async list(
    @CurrentUser() principal: AuthPrincipal,
    @Param('projectId', new ResourceIdPipe('project')) projectId: string,
  ) {
    return ok(await this.context.list(principal, projectId));
  }
  @Put(':kind')
  async save(
    @CurrentUser() principal: AuthPrincipal,
    @Param('projectId', new ResourceIdPipe('project')) projectId: string,
    @Param('kind') kind: ContextDocumentKind,
    @Body() body: SaveContextDocumentDto,
  ) {
    return ok(await this.context.save(principal, kind, body, projectId));
  }
}
