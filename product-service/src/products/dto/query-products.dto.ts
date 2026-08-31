import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { PaginationQueryDto } from '../../common/dto/pagination-query.dto';

/**
 * Query strings are always text, so the DTO normalises before class-validator
 * runs. `TransformFnParams.value` is typed `any` by class-transformer; it is
 * narrowed to `unknown` here so nothing untyped leaks into the DTO.
 */
const trimText = ({ value }: TransformFnParams): unknown => {
  const raw: unknown = value;
  return typeof raw === 'string' ? raw.trim() : raw;
};

const toBoolean = ({ value }: TransformFnParams): unknown => {
  const raw: unknown = value;
  if (raw === 'true' || raw === true) return true;
  if (raw === 'false' || raw === false) return false;
  return raw;
};

/**
 * Only these columns may be sorted on. Never interpolate a caller-supplied
 * string into an `orderBy` - whitelist it, the same way you would a raw SQL
 * ORDER BY clause.
 */
export const PRODUCT_SORTABLE_FIELDS = [
  'createdAt',
  'updatedAt',
  'name',
  'priceCents',
  'stock',
] as const;

export type ProductSortableField = (typeof PRODUCT_SORTABLE_FIELDS)[number];

export const PRODUCT_SORT_OPTIONS: string[] = PRODUCT_SORTABLE_FIELDS.flatMap((field) => [
  `${field}:asc`,
  `${field}:desc`,
]);

export class QueryProductsDto extends PaginationQueryDto {
  @ApiPropertyOptional({
    description: 'Case-insensitive match against product name and description',
    example: 'headphones',
    maxLength: 200,
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  @Transform(trimText)
  search?: string;

  @ApiPropertyOptional({ format: 'uuid', description: 'Restrict to one category' })
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  @ApiPropertyOptional({
    description: 'field:direction',
    enum: PRODUCT_SORT_OPTIONS,
    default: 'createdAt:desc',
    example: 'priceCents:asc',
  })
  @IsOptional()
  @IsIn(PRODUCT_SORT_OPTIONS, {
    message: `sort must be one of: ${PRODUCT_SORT_OPTIONS.join(', ')}`,
  })
  sort?: string;

  @ApiPropertyOptional({
    description:
      'ADMIN only. Filter by publication state. Public callers always get published ' +
      'products regardless of this parameter.',
    example: true,
  })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  isActive?: boolean;
}
