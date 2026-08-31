import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { isPrismaKnownError, uniqueConstraintFields } from '../common/utils/prisma-error.util';
import { slugify } from '../common/utils/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import {
  PRODUCT_SORTABLE_FIELDS,
  ProductSortableField,
  QueryProductsDto,
} from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductEntity } from './entities/product.entity';

/** A product row together with its category, as it comes back from Prisma. */
type ProductWithCategory = Prisma.ProductGetPayload<{ include: { category: true } }>;

/**
 * Whether the caller may see unpublished (`isActive: false`) rows. Only an ADMIN
 * ever gets `true`; the controller derives it from the access token.
 */
export interface CatalogueScope {
  includeInactive: boolean;
}

const PUBLIC_SCOPE: CatalogueScope = { includeInactive: false };

const INCLUDE_CATEGORY = { category: true } as const;
const DEFAULT_ORDER_BY: Prisma.ProductOrderByWithRelationInput = { createdAt: 'desc' };

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll(
    query: QueryProductsDto,
    scope: CatalogueScope = PUBLIC_SCOPE,
  ): Promise<PaginatedResponseDto<ProductEntity>> {
    const where = ProductsService.buildWhere(query, scope);

    // Rows and count in one transaction so they come from the same snapshot -
    // otherwise a concurrent insert yields a page that disagrees with `total`.
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where,
        include: INCLUDE_CATEGORY,
        orderBy: ProductsService.buildOrderBy(query.sort),
        skip: query.skip,
        take: query.limit,
      }),
      this.prisma.product.count({ where }),
    ]);

    return PaginatedResponseDto.create(
      ProductEntity.fromEntities(data),
      query.page,
      query.limit,
      total,
    );
  }

  async findOne(id: string, scope: CatalogueScope = PUBLIC_SCOPE): Promise<ProductEntity> {
    return ProductEntity.fromEntity(await this.findRow(id, scope));
  }

  async create(dto: CreateProductDto): Promise<ProductEntity> {
    await this.assertCategoryExists(dto.categoryId);

    try {
      return ProductEntity.fromEntity(
        await this.prisma.product.create({
          data: {
            sku: dto.sku,
            name: dto.name,
            slug: dto.slug ?? slugify(dto.name),
            description: dto.description,
            priceCents: dto.priceCents,
            currency: dto.currency ?? 'USD',
            stock: dto.stock ?? 0,
            imageUrl: dto.imageUrl ?? null,
            isActive: dto.isActive ?? true,
            category: { connect: { id: dto.categoryId } },
          },
          include: INCLUDE_CATEGORY,
        }),
      );
    } catch (error) {
      throw ProductsService.translate(error);
    }
  }

  async update(id: string, dto: UpdateProductDto): Promise<ProductEntity> {
    // Existence check first so a bad id is a clean 404 rather than a P2025.
    // An ADMIN edits unpublished products too, so this lookup is unscoped.
    await this.findRow(id, { includeInactive: true });

    if (dto.categoryId) {
      await this.assertCategoryExists(dto.categoryId);
    }

    try {
      return ProductEntity.fromEntity(
        await this.prisma.product.update({
          where: { id },
          // Prisma treats `undefined` as "leave this column alone", which is
          // exactly PATCH semantics. Note the slug is NOT regenerated when the
          // name changes: existing product URLs must keep working.
          data: {
            sku: dto.sku,
            name: dto.name,
            slug: dto.slug,
            description: dto.description,
            priceCents: dto.priceCents,
            currency: dto.currency,
            stock: dto.stock,
            imageUrl: dto.imageUrl,
            isActive: dto.isActive,
            ...(dto.categoryId ? { category: { connect: { id: dto.categoryId } } } : {}),
          },
          include: INCLUDE_CATEGORY,
        }),
      );
    } catch (error) {
      throw ProductsService.translate(error, id);
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.product.delete({ where: { id } });
    } catch (error) {
      throw ProductsService.translate(error, id);
    }
  }

  /**
   * Single lookup path for "one product by id". An unpublished product is a 404
   * for everyone but an ADMIN: taking a product off sale has to actually hide it,
   * including on the deep link `/products/:id` that a search engine or a shared
   * URL still points at. "Exists but you may not see it" is deliberately
   * indistinguishable from "does not exist".
   */
  private async findRow(id: string, scope: CatalogueScope): Promise<ProductWithCategory> {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: INCLUDE_CATEGORY,
    });

    if (!product || (!scope.includeInactive && !product.isActive)) {
      throw new NotFoundException(`Product with id "${id}" not found`);
    }

    return product;
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    const category = await this.prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      // 400, not 404: the *product* request is malformed, the missing thing is
      // a value inside the body rather than the resource being addressed.
      throw new BadRequestException(`Category with id "${categoryId}" does not exist`);
    }
  }

  private static buildWhere(
    query: QueryProductsDto,
    scope: CatalogueScope,
  ): Prisma.ProductWhereInput {
    const where: Prisma.ProductWhereInput = {};

    if (query.categoryId) {
      where.categoryId = query.categoryId;
    }

    // Publication state. The storefront is anonymous, so the default has to be
    // "published only" - otherwise deactivating a product changes nothing and
    // `isActive` is a column that merely looks like a feature. `?isActive=` is
    // honoured only for an ADMIN, who is the one person allowed to look at the
    // unpublished catalogue.
    if (!scope.includeInactive) {
      where.isActive = true;
    } else if (typeof query.isActive === 'boolean') {
      where.isActive = query.isActive;
    }

    if (query.search) {
      // `mode: 'insensitive'` maps to ILIKE on PostgreSQL.
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { description: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  private static buildOrderBy(sort?: string): Prisma.ProductOrderByWithRelationInput {
    if (!sort) {
      return DEFAULT_ORDER_BY;
    }

    const [field, direction] = sort.split(':');

    // The DTO already validates this, but a service must not trust its caller:
    // an unchecked field name here would let a client order by anything.
    const isSortable = (PRODUCT_SORTABLE_FIELDS as readonly string[]).includes(field);
    if (!isSortable || (direction !== 'asc' && direction !== 'desc')) {
      throw new BadRequestException(
        `Invalid sort "${sort}". Expected one of ${PRODUCT_SORTABLE_FIELDS.join(', ')} with :asc or :desc`,
      );
    }

    // Safe cast: `field` was just checked against the whitelist above.
    const orderBy: Record<ProductSortableField, 'asc' | 'desc'> = {
      [field as ProductSortableField]: direction,
    } as Record<ProductSortableField, 'asc' | 'desc'>;

    return orderBy;
  }

  private static translate(error: unknown, id?: string): Error {
    if (isPrismaKnownError(error, 'P2002')) {
      return new ConflictException(
        `A product with this ${uniqueConstraintFields(error)} already exists`,
      );
    }

    if (isPrismaKnownError(error, 'P2003') || isPrismaKnownError(error, 'P2025')) {
      return id
        ? new NotFoundException(`Product with id "${id}" not found`)
        : new BadRequestException('Referenced record does not exist');
    }

    return error instanceof Error ? error : new Error(String(error));
  }
}
