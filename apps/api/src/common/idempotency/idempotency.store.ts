import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { IdempotencyKeyEntity } from './idempotency-key.entity';

export interface StoredResponse {
  readonly requestHash: string;
  readonly responseStatus: number | null;
  readonly responseBody: unknown;
}

@Injectable()
export class IdempotencyStore {
  constructor(
    @InjectRepository(IdempotencyKeyEntity) private readonly keys: Repository<IdempotencyKeyEntity>,
  ) {}

  async reserve(owner: string, key: string, hash: string, reservationId: string): Promise<boolean> {
    // Keep uncertainty for the full 24h deduplication window; only expired keys can be reused.
    await this.keys.query(
      'DELETE FROM "idempotency_keys" WHERE "owner_user_id" = $1 AND "key" = $2 AND "expires_at" < now()',
      [owner, key],
    );
    const inserted = await this.keys.query<{ key: string }[]>(
      `
      INSERT INTO "idempotency_keys" ("owner_user_id", "key", "request_hash", "reservation_id")
      VALUES ($1, $2, $3, $4) ON CONFLICT ("owner_user_id", "key") DO NOTHING RETURNING "key"
    `,
      [owner, key, hash, reservationId],
    );
    return inserted.length === 1;
  }

  async find(owner: string, key: string): Promise<StoredResponse | null> {
    const rows = await this.keys.query<StoredResponse[]>(
      `
      SELECT "request_hash" AS "requestHash", "response_status" AS "responseStatus", "response_body" AS "responseBody"
      FROM "idempotency_keys" WHERE "owner_user_id" = $1 AND "key" = $2
    `,
      [owner, key],
    );
    return rows[0] ?? null;
  }

  async complete(
    owner: string,
    key: string,
    hash: string,
    status: number,
    body: unknown,
    reservationId: string,
  ): Promise<void> {
    const rows = await this.keys.query<{ key: string }[]>(
      `
      WITH completed AS (UPDATE "idempotency_keys" SET "response_status" = $4, "response_body" = $5::jsonb,
        "expires_at" = "created_at" + interval '24 hours'
      WHERE "owner_user_id" = $1 AND "key" = $2 AND "request_hash" = $3 AND "response_status" IS NULL
        AND "reservation_id" = $6 AND "expires_at" >= now()
      RETURNING "key") SELECT "key" FROM completed
    `,
      [owner, key, hash, status, JSON.stringify(body), reservationId],
    );
    if (rows.length !== 1) throw new Error('Idempotency response could not be persisted');
  }
}
