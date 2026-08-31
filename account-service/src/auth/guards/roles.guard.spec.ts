import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';

import { type AuthenticatedUser } from '../../common/types/authenticated-user.type';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  const contextFor = (user?: AuthenticatedUser): ExecutionContext =>
    ({
      getHandler: () => jest.fn(),
      getClass: () => jest.fn(),
      switchToHttp: () => ({ getRequest: () => ({ user }) }),
    }) as unknown as ExecutionContext;

  const admin: AuthenticatedUser = {
    userId: 'admin-1',
    email: 'admin@shop.local',
    role: Role.ADMIN,
  };
  const user: AuthenticatedUser = { userId: 'user-1', email: 'user@shop.local', role: Role.USER };

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows any authenticated caller when the route has no @Roles', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(contextFor(user))).toBe(true);
  });

  it('allows a caller holding the required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(guard.canActivate(contextFor(admin))).toBe(true);
  });

  it('rejects a caller without the required role with 403, not 401', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    // Authenticated but not authorised: the caller is known, they simply may not.
    expect(() => guard.canActivate(contextFor(user))).toThrow(ForbiddenException);
  });

  it('rejects when no user was attached to the request', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(contextFor(undefined))).toThrow(ForbiddenException);
  });

  it('treats an empty @Roles list as no restriction', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([]);

    expect(guard.canActivate(contextFor(user))).toBe(true);
  });
});
