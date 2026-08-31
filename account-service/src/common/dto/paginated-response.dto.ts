import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1, description: '1-based page number that was returned' })
  page!: number;

  @ApiProperty({ example: 20, description: 'Items per page that was requested' })
  limit!: number;

  @ApiProperty({ example: 42, description: 'Total matching rows across all pages' })
  total!: number;

  @ApiProperty({ example: 3, description: 'Total number of pages at this page size' })
  totalPages!: number;
}

/**
 * The one paginated envelope used by both microservices:
 *   { "data": [...], "meta": { page, limit, total, totalPages } }
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true, description: 'The rows for this page' })
  data!: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;

  static create<T>(data: T[], page: number, limit: number, total: number): PaginatedResponseDto<T> {
    const response = new PaginatedResponseDto<T>();
    response.data = data;
    response.meta = {
      page,
      limit,
      total,
      totalPages: limit > 0 ? Math.ceil(total / limit) : 0,
    };
    return response;
  }
}
