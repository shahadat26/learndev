import { createHash, randomUUID } from 'node:crypto';

import {
  ConflictException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Prisma, type User } from '@prisma/client';
import { compare, hash } from 'bcryptjs';

import { type AppConfiguration, type JwtConfiguration } from '../config/configuration';
import { PrismaService } from '../prisma/prisma.service';
import { UserResponseDto } from '../users/dto/user-response.dto';
import { type AuthResponseDto, type TokenPairDto } from './dto/auth-response.dto';
import { type LoginDto } from './dto/login.dto';
import { type RegisterDto } from './dto/register.dto';
import { type AccessTokenPayload, type RefreshTokenPayload } from './types/jwt-payload.type';

/**
 * One message for every authentication failure. Saying "no such user" versus
 * "wrong password" hands an attacker a free user-enumeration oracle.
 */
const INVALID_CREDENTIALS = 'Invalid email or password';
const INVALID_REFRESH_TOKEN = 'Invalid or expired refresh token';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly jwtConfig: JwtConfiguration;
  private readonly saltRounds: number;
  private dummyHash?: Promise<string>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    configService: ConfigService<AppConfiguration, true>,
  ) {
    this.jwtConfig = configService.get('jwt', { infer: true });
    this.saltRounds = configService.get('bcryptSaltRounds', { infer: true });
  }

  async register(dto: RegisterDto): Promise<AuthResponseDto> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (existing) {
      throw new ConflictException('An account with this email already exists');
    }

    const password = await hash(dto.password, this.saltRounds);

    let user: User;
    try {
      user = await this.prisma.user.create({
        data: {
          email: dto.email,
          password,
          firstName: dto.firstName ?? null,
          lastName: dto.lastName ?? null,
        },
      });
    } catch (error) {
      // Two simultaneous registrations can both pass the check above; the
      // unique index is the real guarantee, so translate its violation too.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException('An account with this email already exists');
      }
      throw error;
    }

    const tokens = await this.issueTokens(user);
    return { user: UserResponseDto.fromEntity(user), ...tokens };
  }

  async login(dto: LoginDto): Promise<AuthResponseDto> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    // Always spend the same bcrypt work, even for an unknown email. Returning
    // early would make "no such user" measurably faster than "wrong password".
    const passwordMatches = user
      ? await compare(dto.password, user.password)
      : await compare(dto.password, await this.getDummyHash());

    if (!user || !passwordMatches) {
      throw new UnauthorizedException(INVALID_CREDENTIALS);
    }

    if (!user.isActive) {
      // Only reachable after a correct password, so this leaks nothing about
      // which emails exist.
      throw new UnauthorizedException('This account has been deactivated');
    }

    const tokens = await this.issueTokens(user);
    return { user: UserResponseDto.fromEntity(user), ...tokens };
  }

  /**
   * Refresh-token rotation: every successful refresh revokes the presented
   * token and issues a brand new one. A refresh token is therefore single-use,
   * which bounds the damage of a stolen token to a single request.
   */
  async refresh(refreshToken: string): Promise<TokenPairDto> {
    const payload = await this.verifyRefreshToken(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({
      where: { jti: payload.jti },
      include: { user: true },
    });

    if (!stored) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    if (stored.revokedAt) {
      // Reuse of an already-rotated token. Either it leaked and an attacker is
      // replaying it, or the legitimate client replayed it - we cannot tell
      // them apart, so we revoke the whole family and force a fresh login.
      await this.revokeAllTokensForUser(stored.userId);
      this.logger.warn(
        `Refresh token reuse detected for user ${stored.userId}; revoked all sessions`,
      );
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    if (stored.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    const matchesStoredHash = await compare(this.digest(refreshToken), stored.tokenHash);
    if (!matchesStoredHash) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    if (!stored.user.isActive) {
      throw new UnauthorizedException('This account has been deactivated');
    }

    return this.issueTokens(stored.user, stored.id);
  }

  /**
   * Logout is idempotent: an unknown, malformed or already-revoked token still
   * returns 204. A client that is trying to end its session should never be
   * left holding a live one because of an error response.
   */
  async logout(refreshToken: string): Promise<void> {
    let payload: RefreshTokenPayload;
    try {
      payload = await this.verifyRefreshToken(refreshToken);
    } catch {
      return;
    }

    await this.prisma.refreshToken.updateMany({
      where: { jti: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * Signs an access/refresh pair and persists the refresh token's hash.
   * When `replacesTokenId` is given, the old row is revoked in the same
   * transaction, so we can never end up with two live tokens or none.
   */
  private async issueTokens(user: User, replacesTokenId?: string): Promise<TokenPairDto> {
    const accessPayload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      type: 'access',
    };

    const accessToken = await this.jwtService.signAsync(accessPayload, {
      secret: this.jwtConfig.accessSecret,
      expiresIn: this.jwtConfig.accessTtl,
    });

    const jti = randomUUID();
    const refreshPayload: RefreshTokenPayload = { sub: user.id, jti, type: 'refresh' };

    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.jwtConfig.refreshSecret,
      expiresIn: this.jwtConfig.refreshTtl,
    });

    // Store only a hash. If account_db leaks, the rows cannot be replayed as
    // sessions - exactly the reasoning behind hashing passwords.
    const tokenHash = await hash(this.digest(refreshToken), this.saltRounds);

    const createRow = this.prisma.refreshToken.create({
      data: { jti, tokenHash, userId: user.id, expiresAt: this.expiryOf(refreshToken) },
    });

    if (replacesTokenId) {
      await this.prisma.$transaction([
        this.prisma.refreshToken.update({
          where: { id: replacesTokenId },
          data: { revokedAt: new Date() },
        }),
        createRow,
      ]);
    } else {
      await createRow;
    }

    return { accessToken, refreshToken };
  }

  private async verifyRefreshToken(token: string): Promise<RefreshTokenPayload> {
    let payload: RefreshTokenPayload;

    try {
      payload = await this.jwtService.verifyAsync<RefreshTokenPayload>(token, {
        secret: this.jwtConfig.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    // A token signed with the refresh secret but carrying the wrong `type` must
    // not be usable here either.
    if (payload.type !== 'refresh' || !payload.jti || !payload.sub) {
      throw new UnauthorizedException(INVALID_REFRESH_TOKEN);
    }

    return payload;
  }

  private async revokeAllTokensForUser(userId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * bcrypt silently ignores everything past the first 72 bytes of its input,
   * and a JWT is much longer than that. Digesting to a fixed-length hex string
   * first means the whole token really is covered by the stored hash.
   */
  private digest(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  /** Mirrors the JWT's own `exp` claim so the row expires with the token. */
  private expiryOf(token: string): Date {
    const decoded = this.jwtService.decode<{ exp?: number } | null>(token);

    if (!decoded?.exp) {
      throw new InternalServerErrorException('Signed refresh token has no exp claim');
    }

    return new Date(decoded.exp * 1000);
  }

  /** Computed once, lazily, at the configured cost so timings line up. */
  private getDummyHash(): Promise<string> {
    this.dummyHash ??= hash('not-a-real-password', this.saltRounds);
    return this.dummyHash;
  }
}
