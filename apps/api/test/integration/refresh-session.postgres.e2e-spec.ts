import { createHash, randomUUID } from 'node:crypto';
import type { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateIdentityFoundation1788464265141 } from '../../src/database/migrations/1788464265141-create-identity-foundation';
import { databaseEntities } from '../../src/database/typeorm.options';
import { RefreshSessionEntity } from '../../src/modules/auth/entities/refresh-session.entity';
import { RefreshSessionCleanupService } from '../../src/modules/auth/services/refresh-session-cleanup.service';
import { RefreshSessionService } from '../../src/modules/auth/services/refresh-session.service';
import type { SessionTokenService } from '../../src/modules/auth/services/session-token.service';
import { UserEntity } from '../../src/modules/users/user.entity';

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationDatabaseUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const requiresDatabase = process.env.REQUIRE_DATABASE_E2E === 'true';
if (requiresDatabase && (databaseUrl === undefined || migrationDatabaseUrl === undefined)) {
  throw new Error(
    'REQUIRE_DATABASE_E2E=true requires TEST_DATABASE_URL and TEST_MIGRATION_DATABASE_URL',
  );
}
const describeWithPostgres =
  databaseUrl === undefined || migrationDatabaseUrl === undefined ? describe.skip : describe;

function requireDatabaseUrl(value: string | undefined, name: string): string {
  if (value === undefined) throw new Error(`${name} is required`);
  return value;
}

function hashToken(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

describeWithPostgres('refresh-session PostgreSQL contract', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    const migrationDataSource = new DataSource({
      type: 'postgres',
      url: requireDatabaseUrl(migrationDatabaseUrl, 'TEST_MIGRATION_DATABASE_URL'),
      entities: [...databaseEntities],
      installExtensions: false,
      migrations: [CreateIdentityFoundation1788464265141],
      migrationsRun: false,
      synchronize: false,
    });
    await migrationDataSource.initialize();
    try {
      await migrationDataSource.runMigrations({ transaction: 'all' });
    } finally {
      await migrationDataSource.destroy();
    }

    dataSource = new DataSource({
      type: 'postgres',
      url: requireDatabaseUrl(databaseUrl, 'TEST_DATABASE_URL'),
      entities: [...databaseEntities],
      installExtensions: false,
      migrationsRun: false,
      synchronize: false,
    });
    await dataSource.initialize();
  });

  beforeEach(async () => {
    await dataSource.query('DELETE FROM "refresh_sessions"');
    await dataSource.query('DELETE FROM "oauth_login_states"');
    await dataSource.query('DELETE FROM "users"');
  });

  afterAll(async () => {
    if (dataSource?.isInitialized) await dataSource.destroy();
  });

  it('locks only the refresh row and rotates a real persisted session', async () => {
    const userRepository = dataSource.getRepository(UserEntity);
    const sessionRepository = dataSource.getRepository(RefreshSessionEntity);
    const user = await userRepository.save(
      userRepository.create({
        avatarUrl: null,
        displayName: 'PostgreSQL Contract User',
        email: 'postgres-contract@example.test',
        identities: [],
        lastLoginAt: new Date(),
        role: 'user',
        status: 'active',
      }),
    );
    const currentRawToken = 'current-refresh-token';
    const nextRawToken = 'next-refresh-token';
    const currentSession = await sessionRepository.save(
      sessionRepository.create({
        expiresAt: new Date(Date.now() + 60_000),
        familyId: randomUUID(),
        id: randomUUID(),
        replacedBySessionId: null,
        revokedAt: null,
        rotatedAt: null,
        tokenHash: hashToken(currentRawToken),
        userId: user.id,
      }),
    );
    const tokens = {
      createRefreshToken: vi.fn().mockReturnValue({
        hash: hashToken(nextRawToken),
        raw: nextRawToken,
      }),
      hashRefreshToken: vi.fn((value: string) => hashToken(value)),
      issueAccessToken: vi.fn().mockResolvedValue('postgres-access-token'),
    } as unknown as SessionTokenService;
    const config = {
      getOrThrow: vi.fn().mockReturnValue(3600),
    } as unknown as ConfigService;
    const service = new RefreshSessionService(dataSource, tokens, config);

    await expect(service.rotate(currentRawToken)).resolves.toMatchObject({
      accessToken: 'postgres-access-token',
      refreshToken: nextRawToken,
      user: { id: user.id },
    });

    const rotated = await sessionRepository.findOneByOrFail({ id: currentSession.id });
    const replacement = await sessionRepository.findOneByOrFail({
      tokenHash: hashToken(nextRawToken),
    });
    expect(rotated.rotatedAt).toBeInstanceOf(Date);
    expect(rotated.replacedBySessionId).toBe(replacement.id);
    expect(replacement.familyId).toBe(currentSession.familyId);
    expect(replacement.userId).toBe(user.id);
  });

  it('keeps a rotated tombstone until expiry and revokes the family when it is replayed', async () => {
    const userRepository = dataSource.getRepository(UserEntity);
    const sessionRepository = dataSource.getRepository(RefreshSessionEntity);
    const user = await userRepository.save(
      userRepository.create({
        avatarUrl: null,
        displayName: 'Replay Contract User',
        email: 'replay-contract@example.test',
        identities: [],
        lastLoginAt: new Date(),
        role: 'user',
        status: 'active',
      }),
    );
    const currentRawToken = 'replay-current-refresh-token';
    const nextRawToken = 'replay-next-refresh-token';
    const currentSession = await sessionRepository.save(
      sessionRepository.create({
        expiresAt: new Date(Date.now() + 60_000),
        familyId: randomUUID(),
        id: randomUUID(),
        replacedBySessionId: null,
        revokedAt: null,
        rotatedAt: null,
        tokenHash: hashToken(currentRawToken),
        userId: user.id,
      }),
    );
    const tokens = {
      createRefreshToken: vi.fn().mockReturnValue({
        hash: hashToken(nextRawToken),
        raw: nextRawToken,
      }),
      hashRefreshToken: vi.fn((value: string) => hashToken(value)),
      issueAccessToken: vi.fn().mockResolvedValue('replay-access-token'),
    } as unknown as SessionTokenService;
    const sessionConfig = { getOrThrow: vi.fn().mockReturnValue(3600) } as unknown as ConfigService;
    const sessions = new RefreshSessionService(dataSource, tokens, sessionConfig);

    await sessions.rotate(currentRawToken);
    const cleanupConfig = {
      getOrThrow: vi.fn((key: string) => (key === 'AUTH_SESSION_RETENTION_SECONDS' ? 0 : 3600)),
    } as unknown as ConfigService;
    const cleanup = new RefreshSessionCleanupService(sessionRepository, cleanupConfig);

    await expect(cleanup.purge(new Date(currentSession.expiresAt.getTime() - 1))).resolves.toBe(0);
    await expect(sessions.rotate(currentRawToken)).rejects.toThrow('Refresh token reuse detected');
    const family = await sessionRepository.findBy({ familyId: currentSession.familyId });
    expect(family).toHaveLength(2);
    expect(family.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
  });

  it('serializes concurrent rotation and treats the second presentation as strict replay', async () => {
    const userRepository = dataSource.getRepository(UserEntity);
    const sessionRepository = dataSource.getRepository(RefreshSessionEntity);
    const user = await userRepository.save(
      userRepository.create({
        avatarUrl: null,
        displayName: 'Concurrent Contract User',
        email: 'concurrent-contract@example.test',
        identities: [],
        lastLoginAt: new Date(),
        role: 'user',
        status: 'active',
      }),
    );
    const currentRawToken = 'concurrent-current-refresh-token';
    const currentSession = await sessionRepository.save(
      sessionRepository.create({
        expiresAt: new Date(Date.now() + 60_000),
        familyId: randomUUID(),
        id: randomUUID(),
        replacedBySessionId: null,
        revokedAt: null,
        rotatedAt: null,
        tokenHash: hashToken(currentRawToken),
        userId: user.id,
      }),
    );
    let replacement = 0;
    const tokens = {
      createRefreshToken: vi.fn(() => {
        replacement += 1;
        const raw = `concurrent-next-refresh-token-${replacement}`;
        return { hash: hashToken(raw), raw };
      }),
      hashRefreshToken: vi.fn((value: string) => hashToken(value)),
      issueAccessToken: vi.fn().mockResolvedValue('concurrent-access-token'),
    } as unknown as SessionTokenService;
    const config = { getOrThrow: vi.fn().mockReturnValue(3600) } as unknown as ConfigService;
    const service = new RefreshSessionService(dataSource, tokens, config);

    const outcomes = await Promise.allSettled([
      service.rotate(currentRawToken),
      service.rotate(currentRawToken),
    ]);

    expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter(({ status }) => status === 'rejected')).toHaveLength(1);
    const family = await sessionRepository.findBy({ familyId: currentSession.familyId });
    expect(family).toHaveLength(2);
    expect(family.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
  });

  it('leaves no active family member when logout races with rotation', async () => {
    const userRepository = dataSource.getRepository(UserEntity);
    const sessionRepository = dataSource.getRepository(RefreshSessionEntity);
    const user = await userRepository.save(
      userRepository.create({
        avatarUrl: null,
        displayName: 'Logout Race Contract User',
        email: 'logout-race-contract@example.test',
        identities: [],
        lastLoginAt: new Date(),
        role: 'user',
        status: 'active',
      }),
    );
    const currentRawToken = 'logout-race-current-refresh-token';
    const currentSession = await sessionRepository.save(
      sessionRepository.create({
        expiresAt: new Date(Date.now() + 60_000),
        familyId: randomUUID(),
        id: randomUUID(),
        replacedBySessionId: null,
        revokedAt: null,
        rotatedAt: null,
        tokenHash: hashToken(currentRawToken),
        userId: user.id,
      }),
    );
    const nextRawToken = 'logout-race-next-refresh-token';
    const tokens = {
      createRefreshToken: vi.fn().mockReturnValue({
        hash: hashToken(nextRawToken),
        raw: nextRawToken,
      }),
      hashRefreshToken: vi.fn((value: string) => hashToken(value)),
      issueAccessToken: vi.fn().mockResolvedValue('logout-race-access-token'),
    } as unknown as SessionTokenService;
    const config = { getOrThrow: vi.fn().mockReturnValue(3600) } as unknown as ConfigService;
    const service = new RefreshSessionService(dataSource, tokens, config);

    await Promise.allSettled([service.rotate(currentRawToken), service.revoke(currentRawToken)]);

    const family = await sessionRepository.findBy({ familyId: currentSession.familyId });
    expect(family.length).toBeGreaterThanOrEqual(1);
    expect(family.every(({ revokedAt }) => revokedAt !== null)).toBe(true);
  });

  it('denies schema creation to the API runtime role', async () => {
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      await expect(
        queryRunner.query('CREATE TABLE "runtime_privilege_probe" ("id" integer NOT NULL)'),
      ).rejects.toThrow();
    } finally {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
    }
  });
});
