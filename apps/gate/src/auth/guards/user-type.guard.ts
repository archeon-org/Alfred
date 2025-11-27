import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { UserEntity } from '@archeon-org/database';
import { USER_TYPE_KEY } from '../../common/decorators/user-type.decorator';

@Injectable()
export class UserTypeGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean | Promise<boolean> {
    const userTypes = this.reflector.getAllAndOverride<string[]>(
      USER_TYPE_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!userTypes) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user as UserEntity;

    if (!user) {
      return false;
    }

    return userTypes.some((type) => type === user.role);
  }
}
