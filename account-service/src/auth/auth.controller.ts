import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { Public } from '../common/decorators/public.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import {
  THROTTLE_AUTH_IP_LIMIT,
  THROTTLE_REFRESH_IP_LIMIT,
  THROTTLE_WINDOW_MS,
} from '../common/throttling';
import { AuthService } from './auth.service';
import { AuthResponseDto, TokenPairDto } from './dto/auth-response.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RegisterDto } from './dto/register.dto';

// No global prefix: Traefik strips `/api` before forwarding, so the router rule
// `PathPrefix(/api/auth)` lands here as `/auth/...`.
//
// Every route below is public and every one of them does bcrypt work, so they
// are the service's most attackable surface: the per-IP limits here bound how
// much CPU one caller can burn, while the `credential` bucket configured in
// common/throttling.ts independently caps guesses against a single email.
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ ip: { limit: THROTTLE_AUTH_IP_LIMIT, ttl: THROTTLE_WINDOW_MS } })
  @Post('register')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create an account and return a token pair' })
  @ApiBody({ type: RegisterDto })
  @ApiResponse({ status: 201, description: 'Account created', type: AuthResponseDto })
  // Every failure below leaves through AllExceptionsFilter, so they all share
  // one envelope; naming it here is what puts that shape in the Swagger doc.
  @ApiResponse({ status: 400, description: 'Validation failed', type: ErrorResponseDto })
  @ApiResponse({ status: 409, description: 'Email already registered', type: ErrorResponseDto })
  @ApiResponse({
    status: 429,
    description: 'Too many attempts - retry after the window',
    type: ErrorResponseDto,
  })
  register(@Body() dto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ ip: { limit: THROTTLE_AUTH_IP_LIMIT, ttl: THROTTLE_WINDOW_MS } })
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Exchange credentials for a token pair' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Authenticated', type: AuthResponseDto })
  @ApiResponse({ status: 401, description: 'Invalid email or password', type: ErrorResponseDto })
  @ApiResponse({
    status: 429,
    description:
      'Too many attempts, either from this address or against this email address. ' +
      'See common/throttling.ts for the limits.',
    type: ErrorResponseDto,
  })
  login(@Body() dto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(dto);
  }

  @Public()
  @Throttle({ ip: { limit: THROTTLE_REFRESH_IP_LIMIT, ttl: THROTTLE_WINDOW_MS } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Rotate a refresh token',
    description:
      'Returns a new access/refresh pair and revokes the presented token. Presenting an ' +
      'already-rotated token revokes every session for that user.',
  })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 200, description: 'New token pair', type: TokenPairDto })
  @ApiResponse({
    status: 401,
    description: 'Invalid, expired or already-used refresh token',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 429,
    description: 'Too many attempts - retry after the window',
    type: ErrorResponseDto,
  })
  refresh(@Body() dto: RefreshTokenDto): Promise<TokenPairDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoke a refresh token (idempotent)' })
  @ApiBody({ type: RefreshTokenDto })
  @ApiResponse({ status: 204, description: 'Token revoked, or was already invalid' })
  logout(@Body() dto: RefreshTokenDto): Promise<void> {
    return this.authService.logout(dto.refreshToken);
  }
}
