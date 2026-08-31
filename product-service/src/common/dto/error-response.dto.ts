import { ApiProperty } from '@nestjs/swagger';

/** Documents the single error shape produced by AllExceptionsFilter. */
export class ErrorResponseDto {
  @ApiProperty({ example: 404 })
  statusCode!: number;

  @ApiProperty({
    description: 'A message, or the list of class-validator messages for a 400.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Product not found',
  })
  message!: string | string[];

  @ApiProperty({ example: 'Not Found' })
  error!: string;

  @ApiProperty({ example: '2026-01-01T12:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/products/does-not-exist' })
  path!: string;
}
