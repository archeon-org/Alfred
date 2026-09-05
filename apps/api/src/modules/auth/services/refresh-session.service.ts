import { randomUUID } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import type { AuthPrincipal } from '../../../common/auth/auth-principal';
import type { PublicUser } from '../../users/user.presenter';
import { toPublicUser } from '../../users/user.presenter';
import { UserEntity } from '../../users/user.entity';
import { RefreshSessionEntity } from '../entities/refresh-session.entity';
import { SessionTokenService } from './session-token.service';

export interface IssuedSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly user: PublicUser;
}

type RotationOutcome =
  | { readonly kind: 'invalid' | 'reused' }
  | {
      readonly accessToken: string;
      readonly kind: 'rotated';
      readonly refreshToken: string;
      readonly user: UserEntity;
    };

@Injectable()
export class RefreshSessionService {
  private readonly refreshTtlMs: number;

  constructor(
    private readonly dataSource: DataSource,
    private readonly tokens: SessionTokenService,
    config: ConfigService,
  ) {
    this.refreshTtlMs = config.getOrThrow<number>('AUTH_REFRESH_TOKEN_TTL_SECONDS') * 1000;
  }

  async create(user: UserEntity): Promise<IssuedSession> {
    const token = this.tokens.createRefreshToken();
    const sessionId = randomUUID();
    const accessToken = await this.tokens.issueAccessToken(this.toPrincipal(user, sessionId));
    const repository = this.dataSource.getRepository(RefreshSessionEntity);
    await repository.save(
      repository.create({
        expiresAt: new Date(Date.now() + this.refreshTtlMs),
        familyId: randomUUID(),
        id: sessionId,
        replacedBySessionId: null,
        revokedAt: null,
        rotatedAt: null,
        tokenHash: token.hash,
        userId: user.id,
      }),
    );

    return this.buildIssuedSession(user, accessToken, token.raw);
  }

  async rotate(rawToken: string): Promise<IssuedSession> {
    const nextToken = this.tokens.createRefreshToken();
    const tokenHash = this.tokens.hashRefreshToken(rawToken);
    const now = new Date();

    const outcome = await this.dataSource.transaction<RotationOutcome>(async (manager) => {
      const repository = manager.getRepository(RefreshSessionEntity);
      const current = await repository.findOne({
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      if (current === null) {
        return { kind: 'invalid' };
      }

      if (current.rotatedAt !== null) {
        await repository.update({ familyId: current.familyId }, { revokedAt: now });
        return { kind: 'reused' };
      }

      if (current.revokedAt !== null || current.expiresAt.getTime() <= now.getTime()) {
        return { kind: 'invalid' };
      }

      const user = await manager.getRepository(UserEntity).findOneBy({ id: current.userId });
      if (user === null || user.status !== 'active') return { kind: 'invalid' };

      const replacementId = randomUUID();
      const accessToken = await this.tokens.issueAccessToken(this.toPrincipal(user, replacementId));
      await repository.save(
        repository.create({
          expiresAt: new Date(now.getTime() + this.refreshTtlMs),
          familyId: current.familyId,
          id: replacementId,
          replacedBySessionId: null,
          revokedAt: null,
          rotatedAt: null,
          tokenHash: nextToken.hash,
          userId: current.userId,
        }),
      );
      await repository.update(
        { id: current.id },
        { replacedBySessionId: replacementId, rotatedAt: now },
      );

      return {
        accessToken,
        kind: 'rotated',
        refreshToken: nextToken.raw,
        user,
      };
    });

    if (outcome.kind !== 'rotated') {
      throw new UnauthorizedException(
        outcome.kind === 'reused' ? 'Refresh token reuse detected' : 'Invalid refresh session',
      );
    }
    return this.buildIssuedSession(outcome.user, outcome.accessToken, outcome.refreshToken);
  }

  async revoke(rawToken: string | undefined): Promise<void> {
    if (rawToken === undefined) return;
    const tokenHash = this.tokens.hashRefreshToken(rawToken);
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(RefreshSessionEntity);
      const session = await repository.findOne({
        select: { familyId: true, id: true },
        where: { tokenHash },
        lock: { mode: 'pessimistic_write' },
      });
      if (session !== null) {
        await repository.update({ familyId: session.familyId }, { revokedAt: new Date() });
      }
    });
  }

  private buildIssuedSession(
    user: UserEntity,
    accessToken: string,
    refreshToken: string,
  ): IssuedSession {
    return Object.freeze({
      accessToken,
      refreshToken,
      user: toPublicUser(user),
    });
  }

  private toPrincipal(user: UserEntity, sessionId: string): AuthPrincipal {
    return Object.freeze({
      email: user.email,
      id: user.id,
      role: user.role,
      sessionId,
    });
  }
}
