import { publishedSkillEnvelopeSchema, publishedSkillListEnvelopeSchema } from '@alfred/contracts';
import { DataSource } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { API_MIGRATIONS_TABLE } from '@api/database/database-options';
import { databaseMigrations } from '@api/database/migrations';
import { databaseEntities } from '@api/database/typeorm.options';
import { skillPackage, SkillsPostgresFixture } from './skills-postgres.fixture';

const url = process.env.TEST_DATABASE_URL;
// Migrations require DDL privileges; HTTP requests keep the runtime DML role.
const migrationUrl = process.env.TEST_MIGRATION_DATABASE_URL ?? url;
const suite = url ? describe : describe.skip;

function instructions(detail: Record<string, unknown> | undefined): string {
  const files = detail?.files as { path: string; contentBase64: string }[];
  return Buffer.from(files.find((file) => file.path === 'SKILL.md')!.contentBase64, 'base64')
    .toString('utf8')
    .split('---\n')
    .at(-1)!;
}

suite.sequential('published skills PostgreSQL', () => {
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

  it('serves the published snapshot while a later draft, a rename included, stays private', async () => {
    const owner = await fixture.user();
    const id = await fixture.create(owner.token, skillPackage('runbook', 'Published method.'));
    await fixture.publish(owner.token, id);
    const drafted = await fixture.api('PUT', `/skills/${id}`, owner.token, {
      ...skillPackage('runbook-renamed', 'Draft method.'),
      expectedVersion: 2,
    });
    expect(drafted.status, JSON.stringify(drafted.body)).toBe(200);
    expect(drafted.body?.data).toMatchObject({ currentVersion: 2, publishedVersion: 1 });

    const detail = await fixture.api('GET', `/skills/published/${id}`, owner.token);
    expect(detail.status, JSON.stringify(detail.body)).toBe(200);
    expect(publishedSkillEnvelopeSchema.safeParse(detail.body).success).toBe(true);
    expect(detail.body?.data).toMatchObject({ id, name: 'runbook', publishedVersion: 1 });
    expect(instructions(detail.body?.data)).toBe('Published method.');
    // The authoring route still answers with the draft: the two reads are distinct on purpose.
    expect(instructions((await fixture.api('GET', `/skills/${id}`, owner.token)).body?.data)).toBe(
      'Draft method.',
    );

    const listed = await fixture.api('GET', '/skills/published', owner.token);
    expect(publishedSkillListEnvelopeSchema.safeParse(listed.body).success).toBe(true);
    expect(listed.body?.data?.items).toEqual([
      expect.objectContaining({ id, name: 'runbook', publishedVersion: 1 }),
    ]);
    expect(listed.body?.data?.items?.[0]).not.toHaveProperty('files');

    await fixture.publish(owner.token, id, 3);
    const republished = await fixture.api('GET', `/skills/published/${id}`, owner.token);
    expect(republished.body?.data).toMatchObject({ name: 'runbook-renamed', publishedVersion: 2 });
    expect(instructions(republished.body?.data)).toBe('Draft method.');
    expect(republished.body?.data?.contentHash).not.toBe(detail.body?.data?.contentHash);
  });

  it('hides never-published and disabled skills, and shows them again once available', async () => {
    const owner = await fixture.user();
    const draft = await fixture.create(owner.token, skillPackage('only-draft'));
    const disabled = await fixture.create(owner.token, skillPackage('switched-off'));
    await fixture.publish(owner.token, disabled);
    const off = await fixture.api('PUT', `/skills/${disabled}/availability`, owner.token, {
      enabled: false,
      expectedVersion: 2,
    });
    expect(off.status, JSON.stringify(off.body)).toBe(200);

    expect((await fixture.api('GET', '/skills/published', owner.token)).body?.data?.items).toEqual(
      [],
    );
    for (const id of [draft, disabled]) {
      const hidden = await fixture.api('GET', `/skills/published/${id}`, owner.token);
      expect(hidden.status).toBe(404);
      expect(hidden.body?.error?.code).toBe('skill_not_found');
    }

    await fixture.api('PUT', `/skills/${disabled}/availability`, owner.token, {
      enabled: true,
      expectedVersion: 3,
    });
    expect((await fixture.api('GET', '/skills/published', owner.token)).body?.data?.items).toEqual([
      expect.objectContaining({ id: disabled, name: 'switched-off' }),
    ]);
  });

  it('filters by the exact published name and pages without repeating a skill', async () => {
    const owner = await fixture.user();
    const ids: string[] = [];
    for (const name of ['alpha', 'alpha-two', 'beta']) {
      const id = await fixture.create(owner.token, skillPackage(name));
      await fixture.publish(owner.token, id);
      ids.push(id);
    }
    const byName = await fixture.api('GET', '/skills/published?name=alpha', owner.token);
    expect(byName.body?.data?.items?.map((item) => item.id)).toEqual([ids[0]]);
    expect(
      (await fixture.api('GET', '/skills/published?name=missing', owner.token)).body?.data?.items,
    ).toEqual([]);
    expect((await fixture.api('GET', '/skills/published?name=al%25', owner.token)).status).toBe(
      400,
    );

    const first = await fixture.api('GET', '/skills/published?limit=2', owner.token);
    const cursor = (first.body?.data as { nextCursor: string | null }).nextCursor;
    expect(first.body?.data?.items).toHaveLength(2);
    expect(cursor).toEqual(expect.any(String));
    const second = await fixture.api(
      'GET',
      `/skills/published?limit=2&cursor=${encodeURIComponent(cursor!)}`,
      owner.token,
    );
    expect(
      [...first.body!.data!.items!, ...second.body!.data!.items!].map((item) => item.id).sort(),
    ).toEqual([...ids].sort());
    expect((second.body?.data as { nextCursor: string | null }).nextCursor).toBeNull();
  });

  it('keeps another account and another tenant out, and refuses a malformed identifier', async () => {
    const owner = await fixture.user();
    const id = await fixture.create(owner.token, skillPackage('private-method'));
    await fixture.publish(owner.token, id);
    for (const stranger of [await fixture.user(), await fixture.user(await fixture.tenant())]) {
      expect(
        (await fixture.api('GET', '/skills/published', stranger.token)).body?.data?.items,
      ).toEqual([]);
      const foreign = await fixture.api('GET', `/skills/published/${id}`, stranger.token);
      expect(foreign.status).toBe(404);
      expect(foreign.body?.error?.code).toBe('skill_not_found');
    }
    // A malformed identifier names no resource: the same 404 as a foreign one (ALF-DEC-004).
    const malformed = await fixture.api('GET', '/skills/published/not-a-uuid', owner.token);
    expect(malformed.status).toBe(404);
    expect(malformed.body?.error?.code).toBe('skill_not_found');
    // The fixed segment is not swallowed by the authoring ':id' route, which answers a detail.
    expect((await fixture.api('GET', '/skills/published', owner.token)).body?.data).toHaveProperty(
      'items',
    );
    const anonymous = await fetch(`${fixture.url}/skills/published`);
    expect(anonymous.status).toBe(401);
  });
});

suite.sequential('published skills PostgreSQL with the capability off', () => {
  const fixture = new SkillsPostgresFixture();
  beforeAll(() => fixture.start(url!, false));
  afterAll(() => fixture.close());

  it('answers like every other skills route when the flag is off', async () => {
    const owner = await fixture.user();
    const list = await fixture.api('GET', '/skills/published', owner.token);
    const reference = await fixture.api('GET', '/skills', owner.token);
    expect(list.status).toBe(reference.status);
    expect(list.body?.error?.code).toBe(reference.body?.error?.code);
    expect(list.status).toBeGreaterThanOrEqual(400);
  });
});
