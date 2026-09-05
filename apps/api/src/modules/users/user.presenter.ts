import type { PublicUser } from '@alfred/contracts';

export type { PublicUser } from '@alfred/contracts';

type PresentableUser = Pick<PublicUser, 'displayName' | 'email' | 'id' | 'role'> & {
  readonly avatarUrl: string | null;
};

export function toPublicUser(user: PresentableUser): PublicUser {
  return Object.freeze({
    ...(user.avatarUrl === null ? {} : { avatarUrl: user.avatarUrl }),
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    role: user.role,
  });
}
