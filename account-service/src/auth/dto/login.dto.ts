import { ApiProperty } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ format: 'email', example: 'admin@shop.local' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail({}, { message: 'email must be a valid email address' })
  @MaxLength(255)
  email!: string;

  @ApiProperty({ example: 'Admin123!' })
  // No strength rules on login: the stored password was validated at
  // registration, and echoing the policy back here only helps an attacker.
  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;
}
