import { SetMetadata } from '@nestjs/common';
import type { UserRole } from '../auth/auth-principal';

export const ROLES_KEY = 'alfred:roles';

export const Roles = (...roles: readonly UserRole[]) => SetMetadata(ROLES_KEY, roles);
