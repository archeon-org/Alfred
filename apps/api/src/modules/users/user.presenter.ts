import type { PublicUser } from '@alfred/contracts';
import type { UserEntity } from './user.entity';

export type { PublicUser } from '@alfred/contracts';

export function toPublicUser(user: UserEntity): PublicUser {
  return Object.freeze({
    ...(user.avatarUrl === null ? {} : { avatarUrl: user.avatarUrl }),
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    role: user.role,
  });
}
