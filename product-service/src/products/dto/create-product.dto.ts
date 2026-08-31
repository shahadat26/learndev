import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'ELEC-HEADPHONES-01', minLength: 3, maxLength: 64 })
  @IsString()
  @Length(3, 64)
  @Matches(/^[A-Z0-9][A-Z0-9-]*$/, {
    message: 'sku must be uppercase alphanumeric characters and hyphens',
  })
  sku!: string;

  @ApiProperty({ example: 'Aurora Wireless Headphones', minLength: 2, maxLength: 200 })
  @IsString()
  @Length(2, 200)
  name!: string;

  @ApiPropertyOptional({
    description: 'Lowercase URL segment. Derived from `name` when omitted.',
    example: 'aurora-wireless-headphones',
  })
  @IsOptional()
  @IsString()
  @Length(2, 200)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric words separated by single hyphens',
  })
  slug?: string;

  @ApiProperty({ example: 'Over-ear headphones with 40h battery life.', maxLength: 5000 })
  @IsString()
  @Length(1, 5000)
  description!: string;

  @ApiProperty({
    example: 18999,
    minimum: 0,
    description: 'Price in minor units (cents). 18999 means $189.99.',
  })
  @Type(() => Number)
  @IsInt({ message: 'priceCents must be an integer number of cents, never a decimal amount' })
  @Min(0)
  @Max(100_000_000)
  priceCents!: number;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO-4217 code' })
  currency?: string;

  @ApiPropertyOptional({ example: 42, minimum: 0, default: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  stock?: number;

  @ApiPropertyOptional({ example: 'https://picsum.photos/seed/aurora/600/600' })
  @IsOptional()
  @IsUrl({ require_tld: false })
  imageUrl?: string;

  @ApiPropertyOptional({ example: true, default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiProperty({ format: 'uuid', description: 'Must reference an existing category' })
  @IsUUID()
  categoryId!: string;
}
