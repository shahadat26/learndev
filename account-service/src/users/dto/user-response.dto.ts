import { ApiProperty } from '@nestjs/swagger';
import { Role, type User } from '@prisma/client';
import { Exclude, Expose, plainToInstance } from 'class-transformer';

/**
 * The ONLY user shape that leaves this service.
 *
 * `@Exclude()` on the class plus `excludeExtraneousValues` in `fromEntity`
 * makes this an allow-list: a field is serialised only if it is explicitly
 * `@Expose()`d here. Add a column to the Prisma model tomorrow - a secret, a
 * TOTP seed, `isActive` - and it still cannot leak through the API by accident.
 * That is the whole reason we never hand a Prisma entity straight to the client.
 */
@Exclude()
export class UserResponseDto {
  @ApiProperty({ format: 'uuid', example: '7c9e6679-7425-40de-944b-e07fc1f90ae7' })
  @Expose()
  id!: string;

  @ApiProperty({ format: 'email', example: 'user@shop.local' })
  @Expose()
  email!: string;

  @ApiProperty({ type: String, nullable: true, example: 'Uma' })
  @Expose()
  firstName!: string | null;

  @ApiProperty({ type: String, nullable: true, example: 'User' })
  @Expose()
  lastName!: string | null;

  @ApiProperty({ enum: Role, enumName: 'Role', example: Role.USER })
  @Expose()
  role!: Role;

  @ApiProperty({ type: String, format: 'date-time' })
  @Expose()
  createdAt!: Date;

  @ApiProperty({ type: String, format: 'date-time' })
  @Expose()
  updatedAt!: Date;

  static fromEntity(user: User): UserResponseDto {
    return plainToInstance(UserResponseDto, user, { excludeExtraneousValues: true });
  }

  static fromEntities(users: User[]): UserResponseDto[] {
    return users.map((user) => UserResponseDto.fromEntity(user));
  }
}
