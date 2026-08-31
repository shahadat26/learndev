import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { isPrismaKnownError, uniqueConstraintFields } from '../common/utils/prisma-error.util';
import { slugify } from '../common/utils/slug.util';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { CategoryEntity } from './entities/category.entity';

const WITH_PRODUCT_COUNT = { _count: { select: { products: true } } } as const;

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Categories are a small, bounded set (a handful of rows), so this returns a
   * plain array rather than the paginated envelope - it is a lookup list the
   * frontend renders in a filter dropdown.
   */
  async findAll(): Promise<CategoryEntity[]> {
    const categories = await this.prisma.category.findMany({
      orderBy: { name: 'asc' },
      include: WITH_PRODUCT_COUNT,
    });

    return CategoryEntity.fromEntities(categories);
  }

  async findOne(id: string): Promise<CategoryEntity> {
    const category = await this.prisma.category.findUnique({
      where: { id },
      include: WITH_PRODUCT_COUNT,
    });

    if (!category) {
      throw new NotFoundException(`Category with id "${id}" not found`);
    }

    return CategoryEntity.fromEntity(category);
  }

  async create(dto: CreateCategoryDto): Promise<CategoryEntity> {
    try {
      const category = await this.prisma.category.create({
        data: {
          name: dto.name,
          slug: dto.slug ?? slugify(dto.name),
          description: dto.description ?? null,
        },
        include: WITH_PRODUCT_COUNT,
      });

      return CategoryEntity.fromEntity(category);
    } catch (error) {
      if (isPrismaKnownError(error, 'P2002')) {
        throw new ConflictException(
          `A category with this ${uniqueConstraintFields(error)} already exists`,
        );
      }
      throw error;
    }
  }
}
