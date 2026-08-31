import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, Length, Matches, MaxLength } from 'class-validator';

export class CreateCategoryDto {
  @ApiProperty({ example: 'Electronics', minLength: 2, maxLength: 80 })
  @IsString()
  @Length(2, 80)
  name!: string;

  @ApiPropertyOptional({
    description: 'Lowercase URL segment. Derived from `name` when omitted.',
    example: 'electronics',
    maxLength: 80,
  })
  @IsOptional()
  @IsString()
  @Length(2, 80)
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, {
    message: 'slug must be lowercase alphanumeric words separated by single hyphens',
  })
  slug?: string;

  @ApiPropertyOptional({ example: 'Gadgets, audio and computing gear', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
