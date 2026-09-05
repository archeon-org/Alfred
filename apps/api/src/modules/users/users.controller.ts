import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import type { AuthPrincipal } from '../../common/auth/auth-principal';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ok } from '../../common/api-response';
import { toPublicUser } from './user.presenter';
import { UsersService } from './users.service';

@ApiBearerAuth('bearerAuth')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  async getCurrentUser(@CurrentUser() principal: AuthPrincipal) {
    return ok(toPublicUser(await this.usersService.findActiveById(principal.id)));
  }
}
