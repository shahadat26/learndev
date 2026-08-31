import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { Role } from '../../common/enums/role.enum';
import { AuthenticatedUser } from '../../common/interfaces/jwt-payload.interface';
import { RolesGuard } from './roles.guard';

const createContext = (user?: AuthenticatedUser): ExecutionContext =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
    getHandler: () => undefined,
    getClass: () => undefined,
  }) as unknown as ExecutionContext;

const admin: AuthenticatedUser = { userId: 'u-1', email: 'admin@shop.local', role: Role.ADMIN };
const shopper: AuthenticatedUser = { userId: 'u-2', email: 'user@shop.local', role: Role.USER };

describe('RolesGuard', () => {
  let reflector: Reflector;
  let guard: RolesGuard;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('allows a route with no @Roles() metadata', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);

    expect(guard.canActivate(createContext(shopper))).toBe(true);
  });

  it('allows a user holding the required role', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(guard.canActivate(createContext(admin))).toBe(true);
  });

  it('rejects an authenticated user without the required role with 403', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(createContext(shopper))).toThrow(ForbiddenException);
  });

  it('rejects an anonymous request with 401 rather than 403', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue([Role.ADMIN]);

    expect(() => guard.canActivate(createContext())).toThrow(UnauthorizedException);
  });
});
