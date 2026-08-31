import { SetMetadata } from '@nestjs/common';

import { Role } from '../enums/role.enum';

export const ROLES_KEY = 'roles';

/** Restrict a route (or a whole controller) to the listed roles. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
