import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { RemoveConversationSkills1789270000000 } from '@api/database/migrations/1789270000000-remove-conversation-skills';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { skillPackage, SkillsPostgresFixture } from './skills-postgres.fixture';

const url = process.env.TEST_DATABASE_URL;
// Migration round-trips require DDL privileges; HTTP requests keep the runtime DML role.
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL ?? url;
const suite = url ? describe : describe.skip;
suite.sequential('conversation skill bindings removed', () => {
  const fixture = new SkillsPostgresFixture();
  let migrationDatabase: DataSource;
  beforeAll(async () => {
    migrationDatabase = await new DataSource({
      type: 'postgres',
      url: migrationUrl,
      entities: [...databaseEntities],
      migrations: [...databaseMigrations],
      migrationsTableName: API_MIGRATIONS_TABLE,
    }).initialize();
    await migrationDatabase.runMigrations({ transaction: 'each' });
    await fixture.start(url!);
  });
  afterAll(async () => {
    await fixture.close();
    if (migrationDatabase?.isInitialized) await migrationDatabase.destroy();
  });
  it('exposes neither GET nor PUT bindings routes, including in OpenAPI', async () => {
    const owner = await fixture.user();
    const id = await fixture.create(owner.token);
    await fixture.publish(owner.token, id);
    const conversationId = await fixture.conversation(owner.token);
    for (const method of ['GET', 'PUT']) {
      const result = await fixture.api(
        method,
        `/conversations/${conversationId}/skills`,
        owner.token,
        method === 'PUT' ? { skillIds: [id] } : undefined,
      );
      expect(result.status).toBe(404);
    }
    const document = SwaggerModule.createDocument(fixture.app, new DocumentBuilder().build());
    expect(Object.keys(document.paths).some((path) => /conversations.*skills/u.test(path))).toBe(
      false,
    );
    expect((await fixture.api('GET', `/skills/${id}`, owner.token)).status).toBe(200);
    expect((await fixture.api('GET', `/conversations/${conversationId}`, owner.token)).status).toBe(
      200,
    );
  });
  it('drops only associations, preserves exact unrelated rows, and recreates an empty table on down', async () => {
    const owner = await fixture.user();
    const initial = skillPackage('preserved');
    const id = await fixture.create(owner.token, {
      ...initial,
      files: [
        ...initial.files,
        {
          path: 'assets/binary.bin',
          mediaType: 'application/octet-stream',
          contentBase64: Buffer.from([0, 255, 128, 13, 10]).toString('base64'),
        },
      ],
    });
    await fixture.publish(owner.token, id);
    expect(
      (
        await fixture.api('PUT', `/skills/${id}`, owner.token, {
          ...skillPackage('preserved', 'New draft'),
          expectedVersion: 2,
        })
      ).status,
    ).toBe(200);
    const conversationId = await fixture.conversation(owner.token);
    const runner = migrationDatabase.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const migration = new RemoveConversationSkills1789270000000();
      // Reconstruct the immediately preceding schema within a rolled-back test transaction.
      if (!(await runner.hasTable('api_conversation_skills'))) await migration.down(runner);
      await runner.query(
        'INSERT INTO api_conversation_skills (conversation_id, skill_id) VALUES ($1, $2)',
        [conversationId, id],
      );
      const before: unknown = await runner.query(`SELECT
        (SELECT jsonb_agg(s ORDER BY id) FROM api_skills s) AS skills,
        (SELECT jsonb_agg(v ORDER BY skill_id, version) FROM api_skill_versions v) AS versions,
        (SELECT jsonb_agg(f ORDER BY skill_id, version, path) FROM api_skill_files f) AS files,
        (SELECT jsonb_agg(c ORDER BY id) FROM api_conversations c) AS conversations`);
      await migration.up(runner);
      expect(await runner.hasTable('api_conversation_skills')).toBe(false);
      const after: unknown = await runner.query(`SELECT
        (SELECT jsonb_agg(s ORDER BY id) FROM api_skills s) AS skills,
        (SELECT jsonb_agg(v ORDER BY skill_id, version) FROM api_skill_versions v) AS versions,
        (SELECT jsonb_agg(f ORDER BY skill_id, version, path) FROM api_skill_files f) AS files,
        (SELECT jsonb_agg(c ORDER BY id) FROM api_conversations c) AS conversations`);
      expect(after).toEqual(before);
      await migration.down(runner);
      expect(await runner.query('SELECT * FROM api_conversation_skills')).toEqual([]);
      await runner.query(
        'INSERT INTO api_conversation_skills (conversation_id, skill_id) VALUES ($1, $2)',
        [conversationId, id],
      );
      const table = await runner.getTable('api_conversation_skills');
      expect(table?.foreignKeys.map((key) => key.name).sort()).toEqual([
        'fk_conversation_skills_conversation',
        'fk_conversation_skills_skill',
      ]);
      expect(table?.indices.map((index) => index.name)).toContain('idx_conversation_skills_skill');
      await migration.up(runner);
    } finally {
      await runner.rollbackTransaction();
      await runner.release();
    }
    expect((await fixture.db.driver.createSchemaBuilder().log()).upQueries).toEqual([]);
  });
});
