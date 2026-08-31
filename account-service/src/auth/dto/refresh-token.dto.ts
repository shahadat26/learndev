import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description:
      'The refresh token issued by /auth/login, /auth/register or a previous /auth/refresh',
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
  })
  // Only checked for presence: a malformed token is an authentication failure
  // (401), not a validation failure (400), and the service decides that.
  @IsString()
  @IsNotEmpty()
  refreshToken!: string;
}
