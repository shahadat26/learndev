import { ApiProperty } from '@nestjs/swagger';

import { UserResponseDto } from '../../users/dto/user-response.dto';

/** Returned by /auth/refresh. */
export class TokenPairDto {
  @ApiProperty({
    description: 'Short-lived HS256 access token (JWT_ACCESS_TTL)',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  accessToken!: string;

  @ApiProperty({
    description: 'Long-lived HS256 refresh token (JWT_REFRESH_TTL). Rotated on every use.',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  refreshToken!: string;
}

/** Returned by /auth/register and /auth/login. */
export class AuthResponseDto extends TokenPairDto {
  @ApiProperty({ type: UserResponseDto })
  user!: UserResponseDto;
}
