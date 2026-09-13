import type { SkillWriteInput } from '@alfred/contracts';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { SkillEntity } from '@api/modules/skills/infrastructure/skill.entity';
import { SkillVersionEntity } from '@api/modules/skills/infrastructure/skill-version.entity';
import { skillPackage, SkillsPostgresFixture } from './skills-postgres.fixture';

const databaseUrl = process.env.TEST_DATABASE_URL;
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL;
const postgres = databaseUrl && migrationUrl ? describe : describe.skip;

function withDescription(description: string): SkillWriteInput {
  const input = skillPackage('text-validation');
  return {
    ...input,
    description,
    files: [
      {
        ...input.files[0]!,
        contentBase64: Buffer.from(
          `---\nname: ${input.name}\ndescription: ${JSON.stringify(description)}\n---\nInstructions`,
        ).toString('base64'),
      },
    ],
  };
}
function withPaths(...paths: string[]): SkillWriteInput {
  const input = skillPackage('text-validation');
  return {
    ...input,
    files: [
      ...input.files,
      ...paths.map((path) => ({
        path,
        mediaType: 'text/plain',
        contentBase64: 'YQ==',
      })),
    ],
  };
}
const invalidPackages = [
  ['NUL description', withDescription('Analyze\0dataset')],
  ['unpaired high surrogate description', withDescription('Analyze\ud800dataset')],
  ['unpaired low surrogate description', withDescription('Analyze\udc00dataset')],
  ['unpaired high surrogate path', withPaths('assets/\ud800.txt')],
  ['unpaired low surrogate path', withPaths('assets/\udc00.txt')],
  ['paths colliding after UTF-8 replacement', withPaths('assets/\ud800.txt', 'assets/\udc00.txt')],
] as const;

postgres('skill package text persistence', () => {
  const fixture = new SkillsPostgresFixture();
  let migration: DataSource;
  beforeAll(async () => {
    migration = await new DataSource({
      type: 'postgres',
      url: migrationUrl!,
      entities: [...databaseEntities],
      migrations: [...databaseMigrations],
      migrationsTableName: API_MIGRATIONS_TABLE,
      synchronize: false,
      migrationsRun: false,
    }).initialize();
    await migration.runMigrations({ transaction: 'each' });
    await fixture.start(databaseUrl!);
  });
  afterAll(async () => {
    await fixture.close();
    if (migration?.isInitialized) await migration.destroy();
  });

  it('rejects NUL in catalogue search before passing it to PostgreSQL', async () => {
    const owner = await fixture.user();
    expect((await fixture.api('GET', '/skills?search=Analyze%00dataset', owner.token)).status).toBe(
      400,
    );
  });

  it.each(invalidPackages)('rejects %s on create without storing a skill', async (_name, input) => {
    const owner = await fixture.user();
    const result = await fixture.api('POST', '/skills', owner.token, input);
    expect(result, JSON.stringify(result)).toMatchObject({
      status: 400,
      body: { error: { code: 'skill_package_invalid' } },
    });
    expect(await fixture.db.getRepository(SkillEntity).countBy({ ownerUserId: owner.id })).toBe(0);
  });
  it.each(invalidPackages)(
    'rejects %s on update without changing bytes or CAS',
    async (_name, input) => {
      const owner = await fixture.user();
      const id = await fixture.create(owner.token, skillPackage('text-validation'));
      const before = await fixture.api('GET', `/skills/${id}`, owner.token);
      const result = await fixture.api('PUT', `/skills/${id}`, owner.token, {
        ...input,
        expectedVersion: 1,
      });
      expect(result, JSON.stringify(result)).toMatchObject({
        status: 400,
        body: { error: { code: 'skill_package_invalid' } },
      });
      expect(await fixture.api('GET', `/skills/${id}`, owner.token)).toEqual(before);
      expect(await fixture.db.getRepository(SkillVersionEntity).countBy({ skillId: id })).toBe(1);
    },
  );
  it('round-trips non-BMP descriptions and paths and accepts an unchanged save', async () => {
    const owner = await fixture.user();
    const input = withDescription('Analyze \u{1f4ca} dataset');
    const payload = {
      ...input,
      files: [...input.files, withPaths('assets/\u{1f4ca}.txt').files[1]!],
    };
    const id = await fixture.create(owner.token, payload);
    const before = await fixture.api('GET', `/skills/${id}`, owner.token);
    expect(before.body?.data).toMatchObject({
      description: payload.description,
      version: 1,
    });
    expect(before.body?.data?.files).toEqual(expect.arrayContaining(payload.files));
    expect(before.body?.data?.files).toHaveLength(payload.files.length);
    expect(
      await fixture.api('PUT', `/skills/${id}`, owner.token, { ...payload, expectedVersion: 1 }),
    ).toEqual(before);
  });
});
