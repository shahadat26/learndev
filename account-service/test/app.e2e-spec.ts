import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Role, type RefreshToken, type User } from '@prisma/client';
import { hash } from 'bcryptjs';
import request from 'supertest';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

jest.setTimeout(30_000);

/**
 * An in-memory stand-in for PrismaService.
 *
 * The whole application - guards, pipes, filter, controllers, JWT signing and
 * verification - is exercised for real; only the database is replaced. That
 * keeps the suite runnable in CI with no Postgres container and no network,
 * which is what makes it safe to run on every push.
 */
class InMemoryPrisma {
  readonly users: User[] = [];
  readonly refreshTokens: RefreshToken[] = [];
  private sequence = 0;

  private nextId(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  readonly user = {
    findUnique: ({ where }: { where: { id?: string; email?: string } }): Promise<User | null> => {
      const found = this.users.find(
        (candidate) =>
          (where.id !== undefined && candidate.id === where.id) ||
          (where.email !== undefined && candidate.email === where.email),
      );
      return Promise.resolve(found ? { ...found } : null);
    },

    create: ({
      data,
    }: {
      data: Partial<User> & { email: string; password: string };
    }): Promise<User> => {
      const now = new Date();
      const created: User = {
        id: this.nextId('user'),
        email: data.email,
        password: data.password,
        firstName: data.firstName ?? null,
        lastName: data.lastName ?? null,
        role: data.role ?? Role.USER,
        isActive: data.isActive ?? true,
        createdAt: now,
        updatedAt: now,
      };
      this.users.push(created);
      return Promise.resolve({ ...created });
    },

    update: ({ where, data }: { where: { id: string }; data: Partial<User> }): Promise<User> => {
      const existing = this.users.find((candidate) => candidate.id === where.id);
      if (!existing) {
        throw new Error('Record to update not found');
      }
      Object.assign(existing, data, { updatedAt: new Date() });
      return Promise.resolve({ ...existing });
    },

    count: (): Promise<number> => Promise.resolve(this.users.length),

    findMany: ({ skip = 0, take = 20 }: { skip?: number; take?: number }): Promise<User[]> =>
      Promise.resolve(
        [...this.users]
          .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
          .slice(skip, skip + take)
          .map((candidate) => ({ ...candidate })),
      ),
  };

  readonly refreshToken = {
    create: ({
      data,
    }: {
      data: { jti: string; tokenHash: string; userId: string; expiresAt: Date };
    }): Promise<RefreshToken> => {
      const created: RefreshToken = {
        id: this.nextId('rt'),
        jti: data.jti,
        tokenHash: data.tokenHash,
        userId: data.userId,
        expiresAt: data.expiresAt,
        revokedAt: null,
        createdAt: new Date(),
      };
      this.refreshTokens.push(created);
      return Promise.resolve({ ...created });
    },

    findUnique: ({
      where,
    }: {
      where: { jti: string };
      include?: { user?: boolean };
    }): Promise<(RefreshToken & { user: User }) | null> => {
      const found = this.refreshTokens.find((candidate) => candidate.jti === where.jti);
      if (!found) {
        return Promise.resolve(null);
      }
      const owner = this.users.find((candidate) => candidate.id === found.userId);
      if (!owner) {
        return Promise.resolve(null);
      }
      return Promise.resolve({ ...found, user: { ...owner } });
    },

    update: ({
      where,
      data,
    }: {
      where: { id: string };
      data: Partial<RefreshToken>;
    }): Promise<RefreshToken> => {
      const existing = this.refreshTokens.find((candidate) => candidate.id === where.id);
      if (!existing) {
        throw new Error('Record to update not found');
      }
      Object.assign(existing, data);
      return Promise.resolve({ ...existing });
    },

    updateMany: ({
      where,
      data,
    }: {
      where: { jti?: string; userId?: string; revokedAt?: Date | null };
      data: Partial<RefreshToken>;
    }): Promise<{ count: number }> => {
      const matches = this.refreshTokens.filter(
        (candidate) =>
          (where.jti === undefined || candidate.jti === where.jti) &&
          (where.userId === undefined || candidate.userId === where.userId) &&
          (where.revokedAt === undefined || candidate.revokedAt === where.revokedAt),
      );
      matches.forEach((match) => Object.assign(match, data));
      return Promise.resolve({ count: matches.length });
    },
  };

  $transaction<T>(operations: Promise<T>[]): Promise<T[]> {
    return Promise.all(operations);
  }

  $queryRaw(): Promise<unknown> {
    return Promise.resolve([{ '?column?': 1 }]);
  }

  $connect(): Promise<void> {
    return Promise.resolve();
  }

  $disconnect(): Promise<void> {
    return Promise.resolve();
  }
}

describe('account-service (e2e, no database)', () => {
  let app: INestApplication;
  let prisma: InMemoryPrisma;
  let server: Parameters<typeof request>[0];

  const REGISTER_BODY = {
    email: 'e2e@shop.local',
    password: 'Passw0rd!',
    firstName: 'Eve',
    lastName: 'Tester',
  };

  beforeAll(async () => {
    prisma = new InMemoryPrisma();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      // The mock implements only the slice of PrismaClient this service touches;
      // structurally satisfying the full generated client would be pure noise.
      .useValue(prisma)
      .compile();

    app = moduleRef.createNestApplication();

    // Mirror main.ts, since global pipes are configured on the app, not the module.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );

    await app.init();
    server = app.getHttpServer() as Parameters<typeof request>[0];
  });

  afterAll(async () => {
    await app.close();
  });

  describe('health', () => {
    it('GET /health is public and does not touch the database', async () => {
      const response = await request(server).get('/health').expect(200);
      expect(response.body.status).toBe('ok');
    });

    it('GET /health/ready reports the database as up', async () => {
      const response = await request(server).get('/health/ready').expect(200);
      expect(response.body.status).toBe('ok');
      expect(response.body.details.database.status).toBe('up');
    });
  });

  describe('validation', () => {
    it('rejects a malformed email with 400 and the error envelope', async () => {
      const response = await request(server)
        .post('/auth/register')
        .send({ email: 'not-an-email', password: 'Passw0rd!' })
        .expect(400);

      expect(response.body).toMatchObject({
        statusCode: 400,
        error: 'Bad Request',
        path: '/auth/register',
      });
      expect(response.body.timestamp).toEqual(expect.any(String));
      expect(response.body.message).toEqual(
        expect.arrayContaining(['email must be a valid email address']),
      );
    });

    it('rejects an unexpected property rather than silently dropping it', async () => {
      await request(server)
        .post('/auth/register')
        .send({ ...REGISTER_BODY, role: 'ADMIN' })
        .expect(400);
    });
  });

  describe('registration and login', () => {
    let accessToken: string;
    let refreshToken: string;
    let userId: string;

    it('POST /auth/register returns 201 with a user that has no password', async () => {
      const response = await request(server).post('/auth/register').send(REGISTER_BODY).expect(201);

      expect(response.body.user).toEqual({
        id: expect.any(String) as string,
        email: 'e2e@shop.local',
        firstName: 'Eve',
        lastName: 'Tester',
        role: Role.USER,
        createdAt: expect.any(String) as string,
        updatedAt: expect.any(String) as string,
      });
      expect(response.body.user).not.toHaveProperty('password');
      expect(response.body.accessToken).toEqual(expect.any(String));
      expect(response.body.refreshToken).toEqual(expect.any(String));

      accessToken = response.body.accessToken;
      refreshToken = response.body.refreshToken;
      userId = response.body.user.id;
    });

    it('POST /auth/register with the same email returns 409', async () => {
      await request(server).post('/auth/register').send(REGISTER_BODY).expect(409);
    });

    it('POST /auth/login with a wrong password returns a non-revealing 401', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({ email: REGISTER_BODY.email, password: 'WrongPassw0rd!' })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('POST /auth/login with an unknown email returns the identical 401', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({ email: 'nobody@shop.local', password: 'WrongPassw0rd!' })
        .expect(401);

      expect(response.body.message).toBe('Invalid email or password');
    });

    it('POST /auth/login succeeds with 200', async () => {
      const response = await request(server)
        .post('/auth/login')
        .send({ email: REGISTER_BODY.email, password: REGISTER_BODY.password })
        .expect(200);

      expect(response.body.user.email).toBe(REGISTER_BODY.email);
      expect(response.body.user).not.toHaveProperty('password');
    });

    describe('protected routes', () => {
      it('GET /users/profile without a token returns 401', async () => {
        await request(server).get('/users/profile').expect(401);
      });

      it('GET /users/profile with a garbage token returns 401', async () => {
        await request(server)
          .get('/users/profile')
          .set('Authorization', 'Bearer not-a-real-token')
          .expect(401);
      });

      it('GET /users/profile with a valid token returns the user', async () => {
        const response = await request(server)
          .get('/users/profile')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(200);

        expect(response.body.email).toBe(REGISTER_BODY.email);
        expect(response.body).not.toHaveProperty('password');
      });

      it('PATCH /users/profile updates the caller', async () => {
        const response = await request(server)
          .patch('/users/profile')
          .set('Authorization', `Bearer ${accessToken}`)
          .send({ firstName: 'Evelyn' })
          .expect(200);

        expect(response.body.firstName).toBe('Evelyn');
        expect(response.body.lastName).toBe('Tester');
      });

      it('rejects a refresh token used as an access token', async () => {
        await request(server)
          .get('/users/profile')
          .set('Authorization', `Bearer ${refreshToken}`)
          .expect(401);
      });

      it('GET /users as a USER returns 403', async () => {
        await request(server)
          .get('/users')
          .set('Authorization', `Bearer ${accessToken}`)
          .expect(403);
      });
    });

    describe('refresh-token rotation', () => {
      it('rotates on use, then rejects the replayed token and kills the family', async () => {
        const rotation = await request(server)
          .post('/auth/refresh')
          .send({ refreshToken })
          .expect(200);

        const rotated = rotation.body.refreshToken as string;
        expect(rotation.body.accessToken).toEqual(expect.any(String));
        expect(rotated).not.toBe(refreshToken);

        // Replaying the token that was just rotated away must fail...
        await request(server).post('/auth/refresh').send({ refreshToken }).expect(401);

        // ...and detecting that replay revokes every live session for the user,
        // so even the legitimately-issued replacement is now dead. Whoever holds
        // the stolen token and the real user both have to log in again.
        expect(
          prisma.refreshTokens
            .filter((row) => row.userId === userId)
            .every((row) => row.revokedAt !== null),
        ).toBe(true);

        await request(server).post('/auth/refresh').send({ refreshToken: rotated }).expect(401);
      });

      it('POST /auth/logout is 204 even for an invalid token', async () => {
        await request(server).post('/auth/logout').send({ refreshToken: 'garbage' }).expect(204);
      });

      it('POST /auth/logout revokes a live token', async () => {
        const login = await request(server)
          .post('/auth/login')
          .send({ email: REGISTER_BODY.email, password: REGISTER_BODY.password })
          .expect(200);

        await request(server)
          .post('/auth/logout')
          .send({ refreshToken: login.body.refreshToken })
          .expect(204);

        await request(server)
          .post('/auth/refresh')
          .send({ refreshToken: login.body.refreshToken })
          .expect(401);
      });
    });
  });

  describe('admin-only listing', () => {
    it('GET /users as an ADMIN returns the paginated envelope', async () => {
      // Promote a seeded admin directly in the store, then authenticate as them.
      prisma.users.push({
        id: 'admin-e2e',
        email: 'admin@shop.local',
        password: await hash('Admin123!', 4),
        firstName: 'Ada',
        lastName: 'Admin',
        role: Role.ADMIN,
        isActive: true,
        createdAt: new Date('2024-01-01T00:00:00.000Z'),
        updatedAt: new Date('2024-01-01T00:00:00.000Z'),
      });

      const login = await request(server)
        .post('/auth/login')
        .send({ email: 'admin@shop.local', password: 'Admin123!' })
        .expect(200);

      const response = await request(server)
        .get('/users?page=1&limit=20')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(200);

      expect(response.body.meta).toEqual({
        page: 1,
        limit: 20,
        total: prisma.users.length,
        totalPages: 1,
      });
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data[0]).not.toHaveProperty('password');
    });

    it('rejects an out-of-range limit with 400', async () => {
      const login = await request(server)
        .post('/auth/login')
        .send({ email: 'admin@shop.local', password: 'Admin123!' })
        .expect(200);

      await request(server)
        .get('/users?limit=5000')
        .set('Authorization', `Bearer ${login.body.accessToken}`)
        .expect(400);
    });
  });

  describe('rate limiting', () => {
    // Nothing here is time-dependent beyond the one-minute window, and the
    // whole suite shares a single app instance, so these counts are exact.
    const GUESS = { email: 'stuffing-target@shop.local', password: 'WrongPassw0rd!' };

    it('stops password guessing against one email with 429 once the bucket is empty', async () => {
      // THROTTLE_CREDENTIAL_LIMIT attempts per minute per (address, email).
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await request(server).post('/auth/login').send(GUESS).expect(401);
      }

      const blocked = await request(server).post('/auth/login').send(GUESS).expect(429);

      expect(blocked.body).toMatchObject({
        statusCode: 429,
        error: 'Too Many Requests',
        path: '/auth/login',
      });
    });

    it('leaves a different email unaffected - the bucket is per account', async () => {
      await request(server)
        .post('/auth/login')
        .send({ email: 'someone-else@shop.local', password: 'WrongPassw0rd!' })
        .expect(401);
    });

    it('never throttles the health probes', async () => {
      for (let probe = 0; probe < 8; probe += 1) {
        await request(server).get('/health').expect(200);
      }
    });
  });

  describe('unknown routes', () => {
    it('returns the error envelope for a 404', async () => {
      const response = await request(server).get('/does-not-exist').expect(404);

      expect(response.body).toMatchObject({ statusCode: 404, path: '/does-not-exist' });
      expect(response.body.timestamp).toEqual(expect.any(String));
    });
  });
});
