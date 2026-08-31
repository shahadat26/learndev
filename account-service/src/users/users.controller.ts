import { Body, Controller, Get, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Role } from '@prisma/client';

import { ApiPaginatedResponse } from '../common/decorators/api-paginated-response.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { PaginatedResponseDto } from '../common/dto/paginated-response.dto';
import { PaginationQueryDto } from '../common/dto/pagination-query.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@ApiTags('users')
// Every route here needs a bearer token: the guard is global, and this only
// tells Swagger to send the Authorize header.
@ApiBearerAuth('access-token')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile')
  @ApiOperation({ summary: "Return the authenticated caller's profile" })
  @ApiResponse({ status: 200, description: 'The current user', type: UserResponseDto })
  // Errors leave through AllExceptionsFilter, so they all share one envelope;
  // naming it here is what puts that shape in the Swagger doc.
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    type: ErrorResponseDto,
  })
  findProfile(@CurrentUser('userId') userId: string): Promise<UserResponseDto> {
    // The id comes from the verified token, never from a path or query param,
    // so one user can never read another's profile through this route.
    return this.usersService.findProfile(userId);
  }

  @Patch('profile')
  @ApiOperation({ summary: "Update the authenticated caller's profile" })
  @ApiResponse({ status: 200, description: 'The updated user', type: UserResponseDto })
  @ApiResponse({ status: 400, description: 'Validation failed', type: ErrorResponseDto })
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    type: ErrorResponseDto,
  })
  updateProfile(
    @CurrentUser('userId') userId: string,
    @Body() dto: UpdateProfileDto,
  ): Promise<UserResponseDto> {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all users (admin only)' })
  @ApiPaginatedResponse(UserResponseDto, 'A page of users')
  @ApiResponse({
    status: 401,
    description: 'Missing or invalid access token',
    type: ErrorResponseDto,
  })
  @ApiResponse({ status: 403, description: 'Caller is not an ADMIN', type: ErrorResponseDto })
  findAll(@Query() pagination: PaginationQueryDto): Promise<PaginatedResponseDto<UserResponseDto>> {
    return this.usersService.findAll(pagination);
  }
}
