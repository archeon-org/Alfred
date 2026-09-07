import { randomUUID } from 'node:crypto';
import type { INestApplication } from '@nestjs/common';
import { RequestValidationPipe } from '@api/common/validation/request-validation.pipe';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { firstValueFrom, from, timeout } from 'rxjs';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AccessTokenGuard } from '@api/common/guards/access-token.guard';
import { ApiExceptionFilter } from '@api/common/filters/api-exception.filter';
import { IdempotencyModule } from '@api/common/idempotency/idempotency.module';
import { IdempotencyStore } from '@api/common/idempotency/idempotency.store';
import { IdempotencyCleanupService } from '@api/common/idempotency/idempotency-cleanup.service';
import { IdempotencyKeyEntity } from '@api/common/idempotency/idempotency-key.entity';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { UserEntity } from '@api/modules/users/user.entity';
import {
  FixtureWriter,
  IdempotencyFixtureController,
  fixtureUrl,
} from '../../../support/idempotency-fixture';

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationDatabaseUrl = process.env.TEST_MIGRATION_DATABASE_URL;
if (
  process.env.REQUIRE_DATABASE_E2E === 'true' &&
  (!databaseUrl || !migrationDatabaseUrl || !process.env.TEST_DATABASE_ADMIN_URL)
) {
  throw new Error(
    'REQUIRE_DATABASE_E2E=true requires TEST_DATABASE_URL, TEST_MIGRATION_DATABASE_URL and TEST_DATABASE_ADMIN_URL',
  );
}
const postgres = databaseUrl && migrationDatabaseUrl ? describe : describe.skip;

// Run sequentially with other DB suites: migrations and their historical global cleanup share public.
postgres('idempotency PostgreSQL and HTTP contract', () => {
  let migration: DataSource;
  let db: DataSource;
  let app: INestApplication;
  let url: string;
  let owner: string;
  let secondOwner: string;
  let token: string;
  let secondToken: string;
  const ownedUserIds = new Set<string>();
  const businessIds = new Set<string>();
  const write = vi.fn<(name: string) => Promise<unknown>>();

  async function user(name: string): Promise<string> {
    const id = randomUUID();
    ownedUserIds.add(id);
    await db
      .getRepository(UserEntity)
      .insert({ id, email: `${id}@example.test`, displayName: name });
    return id;
  }

  beforeAll(async () => {
    migration = new DataSource({
      type: 'postgres',
      url: migrationDatabaseUrl!,
      entities: [...databaseEntities],
      migrations: [...databaseMigrations],
      installExtensions: false,
      synchronize: false,
      migrationsRun: false,
    });
    await migration.initialize();
    await migration.runMigrations({ transaction: 'each' });
    const module = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: databaseUrl!,
          entities: [...databaseEntities],
          installExtensions: false,
          synchronize: false,
          migrationsRun: false,
          retryAttempts: 0,
        }),
        JwtModule.register({ secret: 'test-only-postgres-idempotency-secret' }),
        IdempotencyModule,
      ],
      controllers: [IdempotencyFixtureController],
      providers: [
        { provide: FixtureWriter, useValue: { write } },
        { provide: APP_FILTER, useClass: ApiExceptionFilter },
        { provide: APP_GUARD, useClass: AccessTokenGuard },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    app.useGlobalPipes(new RequestValidationPipe());
    db = app.get(DataSource);
    url = await fixtureUrl(app);
  });

  beforeEach(async () => {
    owner = await user('Idempotency owner');
    secondOwner = await user('Second idempotency owner');
    const jwt = app.get(JwtService);
    token = jwt.sign({
      sub: owner,
      sid: randomUUID(),
      typ: 'access',
      role: 'user',
      email: 'fixture@example.test',
    });
    secondToken = jwt.sign({
      sub: secondOwner,
      sid: randomUUID(),
      typ: 'access',
      role: 'user',
      email: 'fixture@example.test',
    });
    businessIds.clear();
    write.mockReset().mockImplementation(async (name) => {
      const id = await user(name);
      businessIds.add(id);
      return { id, name };
    });
  });

  afterAll(async () => {
    if (db?.isInitialized) {
      for (const id of ownedUserIds) await db.getRepository(UserEntity).delete(id);
    }
    await app?.close();
    if (migration?.isInitialized) await migration.destroy();
  });

  const post = (key = 'key', name: unknown = 'created', bearer = token, path = '') =>
    fetch(`${url}${path}`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${bearer}`,
        'idempotency-key': key,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ name }),
    });

  it('migrates the exact entity schema including composite PK, checks, index and cascading owner FK', async () => {
    const runner = migration.createQueryRunner();
    const table = await runner.getTable('idempotency_keys');
    await runner.release();
    expect(table?.primaryColumns.map(({ name }) => name).sort()).toEqual(['key', 'owner_user_id']);
    expect(table?.indices.map(({ name }) => name)).toContain('idx_idempotency_keys_expiry');
    expect(table?.checks.map(({ name }) => name).sort()).toEqual([
      'chk_idempotency_keys_hash',
      'chk_idempotency_keys_key',
      'chk_idempotency_keys_response',
    ]);
    expect(table?.foreignKeys[0]).toMatchObject({
      name: 'fk_idempotency_keys_owner',
      onDelete: 'CASCADE',
      referencedTableName: 'users',
    });
    const drift = await migration.driver.createSchemaBuilder().log();
    expect(drift.upQueries.map(({ query }) => query)).toEqual([]);
  });

  it('replays three real HTTP requests with exactly one persisted business row', async () => {
    const responses = [await post(), await post(), await post()];
    expect(responses.map(({ status }) => status)).toEqual([201, 201, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(write).toHaveBeenCalledOnce();
    expect(businessIds.size).toBe(1);
    const id = [...businessIds][0]!;
    expect(await db.getRepository(UserEntity).countBy({ id })).toBe(1);
    expect(await db.getRepository(IdempotencyKeyEntity).countBy({ ownerUserId: owner })).toBe(1);
  });

  it('allows invalid DTO retries and a corrected body under the same key without business effects', async () => {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const invalid = await post('validation', 42);
      expect(invalid.status).toBe(400);
      expect(await invalid.json()).toMatchObject({
        error: { code: 'HTTP_400', message: ['name must be a string'] },
      });
      expect(write).not.toHaveBeenCalled();
      expect(await app.get(IdempotencyStore).find(owner, 'validation')).toBeNull();
    }
    const created = await post('validation', 'corrected');
    expect(created.status).toBe(201);
    const replay = await post('validation', 'corrected');
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(await created.json());
    expect(write).toHaveBeenCalledOnce();
  });

  it('keeps an already waiting invalid contender bounded while validation releases its reservation', async () => {
    const gate = () => {
      let resolve!: () => void;
      const promise = new Promise<void>((done) => {
        resolve = done;
      });
      return { promise, resolve };
    };
    const cleanupEntered = gate();
    const cleanupAllowed = gate();
    const contenderEntered = gate();
    const store = app.get(IdempotencyStore);
    const release = store.release.bind(store);
    const find = store.find.bind(store);
    const releaseSpy = vi.spyOn(store, 'release').mockImplementation(async (...args) => {
      cleanupEntered.resolve();
      await cleanupAllowed.promise;
      return release(...args);
    });
    const findSpy = vi.spyOn(store, 'find').mockImplementation((...args) => {
      contenderEntered.resolve();
      return find(...args);
    });
    try {
      const invalid = post('concurrent-validation', 42);
      await firstValueFrom(from(cleanupEntered.promise).pipe(timeout(2_000)));
      const contender = post('concurrent-validation', 42);
      await firstValueFrom(from(contenderEntered.promise).pipe(timeout(2_000)));
      cleanupAllowed.resolve();
      expect((await invalid).status).toBe(400);
      expect((await contender).status).toBe(409);
      expect(write).not.toHaveBeenCalled();
      expect(await find(owner, 'concurrent-validation')).toBeNull();
      expect((await post('concurrent-validation', 'corrected')).status).toBe(201);
      expect((await post('concurrent-validation', 'corrected')).status).toBe(201);
      expect(write).toHaveBeenCalledOnce();
    } finally {
      cleanupAllowed.resolve();
      releaseSpy.mockRestore();
      findSpy.mockRestore();
    }
  });

  it('rejects a valid JWT for a deleted owner before the business handler', async () => {
    await db.getRepository(UserEntity).delete(owner);
    const response = await post();
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      error: { code: 'HTTP_401', message: 'Authentication required' },
    });
    expect(write).not.toHaveBeenCalled();
    expect(await app.get(IdempotencyStore).find(owner, 'key')).toBeNull();
  });

  it('isolates owners and returns mismatch without another business write', async () => {
    await post();
    const mismatch = await post('key', 'different');
    expect(mismatch.status).toBe(422);
    expect(await mismatch.json()).toMatchObject({ error: { code: 'idempotency_mismatch' } });
    expect((await post('key', 'different', secondToken)).status).toBe(201);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('uses PostgreSQL conflict arbitration for simultaneous HTTP requests', async () => {
    write.mockImplementation(async (name) => {
      const id = await user(name);
      businessIds.add(id);
      await new Promise((resolve) => setTimeout(resolve, 150));
      return { id, name };
    });
    const responses = await Promise.all([post(), post(), post()]);
    expect(responses.map(({ status }) => status)).toEqual([201, 201, 201]);
    const bodies = await Promise.all(responses.map((response) => response.json()));
    expect(bodies[1]).toEqual(bodies[0]);
    expect(bodies[2]).toEqual(bodies[0]);
    expect(write).toHaveBeenCalledOnce();
    expect(businessIds.size).toBe(1);
  });

  it('retains a reservation after a real business commit followed by response-storage failure', async () => {
    const failure = vi
      .spyOn(app.get(IdempotencyStore), 'complete')
      .mockRejectedValueOnce(new Error('simulated response persistence failure'));
    expect((await post()).status).toBe(500);
    failure.mockRestore();
    expect(businessIds.size).toBe(1);
    const second = await post();
    expect(second.status).toBe(409);
    expect(await second.json()).toMatchObject({ error: { code: 'idempotency_in_progress' } });
    expect(write).toHaveBeenCalledOnce();
    const saved = await db
      .getRepository(IdempotencyKeyEntity)
      .findOneByOrFail({ ownerUserId: owner, key: 'key' });
    expect(saved.responseStatus).toBeNull();
    expect(saved.expiresAt.getTime() - saved.createdAt.getTime()).toBe(86_400_000);
  });

  it('retains uncertainty before expiry, purges all expired entries and allows key reuse', async () => {
    const store = app.get(IdempotencyStore);
    await post();
    await store.reserve(owner, 'uncertain', 'a'.repeat(64), randomUUID());
    await app.get(IdempotencyCleanupService).purge();
    expect(await store.find(owner, 'uncertain')).toMatchObject({ responseStatus: null });
    await db.query(
      `UPDATE idempotency_keys SET created_at = created_at - interval '25 hours', expires_at = expires_at - interval '25 hours' WHERE owner_user_id = $1`,
      [owner],
    );
    await app.get(IdempotencyCleanupService).purge();
    expect(await store.find(owner, 'key')).toBeNull();
    expect(await store.find(owner, 'uncertain')).toBeNull();
    expect((await post()).status).toBe(201);
    expect(write).toHaveBeenCalledTimes(2);
  });

  it('replays JSON-null 204 responses and cascades on owner deletion', async () => {
    expect((await post('empty', 'created', token, '/empty')).status).toBe(204);
    const replay = await post('empty', 'created', token, '/empty');
    expect(replay.status).toBe(204);
    expect(await replay.text()).toBe('');
    expect(write).toHaveBeenCalledOnce();
    await db.getRepository(UserEntity).delete(owner);
    expect(await db.getRepository(IdempotencyKeyEntity).countBy({ ownerUserId: owner })).toBe(0);
  });

  it('fences a late completion after the same key/hash is reserved again', async () => {
    const store = app.get(IdempotencyStore);
    const oldGeneration = randomUUID();
    const newGeneration = randomUUID();
    const hash = 'a'.repeat(64);
    await store.reserve(owner, 'key', hash, oldGeneration);
    await db.query(
      `UPDATE idempotency_keys SET created_at = created_at - interval '25 hours', expires_at = expires_at - interval '25 hours' WHERE owner_user_id = $1`,
      [owner],
    );
    await expect(
      store.complete(owner, 'key', hash, 201, { old: true }, oldGeneration),
    ).rejects.toThrow();
    await expect(store.reserve(owner, 'key', hash, newGeneration)).resolves.toBe(true);
    await expect(
      store.complete(owner, 'key', hash, 201, { old: true }, oldGeneration),
    ).rejects.toThrow();
    await expect(store.find(owner, 'key')).resolves.toMatchObject({ responseStatus: null });
    await store.complete(owner, 'key', hash, 201, { new: true }, newGeneration);
    await expect(store.find(owner, 'key')).resolves.toMatchObject({ responseBody: { new: true } });
  });

  it('releases only its own pending reservation and protects completed or replaced generations', async () => {
    const store = app.get(IdempotencyStore);
    const hash = 'a'.repeat(64);
    const first = randomUUID();
    const second = randomUUID();
    await store.reserve(owner, 'key', hash, first);
    await store.release(owner, 'key', hash, second);
    await store.release(secondOwner, 'key', hash, first);
    await store.release(owner, 'key', 'b'.repeat(64), first);
    expect(await store.find(owner, 'key')).not.toBeNull();
    await store.release(owner, 'key', hash, first);
    expect(await store.find(owner, 'key')).toBeNull();
    await store.reserve(owner, 'key', hash, second);
    await store.release(owner, 'key', hash, first);
    expect(await store.find(owner, 'key')).not.toBeNull();
    await store.complete(owner, 'key', hash, 201, { saved: true }, second);
    await store.release(owner, 'key', hash, second);
    expect(await store.find(owner, 'key')).toMatchObject({ responseBody: { saved: true } });
  });

  it('enforces checks and ownership constraints at the database boundary', async () => {
    const store = app.get(IdempotencyStore);
    await expect(
      store.reserve(owner, 'invalid key', 'a'.repeat(64), randomUUID()),
    ).rejects.toThrow();
    await expect(store.reserve(owner, 'key', 'invalid-hash', randomUUID())).rejects.toThrow();
    await expect(
      store.reserve(randomUUID(), 'key', 'a'.repeat(64), randomUUID()),
    ).rejects.toThrow();
    const reservationId = randomUUID();
    await store.reserve(owner, 'key', 'a'.repeat(64), reservationId);
    await expect(
      store.complete(owner, 'key', 'a'.repeat(64), 500, {}, reservationId),
    ).rejects.toThrow();
    await expect(
      db.query(`UPDATE idempotency_keys SET expires_at = now() WHERE owner_user_id = $1`, [owner]),
    ).rejects.toThrow();
  });
});
