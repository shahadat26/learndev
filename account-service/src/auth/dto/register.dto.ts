import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const normaliseEmail = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim().toLowerCase() : value;

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === 'string' ? value.trim() : value;

export class RegisterDto {
  @ApiProperty({ format: 'email', example: 'user@shop.local', maxLength: 255 })
  // Emails are stored lower-cased so "User@Shop.local" cannot become a second
  // account for the same person and defeat the unique index.
  @Transform(normaliseEmail)
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({
    example: 'User123!',
    minLength: 8,
    maxLength: 72,
    description: 'At least 8 characters, containing at least one letter and one number',
  })
  @IsString()
  @MinLength(8)
  // 72 bytes is bcrypt's hard input limit; anything beyond it is silently
  // ignored by the algorithm, so reject it rather than pretend it counted.
  @MaxLength(72)
  @Matches(/^(?=.*[A-Za-z])(?=.*\d).+$/, {
    message: 'password must contain at least one letter and one number',
  })
  password!: string;

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
