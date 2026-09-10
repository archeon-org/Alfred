import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { SkillRollbackPointer1789260000000 } from '@api/database/migrations/1789260000000-skill-rollback-pointer';
import { SkillLifecycle1789250000000 } from '@api/database/migrations/1789250000000-skill-lifecycle';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { SkillVersionEntity } from '@api/modules/skills/infrastructure/skill-version.entity';
import { SkillFileEntity } from '@api/modules/skills/infrastructure/skill-file.entity';
import { skillEnvelopeSchema, skillVersionListEnvelopeSchema } from '@alfred/contracts';
import { skillPackage, SkillsPostgresFixture } from './skills-postgres.fixture';

const url = process.env.TEST_DATABASE_URL;
const suite = url ? describe : describe.skip;
suite.sequential('personal skill lifecycle PostgreSQL', () => {
  const fixture = new SkillsPostgresFixture();
  beforeAll(async () => {
    const db = await new DataSource({
      type: 'postgres',
      url,
      entities: [...databaseEntities],
      migrations: [...databaseMigrations],
      migrationsTableName: API_MIGRATIONS_TABLE,
    }).initialize();
    try {
      await db.runMigrations({ transaction: 'each' });
    } finally {
      await db.destroy();
    }
    await fixture.start(url!);
  });
  afterAll(async () => fixture.close());
  it('repoints historical bytes without rewriting snapshots or published pointer', async () => {
    const owner = await fixture.user();
    const original = skillPackage('original');
    const input = {
      ...original,
      files: [
        ...original.files,
        {
          path: 'assets/blob.bin',
          mediaType: 'application/octet-stream',
          contentBase64: Buffer.from([0, 255, 128, 13, 10]).toString('base64'),
        },
      ],
    };
    const id = await fixture.create(owner.token, input);
    await fixture.publish(owner.token, id);
    const history = await fixture.db
      .getRepository(SkillVersionEntity)
      .findOneByOrFail({ skillId: id, version: 1 });
    expect(
      (
        await fixture.api('PUT', `/skills/${id}`, owner.token, {
          ...skillPackage('changed'),
          expectedVersion: 2,
        })
      ).status,
    ).toBe(200);
    await fixture.publish(owner.token, id, 3);
    const snapshots = await fixture.db
      .getRepository(SkillVersionEntity)
      .find({ where: { skillId: id }, order: { version: 'ASC' } });
    const storedFiles = await fixture.db
      .getRepository(SkillFileEntity)
      .find({ where: { skillId: id }, order: { version: 'ASC', path: 'ASC' } });
    const restored = await fixture.api('POST', `/skills/${id}/restore`, owner.token, {
      expectedVersion: 4,
      sourceVersion: 1,
    });
    expect(restored.status).toBe(200);
    expect(restored.body?.data).toMatchObject({
      enabled: true,
      name: original.name,
      description: original.description,
      version: 5,
      currentVersion: 1,
      publishedVersion: 2,
      status: 'draft',
    });
    // File order is not part of the package contract and SQL collation varies by deployment.
    // Sort copies with a locale-independent comparator, retaining exact cardinality and bytes.
    const byPath = (a: { path: string }, b: { path: string }) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0;
    const restoredFiles = skillEnvelopeSchema.parse(restored.body).data.files;
    expect([...restoredFiles].sort(byPath)).toEqual([...input.files].sort(byPath));
    const versions = fixture.db.getRepository(SkillVersionEntity);
    expect(await versions.findOneByOrFail({ skillId: id, version: 1 })).toEqual(history);
    expect(await versions.find({ where: { skillId: id }, order: { version: 'ASC' } })).toEqual(
      snapshots,
    );
    expect(
      await fixture.db
        .getRepository(SkillFileEntity)
        .find({ where: { skillId: id }, order: { version: 'ASC', path: 'ASC' } }),
    ).toEqual(storedFiles);
    const first = await fixture.api('GET', `/skills/${id}/versions?limit=1`, owner.token);
    const parsed = skillVersionListEnvelopeSchema.parse(first.body);
    expect(parsed.data.items.map((v) => v.version)).toEqual([2]);
    expect(parsed.data.nextBefore).toBe(2);
    const last = await fixture.api('GET', `/skills/${id}/versions?before=2&limit=2`, owner.token);
    expect(last.body?.data?.nextBefore).toBeNull();
    expect(last.body?.data?.items?.map((v) => v.version)).toEqual([1]);
    expect(
      (
        await fixture.api('POST', `/skills/${id}/restore`, owner.token, {
          expectedVersion: 5,
          sourceVersion: 1,
        })
      ).body,
    ).toEqual(restored.body);
    expect(
      (
        await fixture.api('POST', `/skills/${id}/restore`, owner.token, {
          expectedVersion: 5,
          sourceVersion: 999,
        })
      ).status,
    ).toBe(404);
  });
  it('allocates beyond all retained snapshots after rollback and republishes historical snapshots explicitly', async () => {
    const owner = await fixture.user();
    const id = await fixture.create(owner.token);
    await fixture.publish(owner.token, id);
    const versions = fixture.db.getRepository(SkillVersionEntity);
    const originalPublished = await versions.findOneByOrFail({ skillId: id, version: 1 });
    await fixture.api('PUT', `/skills/${id}`, owner.token, {
      ...skillPackage('second'),
      expectedVersion: 2,
    });
    await fixture.publish(owner.token, id, 3);
    await fixture.api('PUT', `/skills/${id}`, owner.token, {
      ...skillPackage('third'),
      expectedVersion: 4,
    });
    const retained = await versions.find({ where: { skillId: id }, order: { version: 'ASC' } });
    const rolled = await fixture.api('POST', `/skills/${id}/restore`, owner.token, {
      expectedVersion: 5,
      sourceVersion: 1,
    });
    expect(rolled.status).toBe(200);
    expect(rolled.body?.data).toMatchObject({
      version: 6,
      currentVersion: 1,
      publishedVersion: 2,
      status: 'draft',
    });
    expect(await versions.find({ where: { skillId: id }, order: { version: 'ASC' } })).toEqual(
      retained,
    );
    await fixture.publish(owner.token, id, 6);
    expect((await fixture.api('GET', `/skills/${id}`, owner.token)).body?.data).toMatchObject({
      version: 7,
      currentVersion: 1,
      publishedVersion: 1,
      status: 'published',
    });
    const republished = await versions.findOneByOrFail({ skillId: id, version: 1 });
    expect(republished.publishedAt!.getTime()).toBeGreaterThan(
      originalPublished.publishedAt!.getTime(),
    );
    const attempts = await Promise.all(
      ['fourth-a', 'fourth-b'].map((name) =>
        fixture.api('PUT', `/skills/${id}`, owner.token, {
          ...skillPackage(name),
          expectedVersion: 7,
        }),
      ),
    );
    expect(attempts.map((result) => result.status).sort()).toEqual([200, 409]);
    expect(attempts.find((result) => result.status === 200)?.body?.data).toMatchObject({
      version: 8,
      currentVersion: 4,
      publishedVersion: 1,
      status: 'draft',
    });
    expect(
      (await versions.find({ where: { skillId: id }, order: { version: 'ASC' } })).map(
        (snapshot) => snapshot.version,
      ),
    ).toEqual([1, 2, 3, 4]);
    expect(await versions.findOneByOrFail({ skillId: id, version: 2 })).toEqual(retained[1]);
    expect(await versions.findOneByOrFail({ skillId: id, version: 3 })).toEqual(retained[2]);
  });
  it('migrates independent pointers, refuses unsafe down, and round trips compatible data', async () => {
    const owner = await fixture.user();
    const id = await fixture.create(owner.token);
    await fixture.api('PUT', `/skills/${id}`, owner.token, {
      ...skillPackage('newer'),
      expectedVersion: 1,
    });
    await fixture.publish(owner.token, id, 2);
    const change = new SkillRollbackPointer1789260000000();
    const runner = fixture.db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      // Isolate compatible fixture; rollback restores all other tests' retained data.
      await runner.query('DELETE FROM api_skills WHERE id <> $1', [id]);
      await change.down(runner);
      await change.up(runner);
      await runner.query('UPDATE api_skills SET current_version=1 WHERE id=$1', [id]);
      await expect(change.down(runner)).rejects.toThrow();
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    expect((await fixture.api('GET', `/skills/${id}`, owner.token)).body?.data).toMatchObject({
      currentVersion: 2,
      publishedVersion: 2,
      version: 3,
    });
  });
  it('enforces isolation, DTO bounds and feature guards for all new routes', async () => {
    const owner = await fixture.user(),
      foreign = await fixture.user(await fixture.tenant());
    const id = await fixture.create(owner.token);
    for (const [method, suffix, body] of [
      ['GET', 'versions', undefined],
      ['POST', 'restore', { expectedVersion: 1, sourceVersion: 1 }],
      ['PUT', 'availability', { expectedVersion: 1, enabled: false }],
    ] as const) {
      expect(
        (await fixture.api(method, `/skills/${id}/${suffix}`, foreign.token, body)).status,
      ).toBe(404);
    }
    expect((await fixture.api('GET', `/skills/${id}/versions?before=0`, owner.token)).status).toBe(
      400,
    );
    expect(
      (
        await fixture.api('PUT', `/skills/${id}/availability`, owner.token, {
          expectedVersion: 1,
          enabled: 'false',
        })
      ).status,
    ).toBe(400);
  });
  it('rolls back name collisions, restores above quota, and charges later edits', async () => {
    const owner = await fixture.user();
    const id = await fixture.create(owner.token, skillPackage('old-name'));
    await fixture.api('PUT', `/skills/${id}`, owner.token, {
      ...skillPackage('new-name'),
      expectedVersion: 1,
    });
    const collision = await fixture.create(owner.token, skillPackage('old-name'));
    expect(
      (
        await fixture.api('POST', `/skills/${id}/restore`, owner.token, {
          expectedVersion: 2,
          sourceVersion: 1,
        })
      ).body?.error?.code,
    ).toBe('skill_name_conflict');
    await fixture.api('DELETE', `/skills/${collision}`, owner.token, { expectedVersion: 1 });
    const config = fixture.app.get(ConfigService);
    config.set('SKILLS_MAX_TOTAL_BYTES_PER_USER', 1);
    try {
      expect(
        (
          await fixture.api('POST', `/skills/${id}/restore`, owner.token, {
            expectedVersion: 2,
            sourceVersion: 1,
          })
        ).status,
      ).toBe(200);
      expect(
        (
          await fixture.api('PUT', `/skills/${id}`, owner.token, {
            ...skillPackage('edited'),
            expectedVersion: 3,
          })
        ).body?.error?.code,
      ).toBe('skill_storage_quota_exceeded');
    } finally {
      config.set('SKILLS_MAX_TOTAL_BYTES_PER_USER', 26214400);
    }
    expect(await fixture.db.getRepository(SkillVersionEntity).countBy({ skillId: id })).toBe(2);
    expect(await fixture.db.getRepository(SkillFileEntity).countBy({ skillId: id })).toBe(2);
    expect((await fixture.api('GET', `/skills/${id}`, owner.token)).body?.data?.version).toBe(3);
  });
  it('serializes competing restores and availability writes through CAS', async () => {
    const owner = await fixture.user();
    const id = await fixture.create(owner.token);
    await fixture.api('PUT', `/skills/${id}`, owner.token, {
      ...skillPackage('updated'),
      expectedVersion: 1,
    });
    const results = await Promise.all([
      fixture.api('POST', `/skills/${id}/restore`, owner.token, {
        expectedVersion: 2,
        sourceVersion: 1,
      }),
      fixture.api('PUT', `/skills/${id}/availability`, owner.token, {
        expectedVersion: 2,
        enabled: false,
      }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
    expect(results.find((r) => r.status === 409)?.body?.error?.code).toBe('skill_version_conflict');
  });
  it('changes availability without conversation bindings or new snapshots', async () => {
    const owner = await fixture.user(),
      id = await fixture.create(owner.token);
    await fixture.publish(owner.token, id);
    const changed = await fixture.api('PUT', `/skills/${id}/availability`, owner.token, {
      expectedVersion: 2,
      enabled: false,
    });
    expect(changed.status).toBe(200);
    expect(changed.body?.data).toMatchObject({ version: 3, enabled: false, publishedVersion: 1 });
    const noop = await fixture.api('PUT', `/skills/${id}/availability`, owner.token, {
      expectedVersion: 3,
      enabled: false,
    });
    expect(noop.body).toEqual(changed.body);
    expect(
      (
        await fixture.api('PUT', `/skills/${id}/availability`, owner.token, {
          expectedVersion: 3,
          enabled: true,
        })
      ).body?.data,
    ).toMatchObject({ enabled: true, version: 4 });
    expect(await fixture.db.getRepository(SkillVersionEntity).countBy({ skillId: id })).toBe(1);
  });
  it('backfills existing rows additively and protects lifecycle metadata on rollback', async () => {
    const owner = await fixture.user();
    const id = await fixture.create(owner.token);
    const runner = fixture.db.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await runner.query('ALTER TABLE api_skills DROP COLUMN enabled');
      await runner.query('ALTER TABLE api_skill_versions DROP COLUMN created_at');
      await new SkillLifecycle1789250000000().up(runner);
      const rows = (await runner.query(
        'SELECT s.enabled, v.created_at FROM api_skills s JOIN api_skill_versions v ON s.id=v.skill_id WHERE s.id=$1',
        [id],
      )) as { enabled: boolean; created_at: Date }[];
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ enabled: true, created_at: expect.any(Date) as unknown });
      await expect(new SkillLifecycle1789250000000().down(runner)).rejects.toThrow(
        'Export or delete',
      );
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    const emptyRunner = fixture.db.createQueryRunner();
    await emptyRunner.connect();
    await emptyRunner.startTransaction();
    try {
      await emptyRunner.query('DELETE FROM api_skills');
      await new SkillLifecycle1789250000000().down(emptyRunner);
      expect(await emptyRunner.hasColumn('api_skills', 'enabled')).toBe(false);
      await new SkillLifecycle1789250000000().up(emptyRunner);
      expect(await emptyRunner.hasColumn('api_skills', 'enabled')).toBe(true);
    } finally {
      await emptyRunner.rollbackTransaction();
      await emptyRunner.release();
    }
  });
  it('rejects all lifecycle routes when the feature is off', async () => {
    const disabled = new SkillsPostgresFixture();
    await disabled.start(url!, false);
    try {
      const owner = await fixture.user(),
        id = await fixture.create(owner.token);
      for (const [method, suffix, body] of [
        ['GET', 'versions', undefined],
        ['POST', 'restore', { expectedVersion: 1, sourceVersion: 1 }],
        ['PUT', 'availability', { expectedVersion: 1, enabled: false }],
      ] as const) {
        expect(
          (await disabled.api(method, `/skills/${id}/${suffix}`, owner.token, body)).status,
        ).toBe(404);
      }
    } finally {
      await disabled.close();
    }
  });
  it('has no migration/entity schema drift', async () => {
    expect((await fixture.db.driver.createSchemaBuilder().log()).upQueries).toEqual([]);
  });
});
