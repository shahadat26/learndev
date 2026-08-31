import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Prisma } from '@prisma/client';

import { CategoryEntity } from '../categories/entities/category.entity';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { ProductEntity } from './entities/product.entity';
import { ProductsService } from './products.service';

/**
 * Pure unit tests: PrismaService is replaced by an in-memory double, so the
 * suite runs with no database and no network. That is what makes it safe to run
 * on every CI push.
 */
const createPrismaMock = () => ({
  product: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  category: {
    findUnique: jest.fn(),
  },
  $transaction: jest.fn(),
});

type PrismaMock = ReturnType<typeof createPrismaMock>;

const buildQuery = (overrides: Partial<QueryProductsDto> = {}): QueryProductsDto =>
  Object.assign(new QueryProductsDto(), overrides);

const productRow = {
  id: 'product-1',
  sku: 'ELEC-HEADPHONES-01',
  name: 'Aurora Wireless Headphones',
  slug: 'aurora-wireless-headphones',
  description: 'Over-ear headphones',
  priceCents: 18999,
  currency: 'USD',
  stock: 42,
  imageUrl: null,
  isActive: true,
  categoryId: 'category-1',
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  category: {
    id: 'category-1',
    name: 'Electronics',
    slug: 'electronics',
    description: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  },
};

const createDto: CreateProductDto = {
  sku: 'ELEC-HEADPHONES-01',
  name: 'Aurora Wireless Headphones',
  description: 'Over-ear headphones',
  priceCents: 18999,
  categoryId: 'category-1',
};

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaMock;

  beforeEach(async () => {
    prisma = createPrismaMock();
    prisma.$transaction.mockImplementation((operations: unknown) =>
      Promise.all(operations as Promise<unknown>[]),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [ProductsService, { provide: PrismaService, useValue: prisma }],
    }).compile();

    service = module.get(ProductsService);
  });

  describe('findAll', () => {
    it('returns the shared paginated envelope and computes totalPages', async () => {
      prisma.product.findMany.mockResolvedValue([productRow]);
      prisma.product.count.mockResolvedValue(42);

      const result = await service.findAll(buildQuery({ page: 2, limit: 20 }));

      expect(result.data).toEqual([productRow]);
      expect(result.meta).toEqual({ page: 2, limit: 20, total: 42, totalPages: 3 });
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 20, take: 20 }),
      );
    });

    it('maps rows through ProductEntity instead of returning the raw Prisma row', async () => {
      // A column that exists in the database but is not @Expose()d on the entity
      // must not reach the client. This is the regression test for "add an
      // internal column, publish it to GET /products by accident".
      prisma.product.findMany.mockResolvedValue([{ ...productRow, costCents: 4200 }]);
      prisma.product.count.mockResolvedValue(1);

      const result = await service.findAll(buildQuery());

      expect(result.data[0]).toBeInstanceOf(ProductEntity);
      expect(result.data[0]).not.toHaveProperty('costCents');
      expect(result.data[0].priceCents).toBe(18999);
      expect(result.data[0].category).toBeInstanceOf(CategoryEntity);
    });

    it('hides unpublished products from the public catalogue', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      // Even when a caller explicitly asks for the unpublished rows.
      await service.findAll(buildQuery({ isActive: false }));

      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('lets an ADMIN opt in to unpublished products', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll(buildQuery(), { includeInactive: true });
      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: {} }));

      await service.findAll(buildQuery({ isActive: false }), { includeInactive: true });
      expect(prisma.product.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ where: { isActive: false } }),
      );
    });

    it('builds a case-insensitive search across name and description', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll(buildQuery({ search: 'headphones', categoryId: 'category-1' }));

      const where: Prisma.ProductWhereInput = {
        categoryId: 'category-1',
        isActive: true,
        OR: [
          { name: { contains: 'headphones', mode: 'insensitive' } },
          { description: { contains: 'headphones', mode: 'insensitive' } },
        ],
      };
      expect(prisma.product.findMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      expect(prisma.product.count).toHaveBeenCalledWith({ where });
    });

    it('defaults to newest first and honours a whitelisted sort', async () => {
      prisma.product.findMany.mockResolvedValue([]);
      prisma.product.count.mockResolvedValue(0);

      await service.findAll(buildQuery());
      expect(prisma.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ orderBy: { createdAt: 'desc' } }),
      );

      await service.findAll(buildQuery({ sort: 'priceCents:asc' }));
      expect(prisma.product.findMany).toHaveBeenLastCalledWith(
        expect.objectContaining({ orderBy: { priceCents: 'asc' } }),
      );
    });

    it('rejects a sort field that is not on the whitelist', async () => {
      await expect(service.findAll(buildQuery({ sort: 'category.name:asc' }))).rejects.toThrow(
        BadRequestException,
      );
      expect(prisma.product.findMany).not.toHaveBeenCalled();
    });
  });

  describe('findOne', () => {
    it('returns the product with its category', async () => {
      prisma.product.findUnique.mockResolvedValue(productRow);

      await expect(service.findOne('product-1')).resolves.toEqual(productRow);
    });

    it('throws 404 when the id does not exist', async () => {
      prisma.product.findUnique.mockResolvedValue(null);

      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });

    it('404s an unpublished product for a public caller but not for an ADMIN', async () => {
      const inactive = { ...productRow, isActive: false };
      prisma.product.findUnique.mockResolvedValue(inactive);

      await expect(service.findOne('product-1')).rejects.toThrow(NotFoundException);
      await expect(service.findOne('product-1', { includeInactive: true })).resolves.toMatchObject({
        id: 'product-1',
        isActive: false,
      });
    });
  });

  describe('create', () => {
    it('derives the slug from the name and defaults currency to USD', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 'category-1' });
      prisma.product.create.mockResolvedValue(productRow);

      await service.create(createDto);

      // Asserted in full rather than with objectContaining: the exact payload
      // handed to Prisma is the contract this service is responsible for.
      expect(prisma.product.create).toHaveBeenCalledWith({
        data: {
          sku: 'ELEC-HEADPHONES-01',
          name: 'Aurora Wireless Headphones',
          slug: 'aurora-wireless-headphones',
          description: 'Over-ear headphones',
          priceCents: 18999,
          currency: 'USD',
          stock: 0,
          imageUrl: null,
          isActive: true,
          category: { connect: { id: 'category-1' } },
        },
        include: { category: true },
      });
    });

    it('returns 400 when the category does not exist', async () => {
      prisma.category.findUnique.mockResolvedValue(null);

      await expect(service.create(createDto)).rejects.toThrow(BadRequestException);
      expect(prisma.product.create).not.toHaveBeenCalled();
    });

    it('maps a unique constraint violation to 409', async () => {
      prisma.category.findUnique.mockResolvedValue({ id: 'category-1' });
      prisma.product.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
          code: 'P2002',
          clientVersion: '6.0.0',
          meta: { target: ['sku'] },
        }),
      );

      await expect(service.create(createDto)).rejects.toThrow(ConflictException);
    });
  });

  describe('remove', () => {
    it('maps a missing row to 404', async () => {
      prisma.product.delete.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record to delete does not exist', {
          code: 'P2025',
          clientVersion: '6.0.0',
        }),
      );

      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });
  });
});
