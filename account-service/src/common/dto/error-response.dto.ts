import { ApiProperty } from '@nestjs/swagger';

/** Documents the single error shape produced by AllExceptionsFilter. */
export class ErrorResponseDto {
  @ApiProperty({ example: 401 })
  statusCode!: number;

  @ApiProperty({
    description: 'A message, or the list of class-validator messages for a 400.',
    oneOf: [{ type: 'string' }, { type: 'array', items: { type: 'string' } }],
    example: 'Invalid email or password',
  })
  message!: string | string[];

  @ApiProperty({ example: 'Unauthorized' })
  error!: string;

  @ApiProperty({ example: '2026-01-01T12:00:00.000Z' })
  timestamp!: string;

  @ApiProperty({ example: '/auth/login' })
  path!: string;
}
