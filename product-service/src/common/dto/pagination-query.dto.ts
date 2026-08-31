import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Shared by both services so the frontend can paginate everything the same way. */
export class PaginationQueryDto {
  @ApiPropertyOptional({
    description: '1-based page number',
    minimum: 1,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page. Hard-capped so a client cannot ask for the whole table.',
    minimum: 1,
    maximum: 100,
    default: 20,
    example: 20,
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  /** Offset for Prisma's `skip`. */
  get skip(): number {
    return (this.page - 1) * this.limit;
  }
}
