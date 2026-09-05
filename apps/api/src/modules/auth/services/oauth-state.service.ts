import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { DataSource, LessThanOrEqual } from 'typeorm';
import { OauthLoginStateEntity } from '../entities/oauth-login-state.entity';

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export interface OauthStateInput {
  readonly codeVerifier: string;
  readonly nonce: string;
  readonly returnTo: string;
}

@Injectable()
export class OauthStateService {
  constructor(private readonly dataSource: DataSource) {}

  async create(input: OauthStateInput): Promise<string> {
    const rawState = randomBytes(32).toString('base64url');
    const repository = this.dataSource.getRepository(OauthLoginStateEntity);
    await repository.delete({ expiresAt: LessThanOrEqual(new Date()) });
    await repository.save(
      repository.create({
        codeVerifier: input.codeVerifier,
        consumedAt: null,
        expiresAt: new Date(Date.now() + OAUTH_STATE_TTL_MS),
        nonce: input.nonce,
        returnTo: input.returnTo,
        stateHash: this.hash(rawState),
      }),
    );
    return rawState;
  }

  async consume(
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
