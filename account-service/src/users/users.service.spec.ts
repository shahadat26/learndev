import { UnauthorizedException } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { Role, type User } from '@prisma/client';

import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;

  const prisma = {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      findMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  const buildUser = (overrides: Partial<User> = {}): User => ({
    id: 'user-1',
    email: 'user@shop.local',
    // A realistic bcrypt hash: the assertions below prove it never escapes.
    password: '$2b$12$abcdefghijklmnopqrstuv0123456789ABCDEFGHIJKLMNOPQRSTU',
    firstName: 'Uma',
    lastName: 'User',
    role: Role.USER,
    isActive: true,
    createdAt: new Date('2024-01-01T00:00:00.000Z'),
    updatedAt: new Date('2024-01-01T00:00:00.000Z'),
    ...overrides,
  });

  const paginationOf = (page: number, limit: number): PaginationQueryDto => {
    const query = new PaginationQueryDto();
    query.page = page;
    query.limit = limit;
    return query;
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [UsersService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(UsersService);
  });

  describe('findProfile', () => {
    it('maps the entity to the response DTO without the password hash', async () => {
      const entity = buildUser();
      prisma.user.findUnique.mockResolvedValue(entity);

      const result = await service.findProfile('user-1');

      expect(result).not.toHaveProperty('password');
      expect(JSON.stringify(result)).not.toContain(entity.password);
      // isActive is an internal flag, deliberately not part of the public shape.
      expect(result).not.toHaveProperty('isActive');
      expect(result).toEqual({
        id: 'user-1',
        email: 'user@shop.local',
        firstName: 'Uma',
        lastName: 'User',
        role: Role.USER,
        createdAt: entity.createdAt,
        updatedAt: entity.updatedAt,
      });
    });

    it('treats a token for a deleted account as unauthenticated', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.findProfile('ghost')).rejects.toBeInstanceOf(UnauthorizedException);
    });
  });

  describe('updateProfile', () => {
    it('only writes the fields the caller actually sent', async () => {
      prisma.user.update.mockResolvedValue(buildUser({ firstName: 'Updated' }));

      await service.updateProfile('user-1', { firstName: 'Updated' });

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { firstName: 'Updated' },
      });
    });

    it('never returns the password hash', async () => {
      const entity = buildUser({ lastName: 'Renamed' });
      prisma.user.update.mockResolvedValue(entity);

      const result = await service.updateProfile('user-1', { lastName: 'Renamed' });

      expect(result).not.toHaveProperty('password');
      expect(JSON.stringify(result)).not.toContain(entity.password);
    });
  });

  describe('findAll', () => {
    it('returns the shared paginated envelope with correct meta', async () => {
      const rows = [buildUser({ id: 'a' }), buildUser({ id: 'b' })];
      prisma.$transaction.mockResolvedValue([42, rows]);

      const result = await service.findAll(paginationOf(2, 20));

      expect(result.meta).toEqual({ page: 2, limit: 20, total: 42, totalPages: 3 });
      expect(result.data).toHaveLength(2);
      expect(result.data[0]).not.toHaveProperty('password');
      expect(JSON.stringify(result)).not.toContain(rows[0].password);
    });

    it('offsets by (page - 1) * limit', async () => {
      prisma.$transaction.mockResolvedValue([0, []]);

      await service.findAll(paginationOf(3, 10));

      expect(prisma.user.findMany).toHaveBeenCalledWith({
        skip: 20,
        take: 10,
        orderBy: { createdAt: 'desc' },
      });
    });
  });
});
