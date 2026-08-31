import { ApiProperty } from '@nestjs/swagger';

export class PaginationMetaDto {
  @ApiProperty({ example: 1 })
  page!: number;

  @ApiProperty({ example: 20 })
  limit!: number;

  @ApiProperty({ example: 42, description: 'Total rows matching the filter' })
  total!: number;

  @ApiProperty({ example: 3 })
  totalPages!: number;
}

/**
 * The one paginated envelope used by every list endpoint in the system:
 * `{ data: [...], meta: { page, limit, total, totalPages } }`
 */
export class PaginatedResponseDto<T> {
  @ApiProperty({ isArray: true, description: 'The rows for this page' })
  data!: T[];

  @ApiProperty({ type: PaginationMetaDto })
  meta!: PaginationMetaDto;

  /** Same name, same argument order as account-service: one envelope, one API. */
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
