import { RemoveConversationSkills1789270000000 } from '@api/database/migrations/1789270000000-remove-conversation-skills';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { CreateSkills1789240000000 } from '@api/database/migrations/1789240000000-create-skills';
import { databaseEntities } from '@api/database/typeorm.options';
import { SkillEntity } from '@api/modules/skills/infrastructure/skill.entity';
import { SkillVersionEntity } from '@api/modules/skills/infrastructure/skill-version.entity';
import { SkillFileEntity } from '@api/modules/skills/infrastructure/skill-file.entity';
import { UserEntity } from '@api/modules/users/user.entity';
import { SkillsService } from '@api/modules/skills/application/skills.service';
import { TenantsService } from '@api/modules/tenants/tenants.service';
import { skillPackage, SkillsPostgresFixture } from './skills-postgres.fixture';

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationDatabaseUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const postgres = databaseUrl && migrationDatabaseUrl ? describe : describe.skip;

// Sequential with other PostgreSQL suites: these applications share the migrated schema.
postgres('personal skills PostgreSQL HTTP contract', () => {
  const fixture = new SkillsPostgresFixture();
  let migration: DataSource;

  beforeAll(async () => {
    migration = new DataSource({
      entities: [...databaseEntities],
      installExtensions: false,
      migrations: [...databaseMigrations],
      migrationsRun: false,
      migrationsTableName: API_MIGRATIONS_TABLE,
      synchronize: false,
      type: 'postgres',
      url: migrationDatabaseUrl!,
    });
    await migration.initialize();
    await migration.runMigrations({ transaction: 'each' });
    await fixture.start(databaseUrl!);
  });

  afterAll(async () => {
    await fixture.close();
    if (migration?.isInitialized) await migration.destroy();
  });

  it.each(['for_key_share', 'for_no_key_update'] as const)(
    'allows FK references but serializes owner allocations while %s is held',
    async (mode) => {
      const owner = await fixture.user();
      // A separate connection gives the operation a bounded, real PostgreSQL lock wait.
      const client = await new DataSource({
        type: 'postgres',
        url: databaseUrl!,
        entities: [...databaseEntities],
        extra: { options: '-c lock_timeout=1000' },
      }).initialize();
      const holder = fixture.db.createQueryRunner();
      try {
        await holder.connect();
        await holder.startTransaction();
        await holder.manager.getRepository(UserEntity).findOneOrFail({
          where: { id: owner.id, tenantId: fixture.defaultTenantId },
          lock: { mode },
        });
        const service = new SkillsService(client, new TenantsService(client), new ConfigService());
        const creation = service.create(
          {
            id: owner.id,
            email: 'lock-test@example.test',
            role: 'user',
            sessionId: randomUUID(),
          },
          skillPackage('owner-lock'),
        );
        if (mode === 'for_key_share') {
          await expect(creation).resolves.toMatchObject({ name: 'owner-lock', version: 1 });
        } else {
          await expect(creation).rejects.toMatchObject({ driverError: { code: '55P03' } });
          expect(await client.getRepository(SkillEntity).countBy({ ownerUserId: owner.id })).toBe(
            0,
          );
        }
      } finally {
        if (holder.isTransactionActive) await holder.rollbackTransaction();
        await holder.release();
        await client.destroy();
      }
    },
  );

  it('requires authentication and isolates every operation by tenant and owner', async () => {
    expect((await fixture.api('GET', '/skills', '')).status).toBe(401);
    const owner = await fixture.user();
    const neighbour = await fixture.user();
    const stranger = await fixture.user(await fixture.tenant());
    const input = skillPackage();
    const id = await fixture.create(owner.token, input);
    expect((await fixture.api('GET', '/skills', owner.token)).body?.data?.items).toHaveLength(1);
    for (const other of [neighbour, stranger]) {
      expect((await fixture.api('GET', '/skills', other.token)).body?.data?.items).toEqual([]);
      for (const [method, path, body] of [
        ['GET', `/skills/${id}`, undefined],
        ['PUT', `/skills/${id}`, { ...input, expectedVersion: 1 }],
        ['POST', `/skills/${id}/publish`, { expectedVersion: 1 }],
        ['DELETE', `/skills/${id}`, { expectedVersion: 1 }],
      ] as const) {
        const denied = await fixture.api(method, path, other.token, body);
        expect(denied.status).toBe(404);
        expect(denied.body?.error?.code).toBe('skill_not_found');
      }
      // The same personal name is valid for another account, including another tenant.
      await fixture.create(other.token, input);
    }
    const missing = await fixture.api('GET', `/skills/${randomUUID()}`, owner.token);
    expect(missing.status).toBe(404);
    expect(missing.body?.error?.code).toBe('skill_not_found');
    expect(
      (await fixture.api('POST', '/skills', owner.token, { ...input, ownerUserId: neighbour.id }))
        .status,
    ).toBe(400);
    expect((await fixture.api('POST', '/skills', owner.token, input)).body?.error?.code).toBe(
      'skill_name_conflict',
    );
  });

  it('round-trips exact Markdown, scripts and binary bytes without executing them', async () => {
    const owner = await fixture.user();
    const basic = skillPackage('byte-roundtrip', '# Méthode\r\nConserver les espaces.  \n');
    const files = [
      ...basic.files,
      {
        path: 'scripts/run.py',
        mediaType: 'text/plain',
        contentBase64: Buffer.from('raise RuntimeError("Must never execute")\n').toString('base64'),
      },
      {
        path: 'assets/reference.bin',
        mediaType: 'application/octet-stream',
        contentBase64: Buffer.from([0, 255, 128, 13, 10, 0]).toString('base64'),
      },
    ];
    const id = await fixture.create(owner.token, { ...basic, files });
    const detail = (await fixture.api('GET', `/skills/${id}`, owner.token)).body?.data;
    expect(detail).toMatchObject({
      version: 1,
      publishedVersion: null,
      status: 'draft',
      fileCount: 3,
    });
    expect(detail?.files).toEqual(expect.arrayContaining(files));
    expect(detail?.files).toHaveLength(files.length);
    expect(detail?.totalBytes).toBe(
      files.reduce((sum, file) => sum + Buffer.from(file.contentBase64, 'base64').length, 0),
    );
    expect(detail).not.toHaveProperty('ownerUserId');
    expect(detail).not.toHaveProperty('tenantId');
  });

  it('keeps published bytes immutable when editing a new draft and rejects stale writes', async () => {
    const owner = await fixture.user();
    const original = skillPackage('versioned', 'Original instructions');
    const id = await fixture.create(owner.token, original);
    await fixture.publish(owner.token, id);
    const published = await fixture.db
      .getRepository(SkillVersionEntity)
      .findOneByOrFail({ skillId: id, version: 1 });
    expect(published.publishedAt).toBeInstanceOf(Date);
    const next = skillPackage('versioned', 'New unpublished instructions');
    // Publication is itself a CAS mutation: clients holding version 1 must reload.
    expect(
      (await fixture.api('DELETE', `/skills/${id}`, owner.token, { expectedVersion: 1 })).body
        ?.error?.code,
    ).toBe('skill_version_conflict');
    expect(
      (await fixture.api('PUT', `/skills/${id}`, owner.token, { ...next, expectedVersion: 1 })).body
        ?.error?.code,
    ).toBe('skill_version_conflict');
    const changed = await fixture.api('PUT', `/skills/${id}`, owner.token, {
      ...next,
      expectedVersion: 2,
    });
    expect(changed.body?.data).toMatchObject({
      version: 3,
      currentVersion: 2,
      publishedVersion: 1,
      status: 'draft',
      files: next.files,
    });
    const retained = await fixture.db
      .getRepository(SkillFileEntity)
      .findOneByOrFail({ skillId: id, version: 1, path: 'SKILL.md' });
    expect(retained.content.toString('base64')).toBe(original.files[0]!.contentBase64);
    expect(
      await fixture.db
        .getRepository(SkillVersionEntity)
        .findOneByOrFail({ skillId: id, version: 1 }),
    ).toEqual(published);
    for (const [method, suffix, body] of [
      ['PUT', '', { ...next, expectedVersion: 1 }],
      ['POST', '/publish', { expectedVersion: 1 }],
      ['DELETE', '', { expectedVersion: 1 }],
    ] as const) {
      const stale = await fixture.api(method, `/skills/${id}${suffix}`, owner.token, body);
      expect(stale.status).toBe(409);
      expect(stale.body?.error?.code).toBe('skill_version_conflict');
    }
    expect(await fixture.db.getRepository(SkillVersionEntity).countBy({ skillId: id })).toBe(2);
    await fixture.publish(owner.token, id, 3);
    expect((await fixture.api('GET', `/skills/${id}`, owner.token)).body?.data).toMatchObject({
      version: 4,
      currentVersion: 2,
      publishedVersion: 2,
      status: 'published',
    });
  });

  it('allows one of two concurrent editors to win without partial snapshots', async () => {
    const owner = await fixture.user();
    const id = await fixture.create(owner.token);
    const results = await Promise.all(
      ['Editor A', 'Editor B'].map((instructions) =>
        fixture.api('PUT', `/skills/${id}`, owner.token, {
          ...skillPackage('test-skill', instructions),
          expectedVersion: 1,
        }),
      ),
    );
    expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(results.find((result) => result.status === 409)?.body?.error?.code).toBe(
      'skill_version_conflict',
    );
    const current = await fixture.api('GET', `/skills/${id}`, owner.token);
    expect(current.body?.data).toEqual(results.find((result) => result.status === 200)?.body?.data);
    expect(await fixture.db.getRepository(SkillVersionEntity).countBy({ skillId: id })).toBe(2);
    expect(await fixture.db.getRepository(SkillFileEntity).countBy({ skillId: id })).toBe(2);
  });

  it('rejects malformed packages atomically and enforces actual transport and decoded limits', async () => {
    const owner = await fixture.user();
    const input = skillPackage();
    for (const files of [
      [...input.files, { ...input.files[0]!, path: '../escape.md' }],
      [...input.files, { ...input.files[0]!, path: 'skill.md' }],
      [{ ...input.files[0]!, contentBase64: 'not base64' }],
      [{ ...input.files[0]!, contentBase64: Buffer.from('Missing YAML').toString('base64') }],
      [{ ...input.files[0]!, contentBase64: Buffer.from([255]).toString('base64') }],
      [
        ...input.files,
        {
          path: 'assets/large.bin',
          mediaType: 'application/octet-stream',
          contentBase64: Buffer.alloc(1048576).toString('base64'),
        },
      ],
    ]) {
      expect((await fixture.api('POST', '/skills', owner.token, { ...input, files })).status).toBe(
        400,
      );
    }
    expect(await fixture.db.getRepository(SkillEntity).countBy({ ownerUserId: owner.id })).toBe(0);
    expect(
      (
        await fixture.api('POST', '/skills', owner.token, {
          ...input,
          description: 'x'.repeat(1_600_001),
        })
      ).status,
    ).toBe(413);
  });

  it('cascades skill and owner deletion through retained versions and bytes', async () => {
    const owner = await fixture.user();
    const id = await fixture.create(owner.token);
    await fixture.publish(owner.token, id);
    const changed = await fixture.api('PUT', `/skills/${id}`, owner.token, {
      ...skillPackage('test-skill', 'Changed instructions before deletion'),
      expectedVersion: 2,
    });
    expect(changed.status).toBe(200);
    expect(changed.body?.data).toMatchObject({ version: 3, currentVersion: 2 });
    expect(await fixture.db.getRepository(SkillVersionEntity).countBy({ skillId: id })).toBe(2);
    expect(
      (
        await fixture.api('DELETE', `/skills/${id}`, owner.token, {
          expectedVersion: changed.body!.data!.version,
        })
      ).status,
    ).toBe(204);
    expect(await fixture.db.getRepository(SkillVersionEntity).countBy({ skillId: id })).toBe(0);
    expect(await fixture.db.getRepository(SkillFileEntity).countBy({ skillId: id })).toBe(0);
    expect((await fixture.api('GET', `/skills/${id}`, owner.token)).status).toBe(404);
    const another = await fixture.create(owner.token);
    await fixture.db.getRepository(UserEntity).delete(owner.id);
    expect(await fixture.db.getRepository(SkillEntity).countBy({ id: another })).toBe(0);
    expect(await fixture.db.getRepository(SkillFileEntity).countBy({ skillId: another })).toBe(0);
  });

  it('serializes concurrent allocations against all retained-version bytes', async () => {
    const limited = new SkillsPostgresFixture();
    const first = skillPackage('quota-a');
    const bytes = Buffer.from(first.files[0]!.contentBase64, 'base64').length;
    await limited.start(databaseUrl!, true, bytes * 2 - 1);
    try {
      const owner = await limited.user();
      const attempts = await Promise.all(
        [first, skillPackage('quota-b')].map((input) =>
          limited.api('POST', '/skills', owner.token, input),
        ),
      );
      expect(attempts.map((result) => result.status).sort()).toEqual([201, 409]);
      expect(attempts.find((result) => result.status === 409)?.body?.error?.code).toBe(
        'skill_storage_quota_exceeded',
      );
      const saved = attempts.find((result) => result.status === 201)!.body!.data!;
      const id = saved.id as string;
      const unchanged = await limited.api('PUT', `/skills/${id}`, owner.token, {
        ...skillPackage(saved.name as string),
        expectedVersion: 1,
      });
      expect(unchanged.status).toBe(200);
      expect(unchanged.body?.data).toEqual(saved);
      expect(await limited.db.getRepository(SkillVersionEntity).countBy({ skillId: id })).toBe(1);
      expect(await limited.db.getRepository(SkillFileEntity).countBy({ skillId: id })).toBe(1);
      const update = await limited.api('PUT', `/skills/${id}`, owner.token, {
        ...skillPackage(saved.name as string, 'Use the supplied method. Updated instructions.'),
        expectedVersion: 1,
      });
      expect(update.status).toBe(409);
      expect(update.body?.error?.code).toBe('skill_storage_quota_exceeded');
      expect(await limited.db.getRepository(SkillVersionEntity).countBy({ skillId: id })).toBe(1);
      expect(
        (await limited.api('DELETE', `/skills/${id}`, owner.token, { expectedVersion: 1 })).status,
      ).toBe(204);
      await limited.create(owner.token, first);
    } finally {
      await limited.close();
    }
  });

  it('hides both CRUD and conversation routes with the feature disabled', async () => {
    const disabled = new SkillsPostgresFixture();
    await disabled.start(databaseUrl!, false);
    try {
      const owner = await fixture.user();
      const id = await fixture.create(owner.token);
      const conversationId = await fixture.conversation(owner.token);
      for (const [method, path, body] of [
        ['GET', '/skills', undefined],
        ['POST', '/skills', skillPackage('hidden')],
        ['GET', `/skills/${id}`, undefined],
        ['PUT', `/skills/${id}`, { ...skillPackage(), expectedVersion: 1 }],
        ['POST', `/skills/${id}/publish`, { expectedVersion: 1 }],
        ['DELETE', `/skills/${id}`, { expectedVersion: 1 }],
        ['GET', `/conversations/${conversationId}/skills`, undefined],
        ['PUT', `/conversations/${conversationId}/skills`, { skillIds: [] }],
      ] as const)
        expect((await disabled.api(method, path, owner.token, body)).status).toBe(404);
      expect((await fixture.api('GET', `/skills/${id}`, owner.token)).body?.data).toMatchObject({
        version: 1,
        publishedVersion: null,
      });
    } finally {
      await disabled.close();
    }
  });

  it('enforces tenant-owner foreign keys, snapshot identity, file lengths and version bounds in SQL', async () => {
    const owner = await fixture.user();
    const id = await fixture.create(owner.token);
    const otherTenant = await fixture.tenant();
    const skills = fixture.db.getRepository(SkillEntity);
    for (const patch of [
      { tenantId: otherTenant },
      { version: 0 },
      { publishedVersion: 2 },
      { fileCount: 0 },
      { totalBytes: 1048577 },
    ]) {
      await expect(skills.update(id, patch)).rejects.toThrow();
    }
    const file = {
      skillId: id,
      version: 1,
      path: 'assets/x.bin',
      content: Buffer.from([1, 2]),
      mediaType: 'application/octet-stream',
      sizeBytes: 2,
    };
    const files = fixture.db.getRepository(SkillFileEntity);
    await expect(files.insert({ ...file, version: 999 })).rejects.toMatchObject({
      driverError: { code: '23503' },
    });
    await expect(files.insert({ ...file, sizeBytes: 1 })).rejects.toMatchObject({
      driverError: { code: '23514' },
    });
    await files.insert(file);
    await expect(files.insert(file)).rejects.toMatchObject({ driverError: { code: '23505' } });
    await expect(
      fixture.db
        .getRepository(SkillVersionEntity)
        .update({ skillId: id, version: 1 }, { version: 0 }),
    ).rejects.toThrow();
  });

  it('keeps the migrated schema in parity and refuses rollback with authored skills', async () => {
    const owner = await fixture.user();
    await fixture.create(owner.token);
    const log = await migration.driver.createSchemaBuilder().log();
    const drift = log.upQueries.map((query) => query.query);
    expect(drift, `Unexpected schema changes: ${JSON.stringify(drift)}`).toEqual([]);
    // Authored fixtures live in databaseUrl, which may differ from migrationDatabaseUrl.
    const runner = fixture.db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const skills = await runner.getTable('api_skills');
      expect(skills?.indices.map(({ name }) => name)).toEqual(
        expect.arrayContaining(['uq_skills_owner_name', 'idx_skills_owner_list']),
      );
      for (const name of ['created_at', 'updated_at']) {
        expect(skills?.columns.find((column) => column.name === name)).toMatchObject({
          type: 'timestamp with time zone',
          default: 'now()',
          isNullable: false,
        });
      }
      expect(await runner.hasTable('api_conversation_skills')).toBe(false);
      await expect(new CreateSkills1789240000000().down(runner)).rejects.toThrow(
        'authored skills exist',
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    expect((await fixture.api('GET', '/skills', owner.token)).body?.data?.items).toHaveLength(1);
  });

  it('rolls an empty skills schema down and up transactionally without disturbing existing data', async () => {
    const runner = migration.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // All removal and DDL below are rolled back, including skills belonging to other tests.
      await runner.query('DELETE FROM "api_skills"');
      await new RemoveConversationSkills1789270000000().down(runner);
      const change = new CreateSkills1789240000000();
      await change.down(runner);
      expect(await runner.hasTable('api_skills')).toBe(false);
      await change.up(runner);
      for (const table of [
        'api_skills',
        'api_skill_versions',
        'api_skill_files',
        'api_conversation_skills',
      ]) {
        expect(await runner.hasTable(table)).toBe(true);
      }
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    expect((await migration.driver.createSchemaBuilder().log()).upQueries).toEqual([]);
  });
});
