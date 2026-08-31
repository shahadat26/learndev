import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

/**
 * End-to-end HTTP tests with NO database.
 *
 * The real Nest application is booted - global pipes, guards, filter, routing -
 * and only PrismaService is swapped for an in-memory double. That gives real
 * coverage of the wiring (auth, validation, error shape) while staying runnable
 * on a CI machine that has no Postgres.
 */
const prismaMock = {
  product: {
    findMany: jest.fn(),
    count: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
  category: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    create: jest.fn(),
  },
  $transaction: jest.fn(),
  $queryRaw: jest.fn(),
  $connect: jest.fn(),
  $disconnect: jest.fn(),
};

const categoryRow = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'Electronics',
  slug: 'electronics',
  description: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
};

const productRow = {
  id: '22222222-2222-4222-8222-222222222222',
  sku: 'ELEC-HEADPHONES-01',
  name: 'Aurora Wireless Headphones',
  slug: 'aurora-wireless-headphones',
  description: 'Over-ear headphones with 40h battery life.',
  priceCents: 18999,
  currency: 'USD',
  stock: 42,
  imageUrl: null,
  isActive: true,
  categoryId: categoryRow.id,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  category: categoryRow,
};

interface PaginatedBody {
  data: { id: string; priceCents: number }[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

interface ErrorBody {
  statusCode: number;
  message: string | string[];
  error: string;
  timestamp: string;
  path: string;
}

describe('product-service (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(prismaMock)
      .compile();

    app = moduleFixture.createNestApplication();
    // Mirror main.ts so the tests exercise the same request pipeline.
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    prismaMock.$transaction.mockImplementation((operations: unknown) =>
      Promise.all(operations as Promise<unknown>[]),
    );
  });

  describe('health', () => {
    it('GET /health is up without touching the database', async () => {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect((response.body as { status: string }).status).toBe('ok');
      expect(prismaMock.$queryRaw).not.toHaveBeenCalled();
    });

    it('GET /health/ready pings the database', async () => {
      prismaMock.$queryRaw.mockResolvedValue([{ '?column?': 1 }]);

      const response = await request(app.getHttpServer()).get('/health/ready').expect(200);

      expect((response.body as { status: string }).status).toBe('ok');
      expect(prismaMock.$queryRaw).toHaveBeenCalled();
    });
  });

  describe('GET /products', () => {
    it('is public and returns the shared paginated envelope', async () => {
      prismaMock.product.findMany.mockResolvedValue([productRow]);
      prismaMock.product.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer()).get('/products').expect(200);
      const body = response.body as PaginatedBody;

      expect(body.meta).toEqual({ page: 1, limit: 20, total: 1, totalPages: 1 });
      expect(body.data).toHaveLength(1);
      // Money crosses the wire as an integer number of cents.
      expect(body.data[0].priceCents).toBe(18999);
    });

    it('rejects a limit above the cap with a 400 in the standard error shape', async () => {
      const response = await request(app.getHttpServer()).get('/products?limit=500').expect(400);
      const body = response.body as ErrorBody;

      expect(body.statusCode).toBe(400);
      expect(body.error).toBe('Bad Request');
      expect(body.path).toBe('/products?limit=500');
      expect(typeof body.timestamp).toBe('string');
      expect(Array.isArray(body.message)).toBe(true);
    });

    it('rejects an unknown query parameter', async () => {
      await request(app.getHttpServer()).get('/products?nope=1').expect(400);
    });

    it('only ever returns published products to an anonymous visitor', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      // Explicitly asking for the unpublished rows must not work either.
      await request(app.getHttpServer()).get('/products?isActive=false').expect(200);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });

    it('serialises through ProductEntity, so a non-exposed column cannot leak', async () => {
      prismaMock.product.findMany.mockResolvedValue([{ ...productRow, costCents: 4200 }]);
      prismaMock.product.count.mockResolvedValue(1);

      const response = await request(app.getHttpServer()).get('/products').expect(200);
      const body = response.body as PaginatedBody;

      expect(body.data[0]).not.toHaveProperty('costCents');
    });

    it('treats a bad bearer token on a public route as anonymous, not 401', async () => {
      prismaMock.product.findMany.mockResolvedValue([]);
      prismaMock.product.count.mockResolvedValue(0);

      await request(app.getHttpServer())
        .get('/products')
        .set('Authorization', 'Bearer not-a-real-token')
        .expect(200);

      expect(prismaMock.product.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { isActive: true } }),
      );
    });
  });

  describe('GET /products/:id', () => {
    it('returns 404 for an unknown id', async () => {
      prismaMock.product.findUnique.mockResolvedValue(null);

      const response = await request(app.getHttpServer())
        .get('/products/does-not-exist')
        .expect(404);
      const body = response.body as ErrorBody;

      expect(body.statusCode).toBe(404);
      expect(body.error).toBe('Not Found');
    });

    it('returns 404 for an unpublished product', async () => {
      prismaMock.product.findUnique.mockResolvedValue({ ...productRow, isActive: false });

      await request(app.getHttpServer()).get(`/products/${productRow.id}`).expect(404);
    });
  });

  describe('GET /categories', () => {
    it('is public and flattens the product count', async () => {
      prismaMock.category.findMany.mockResolvedValue([{ ...categoryRow, _count: { products: 3 } }]);

      const response = await request(app.getHttpServer()).get('/categories').expect(200);
      const body = response.body as { slug: string; productCount: number }[];

      expect(body).toHaveLength(1);
      expect(body[0].productCount).toBe(3);
      expect(body[0]).not.toHaveProperty('_count');
    });
  });

  describe('write endpoints', () => {
    it('POST /products without a bearer token is 401', async () => {
      await request(app.getHttpServer())
        .post('/products')
        .send({
          sku: 'X-1',
          name: 'X',
          description: 'x',
          priceCents: 1,
          categoryId: categoryRow.id,
        })
        .expect(401);
      expect(prismaMock.product.create).not.toHaveBeenCalled();
    });

    it('POST /categories with a garbage token is 401', async () => {
      await request(app.getHttpServer())
        .post('/categories')
        .set('Authorization', 'Bearer not-a-real-token')
        .send({ name: 'Toys' })
        .expect(401);
      expect(prismaMock.category.create).not.toHaveBeenCalled();
    });

    it('DELETE /products/:id without a bearer token is 401', async () => {
      await request(app.getHttpServer()).delete(`/products/${productRow.id}`).expect(401);
      expect(prismaMock.product.delete).not.toHaveBeenCalled();
    });
  });
});
