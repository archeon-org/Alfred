import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource, IsNull, MoreThan } from 'typeorm';
import type { AuthPrincipal, AccessTokenPayload } from '../../../common/auth/auth-principal';
import { RefreshSessionEntity } from '../../auth/infrastructure/persistence/entities/refresh-session.entity';
import { UserEntity } from '../../users/user.entity';

@Injectable()
export class StreamAuthorityService {
  constructor(
    private readonly jwt: JwtService,
    private readonly dataSource: DataSource,
  ) {}

  async assert(principal: AuthPrincipal, authorization: string | undefined): Promise<number> {
    try {
      const [scheme, token, extra] = authorization?.split(' ') ?? [];
      if (scheme !== 'Bearer' || token === undefined || extra !== undefined) throw new Error();
      const payload = await this.jwt.verifyAsync<AccessTokenPayload & { exp?: number }>(token);
      if (
        payload.typ !== 'access' ||
        payload.sub !== principal.id ||
        payload.sid !== principal.sessionId ||
        typeof payload.exp !== 'number' ||
        !Number.isSafeInteger(payload.exp) ||
        payload.exp * 1000 <= Date.now()
      )
        throw new Error();
      const now = new Date();
      const [active, session] = await Promise.all([
        this.dataSource
          .getRepository(UserEntity)
          .exists({ where: { id: principal.id, status: 'active' } }),
        this.dataSource.getRepository(RefreshSessionEntity).exists({
          where: {
            id: principal.sessionId,
            userId: principal.id,
            revokedAt: IsNull(),
            expiresAt: MoreThan(now),
          },
        }),
      ]);
      if (!active || !session) throw new Error();
      return payload.exp * 1000;
    } catch {
      throw new UnauthorizedException('Stream authentication required');
    }
  }
}
