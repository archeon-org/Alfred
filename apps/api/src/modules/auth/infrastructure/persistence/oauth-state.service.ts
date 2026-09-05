import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, LessThanOrEqual } from 'typeorm';
import type { OauthStateInput, OauthStatePort } from '../../domain/ports/oauth-state.port';
import { OauthLoginStateEntity } from './entities/oauth-login-state.entity';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class OauthStateService implements OauthStatePort {
  constructor(private readonly dataSource: DataSource) {}

  async create(input: OauthStateInput): Promise<string> {
    const rawState = randomBytes(32).toString('base64url');
    const repository = this.dataSource.getRepository(OauthLoginStateEntity);
    await repository.delete({ expiresAt: LessThanOrEqual(new Date()) });
    await repository.save(
      repository.create({
        consumedAt: null,
        expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
        providerContext: input.providerContext,
        providerKey: input.providerKey,
        returnTo: input.returnTo,
        stateHash: this.hash(rawState),
      }),
    );
    return rawState;
  }

  async consume(
    providerKey: string,
    queryState: string,
    cookieState: string | undefined,
  ): Promise<OauthLoginStateEntity> {
    if (cookieState === undefined || !this.sameValue(queryState, cookieState)) {
      throw new UnauthorizedException('Invalid OAuth state');
    }

    const stateHash = this.hash(queryState);
    const outcome = await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(OauthLoginStateEntity);
      const consumedAt = new Date();
      const state = await repository.findOne({
        where: { stateHash },
        lock: { mode: 'pessimistic_write' },
      });
      if (state === null || state.expiresAt.getTime() <= consumedAt.getTime()) {
        if (state !== null) await repository.delete({ stateHash });
        return null;
      }

      if (state.consumedAt !== null) return null;
      if (state.providerKey !== providerKey) {
        throw new UnauthorizedException('OAuth state does not match the provider');
      }

      await repository.update({ stateHash }, { consumedAt });
      return Object.freeze({ ...state, consumedAt });
    });

    if (outcome === null) throw new UnauthorizedException('Expired or reused OAuth state');
    return outcome;
  }

  private hash(value: string): string {
    return createHash('sha256').update(value, 'utf8').digest('hex');
  }

  private sameValue(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
  }
}
