import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Exclude, Expose, plainToInstance } from 'class-transformer';

/**
 * A category row as Prisma hands it over, optionally with the `_count` aggregate
 * that `findAll`/`findOne` ask for. Declared here rather than in the service so
 * the mapping and the shape it maps from live next to each other.
 */
export interface CategoryRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count?: { products: number };
}

/**
 * The ONLY category shape that leaves this service.
 *
 * `@Exclude()` on the class plus `excludeExtraneousValues` in `fromEntity` makes
 * this an allow-list: a field is serialised only if it is explicitly `@Expose()`d
 * below. Add a column to `model Category` tomorrow - an internal note, a margin,
 * a supplier id - and it cannot reach the public API by accident. Handing a
 * Prisma row straight to the client is the opposite: every new column is
 * published the moment it exists.
 */
@Exclude()
export class CategoryEntity {
  @ApiProperty({ format: 'uuid', example: '6f8b6a2e-6a1f-4f1b-9f0e-2b3c4d5e6f70' })
  @Expose()
  id!: string;

  @ApiProperty({ example: 'Electronics' })
  @Expose()
  name!: string;

  @ApiProperty({ example: 'electronics' })
  @Expose()
  slug!: string;

  @ApiProperty({ nullable: true, type: String, example: 'Gadgets, audio and computing gear' })
  @Expose()
  description!: string | null;

  @ApiPropertyOptional({ description: 'Number of products in this category', example: 4 })
  @Expose()
  productCount?: number;

  @ApiProperty({ type: String, format: 'date-time' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Expose()
  updatedAt!: Date;

  /** Flattens Prisma's `_count` aggregate into the public `productCount` field. */
  static fromEntity(category: CategoryRow): CategoryEntity {
    const { _count, ...rest } = category;
    return plainToInstance(
      CategoryEntity,
      { ...rest, productCount: _count?.products },
      { excludeExtraneousValues: true },
    );
  }

  static fromEntities(categories: CategoryRow[]): CategoryEntity[] {
    return categories.map((category) => CategoryEntity.fromEntity(category));
  }
}
