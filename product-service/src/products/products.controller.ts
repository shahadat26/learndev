import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { Role } from '../common/enums/role.enum';
import { AuthenticatedUser } from '../common/interfaces/jwt-payload.interface';
import { CreateProductDto } from './dto/create-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { ProductEntity } from './entities/product.entity';
import { CatalogueScope, ProductsService } from './products.service';

/**
 * No `/api` prefix and no global prefix anywhere in this service: Traefik strips
 * `/api` before forwarding, so the container sees `/products` exactly as it is
 * mounted here. That keeps the service directly runnable (and testable) without
 * the proxy in front of it.
 */
@ApiTags('products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * The catalogue is public, so `user` is `undefined` for an ordinary visitor.
   * Only an ADMIN presenting a valid access token may see unpublished rows.
   */
  private static scopeFor(user: AuthenticatedUser | undefined): CatalogueScope {
    return { includeInactive: user?.role === Role.ADMIN };
  }

  @Public()
  @Get()
  @ApiOperation({
    summary: 'List products (public)',
    description:
      'Returns published products only. An ADMIN presenting a bearer token also sees ' +
      'unpublished ones and may filter them with `isActive`; for everyone else the ' +
      '`isActive` parameter is ignored.',
  })
  @ApiPaginatedResponse(ProductEntity, 'Paginated products')
  findAll(
    @Query() query: QueryProductsDto,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<PaginatedResponseDto<ProductEntity>> {
    return this.productsService.findAll(query, ProductsController.scopeFor(user));
  }

  @Public()
  @Get(':id')
  @ApiOperation({
    summary: 'Get one product by id (public)',
    description: 'An unpublished product is a 404 for everyone except an ADMIN.',
  })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProductEntity })
  @ApiNotFoundResponse({ type: ErrorResponseDto, description: 'No product with that id' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: AuthenticatedUser | undefined,
  ): Promise<ProductEntity> {
    return this.productsService.findOne(id, ProductsController.scopeFor(user));
  }

  @Roles(Role.ADMIN)
  @Post()
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Create a product (ADMIN)' })
  @ApiCreatedResponse({ type: ProductEntity })
  @ApiBadRequestResponse({ type: ErrorResponseDto, description: 'Validation or unknown category' })
  @ApiUnauthorizedResponse({ type: ErrorResponseDto })
  @ApiForbiddenResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Duplicate sku or slug' })
  create(@Body() dto: CreateProductDto): Promise<ProductEntity> {
    return this.productsService.create(dto);
  }

  @Roles(Role.ADMIN)
  @Patch(':id')
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Update a product (ADMIN)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiOkResponse({ type: ProductEntity })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  @ApiConflictResponse({ type: ErrorResponseDto, description: 'Duplicate sku or slug' })
  update(@Param('id') id: string, @Body() dto: UpdateProductDto): Promise<ProductEntity> {
    return this.productsService.update(id, dto);
  }

  @Roles(Role.ADMIN)
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Delete a product (ADMIN)' })
  @ApiParam({ name: 'id', format: 'uuid' })
  @ApiNoContentResponse({ description: 'Deleted' })
  @ApiNotFoundResponse({ type: ErrorResponseDto })
  remove(@Param('id') id: string): Promise<void> {
    return this.productsService.remove(id);
  }
}
