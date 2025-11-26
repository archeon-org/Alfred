import { SetMetadata } from '@nestjs/common';
import { UserType } from '@archeon-org/types';

export const USER_TYPE_KEY = 'userRole';
export const AuthorizedUser = (...userTypes: UserType[]) =>
  SetMetadata(USER_TYPE_KEY, userTypes);
