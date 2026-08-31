import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { type PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { PrismaService } from '../prisma/prisma.service';
import { type UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findProfile(userId: string): Promise<UserResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      // The token verified, but its subject is gone (deleted account). The
      // credential is no longer valid, so 401 rather than 404.
      throw new UnauthorizedException('This account no longer exists');
    }

    return UserResponseDto.fromEntity(user);
  }

  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserResponseDto> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          // Only assign keys the caller actually sent, so omitting a field
          // leaves it alone instead of nulling it.
          ...(dto.firstName !== undefined && { firstName: dto.firstName }),
          ...(dto.lastName !== undefined && { lastName: dto.lastName }),
        },
      });

      return UserResponseDto.fromEntity(user);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new UnauthorizedException('This account no longer exists');
      }
      throw error;
    }
  }

  async findAll(pagination: PaginationQueryDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    const { page, limit, skip } = pagination;

    // One round trip for both queries: the count and the page must describe the
    // same snapshot, or the pagination controls flicker under concurrent writes.
    const [total, users] = await this.prisma.$transaction([
      this.prisma.user.count(),
      this.prisma.user.findMany({
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return PaginatedResponseDto.create(UserResponseDto.fromEntities(users), page, limit, total);
  }
}
