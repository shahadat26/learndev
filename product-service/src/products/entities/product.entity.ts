import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, Type, plainToInstance } from 'class-transformer';

import { CategoryEntity, type CategoryRow } from '../../categories/entities/category.entity';

/** A product row as Prisma hands it over, with its category joined in. */
export interface ProductRow {
  id: string;
  sku: string;
  name: string;
  slug: string;
  description: string;
  priceCents: number;
  currency: string;
  stock: number;
  imageUrl: string | null;
  isActive: boolean;
  categoryId: string;
  createdAt: Date;
  updatedAt: Date;
  category?: CategoryRow;
}

/**
 * The ONLY product shape that leaves this service.
 *
 * `@Exclude()` on the class plus `excludeExtraneousValues` in `fromEntity` makes
 * this an allow-list, exactly like `UserResponseDto` in account-service: a field
 * is serialised only if it is explicitly `@Expose()`d below. Add a `costCents`,
 * a supplier note or an internal flag to `model Product` tomorrow and it stays
 * private until somebody deliberately exposes it here. Returning the raw Prisma
 * row instead would publish every new column to the unauthenticated
 * `GET /products` with no code change and no failing test.
 */
@Exclude()
export class ProductEntity {
  @ApiProperty({ format: 'uuid', example: '1c9d6f2a-3b4c-4d5e-8f90-a1b2c3d4e5f6' })
  @Expose()
  id!: string;

  @ApiProperty({ example: 'ELEC-HEADPHONES-01', description: 'Stable business identifier' })
  @Expose()
  sku!: string;

  @ApiProperty({ example: 'Aurora Wireless Headphones' })
  @Expose()
  name!: string;

  @ApiProperty({ example: 'aurora-wireless-headphones' })
  @Expose()
  slug!: string;

  @ApiProperty({ example: 'Over-ear headphones with 40h battery life.' })
  @Expose()
  description!: string;

  @ApiProperty({
    example: 18999,
    description:
      'Price in minor units (cents). Integers only - floating point money loses precision.',
  })
  @Expose()
  priceCents!: number;

  @ApiProperty({ example: 'USD', description: 'ISO-4217 currency code' })
  @Expose()
  currency!: string;

  @ApiProperty({ example: 42 })
  @Expose()
  stock!: number;

  @ApiProperty({
    nullable: true,
    type: String,
    example: 'https://picsum.photos/seed/aurora/600/600',
  })
  @Expose()
  imageUrl!: string | null;

  @ApiProperty({ example: true, description: 'Published. Inactive products are off sale.' })
  @Expose()
  isActive!: boolean;

  @ApiProperty({ format: 'uuid' })
  @Expose()
  categoryId!: string;

  // `@Type` makes the nested object go through CategoryEntity's own allow-list
  // rather than being copied verbatim.
  @ApiPropertyOptional({ type: () => CategoryEntity })
  @Expose()
  @Type(() => CategoryEntity)
  category?: CategoryEntity;

  @ApiProperty({ type: String, format: 'date-time' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Expose()
  updatedAt!: Date;

  static fromEntity(product: ProductRow): ProductEntity {
    return plainToInstance(ProductEntity, product, { excludeExtraneousValues: true });
  }

  static fromEntities(products: ProductRow[]): ProductEntity[] {
    return products.map((product) => ProductEntity.fromEntity(product));
  }
}
