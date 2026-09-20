import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { WorkspacesService } from '../workspaces/application/workspaces.service';
import type { AuthPrincipal } from '../../common/auth/auth-principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ok } from '../../common/api-response';
import { toPublicUser } from './user.presenter';
import { DocGetCurrentUser, DocGetCurrentWorkspaces } from './users.openapi';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth('bearerAuth')
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly workspaces: WorkspacesService,
  ) {}

  @Get('me/workspaces')
  @DocGetCurrentWorkspaces()
  async getCurrentWorkspaces(@CurrentUser() principal: AuthPrincipal) {
    return ok(await this.workspaces.currentFor(principal.id));
  }

  @Get('me')
  @DocGetCurrentUser()
  async getCurrentUser(@CurrentUser() principal: AuthPrincipal) {
    return ok(toPublicUser(await this.usersService.findActiveById(principal.id)));
  }
}
