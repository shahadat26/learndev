import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsOptional, IsString, MaxLength } from 'class-validator';

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

/**
 * Note what is absent: no `role`, no `email`, no `isActive`. With the global
 * ValidationPipe running `forbidNonWhitelisted`, a request trying to smuggle
 * `"role": "ADMIN"` in here is rejected with a 400 rather than quietly ignored.
 */
export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Uma', maxLength: 50 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  firstName?: string;

  @ApiPropertyOptional({ example: 'User', maxLength: 50 })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(50)
  lastName?: string;
}
