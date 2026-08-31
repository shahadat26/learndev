import { createHash } from 'node:crypto';

import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test, type TestingModule } from '@nestjs/testing';
import { Role, type User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';

import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import { type AccessTokenPayload, type RefreshTokenPayload } from './types/jwt-payload.type';

const ACCESS_SECRET = 'unit_test_access_secret_long_enough_here';
const REFRESH_SECRET = 'unit_test_refresh_secret_long_enough_here';
const SALT_ROUNDS = 4;
const PLAINTEXT_PASSWORD = 'User123!';

const configValues = {
  jwt: {
    accessSecret: ACCESS_SECRET,
    accessTtl: '15m',
    refreshSecret: REFRESH_SECRET,
    refreshTtl: '7d',
  },
  bcryptSaltRounds: SALT_ROUNDS,
};

const digest = (token: string): string => createHash('sha256').update(token).digest('hex');

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: JwtService;
  let passwordHash: string;

  const prisma = {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
    },
    refreshToken: {
      create: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const buildUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-1',
    email: 'user@shop.local',
    password: passwordHash,
    firstName: 'Uma',
    lastName: 'User',
    role: Role.USER,
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  });

  beforeAll(async () => {
    passwordHash = await hash(PLAINTEXT_PASSWORD, SALT_ROUNDS);
  });

  beforeEach(async () => {
    jest.clearAllMocks();

    prisma.refreshToken.create.mockResolvedValue({ id: 'token-row-1' });
    prisma.refreshToken.update.mockResolvedValue({ id: 'token-row-1' });
    prisma.refreshToken.updateMany.mockResolvedValue({ count: 1 });
    prisma.$transaction.mockImplementation((operations: Promise<unknown>[]) =>
      Promise.all(operations),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        // A real JwtService, so the tokens under test are genuinely signed and
        // genuinely verified rather than stubbed strings.
        { provide: JwtService, useValue: new JwtService({}) },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: keyof typeof configValues) => configValues[key]),
          },
        },
      ],
    }).compile();

    service = module.get(AuthService);
    jwtService = module.get(JwtService);
  });

  describe('register', () => {
    it('stores a bcrypt hash and never returns the password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: { data: Partial<User> }) =>
        Promise.resolve(buildUser({ ...data, password: data.password })),
      );

      const result = await service.register({
        email: 'new@shop.local',
        password: PLAINTEXT_PASSWORD,
      });

      const created = prisma.user.create.mock.calls[0][0] as { data: { password: string } };
      expect(created.data.password).not.toBe(PLAINTEXT_PASSWORD);
      await expect(compare(PLAINTEXT_PASSWORD, created.data.password)).resolves.toBe(true);

      // The contract's user shape, and nothing more.
      expect(Object.keys(result.user).sort()).toEqual([
        'createdAt',
        'email',
        'firstName',
        'id',
        'lastName',
        'role',
        'updatedAt',
      ]);
      expect(result.user).not.toHaveProperty('password');
      expect(result.user).not.toHaveProperty('isActive');
      // Belt and braces: the hash must not survive serialisation either.
      expect(JSON.stringify(result)).not.toContain(created.data.password);
    });

    it('rejects a duplicate email with 409', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      await expect(
        service.register({ email: 'user@shop.local', password: PLAINTEXT_PASSWORD }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    it('issues an access token carrying sub, email, role and type=access', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser());

      const result = await service.login({
        email: 'user@shop.local',
        password: PLAINTEXT_PASSWORD,
      });

      const payload = jwtService.verify<AccessTokenPayload>(result.accessToken, {
        secret: ACCESS_SECRET,
      });

      expect(payload).toMatchObject({
        sub: 'user-1',
        email: 'user@shop.local',
        role: Role.USER,
        type: 'access',
      });
      expect(result.user).not.toHaveProperty('password');
    });

    it('gives the same 401 for an unknown email and a wrong password', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      const unknownEmail = await service
        .login({ email: 'nobody@shop.local', password: PLAINTEXT_PASSWORD })
        .catch((error: UnauthorizedException) => error);

      prisma.user.findUnique.mockResolvedValue(buildUser());
      const wrongPassword = await service
        .login({ email: 'user@shop.local', password: 'WrongPassword1' })
        .catch((error: UnauthorizedException) => error);

      expect(unknownEmail).toBeInstanceOf(UnauthorizedException);
      expect(wrongPassword).toBeInstanceOf(UnauthorizedException);
      // Identical wording is the point: the response must not tell an attacker
      // which half of the credential pair was wrong.
      expect((unknownEmail as UnauthorizedException).message).toBe(
        (wrongPassword as UnauthorizedException).message,
      );
      expect((unknownEmail as UnauthorizedException).message).toBe('Invalid email or password');
    });

    it('refuses a deactivated account', async () => {
      prisma.user.findUnique.mockResolvedValue(buildUser({ isActive: false }));

      await expect(
        service.login({ email: 'user@shop.local', password: PLAINTEXT_PASSWORD }),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('refresh', () => {
    /** Logs in, then rebuilds the row the service would have persisted. */
    const loginAndCaptureStoredToken = async (): Promise<{
      refreshToken: string;
      storedRow: Record<string, unknown>;
    }> => {
      prisma.user.findUnique.mockResolvedValue(buildUser());
      const { refreshToken } = await service.login({
        email: 'user@shop.local',
        password: PLAINTEXT_PASSWORD,
      });

      const created = prisma.refreshToken.create.mock.calls[0][0] as {
        data: { jti: string; tokenHash: string; expiresAt: Date };
      };

      return {
        refreshToken,
        storedRow: {
          id: 'token-row-1',
          jti: created.data.jti,
          tokenHash: created.data.tokenHash,
          userId: 'user-1',
          expiresAt: created.data.expiresAt,
          revokedAt: null,
          createdAt: new Date(),
          user: buildUser(),
        },
      };
    };

    it('rotates the token: revokes the old row and stores a new one', async () => {
      const { refreshToken, storedRow } = await loginAndCaptureStoredToken();
      prisma.refreshToken.findUnique.mockResolvedValue(storedRow);

      const result = await service.refresh(refreshToken);

      expect(result.refreshToken).not.toBe(refreshToken);

      // Revoke-old and create-new go out as one transaction, so we can never
      // end up with two live tokens or none.
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);
      expect(prisma.refreshToken.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'token-row-1' },
          data: expect.objectContaining({ revokedAt: expect.any(Date) as Date }),
        }),
      );

      const newPayload = jwtService.verify<RefreshTokenPayload>(result.refreshToken, {
        secret: REFRESH_SECRET,
      });
      expect(newPayload.jti).not.toBe((storedRow as { jti: string }).jti);
      expect(newPayload.type).toBe('refresh');
    });

    it('rejects a reused token and revokes every session for that user', async () => {
      const { refreshToken, storedRow } = await loginAndCaptureStoredToken();
      // Already rotated away: this is the replay case.
      prisma.refreshToken.findUnique.mockResolvedValue({ ...storedRow, revokedAt: new Date() });

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) as Date }),
      });
    });

    it('rejects a token whose stored hash does not match', async () => {
      const { refreshToken, storedRow } = await loginAndCaptureStoredToken();
      prisma.refreshToken.findUnique.mockResolvedValue({
        ...storedRow,
        tokenHash: await hash(digest('a-completely-different-token'), SALT_ROUNDS),
      });

      await expect(service.refresh(refreshToken)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('rejects an access token presented at the refresh endpoint', async () => {
      // Signed with the refresh secret but carrying type=access: only the
      // explicit `type` check stops this being accepted.
      const impostor = jwtService.sign(
        { sub: 'user-1', jti: 'some-jti', type: 'access' },
        { secret: REFRESH_SECRET, expiresIn: '7d' },
      );

      await expect(service.refresh(impostor)).rejects.toBeInstanceOf(UnauthorizedException);
      expect(prisma.refreshToken.findUnique).not.toHaveBeenCalled();
    });

    it('rejects a token signed with the wrong secret', async () => {
      const forged = jwtService.sign(
        { sub: 'user-1', jti: 'some-jti', type: 'refresh' },
        { secret: 'an_entirely_different_secret_32_chars', expiresIn: '7d' },
      );

      await expect(service.refresh(forged)).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('revokes the presented token', async () => {
      const refreshToken = jwtService.sign(
        { sub: 'user-1', jti: 'jti-to-revoke', type: 'refresh' },
        { secret: REFRESH_SECRET, expiresIn: '7d' },
      );

      await service.logout(refreshToken);

      expect(prisma.refreshToken.updateMany).toHaveBeenCalledWith({
        where: { jti: 'jti-to-revoke', revokedAt: null },
        data: expect.objectContaining({ revokedAt: expect.any(Date) as Date }),
      });
    });

    it('is idempotent for a garbage token', async () => {
      await expect(service.logout('not-a-jwt')).resolves.toBeUndefined();
      expect(prisma.refreshToken.updateMany).not.toHaveBeenCalled();
    });
  });
});
