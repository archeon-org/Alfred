import { randomUUID } from 'node:crypto';
import { DataSource, EntitySchema, type Repository } from 'typeorm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  deleteOwnedOrThrow,
  findOwnedOrThrow,
  updateOwnedOrThrow,
} from '@api/common/ownership/find-owned';

const url = process.env.TEST_MIGRATION_DATABASE_URL;
interface Project {
  id: string;
  ownerUserId: string;
  name: string;
}
const tableName = `ownership_test_${randomUUID().replaceAll('-', '')}`;
const entity = new EntitySchema<Project>({
  name: tableName,
  tableName,
  columns: {
    id: { type: 'uuid', primary: true },
    ownerUserId: { name: 'owner_user_id', type: 'uuid' },
    name: { type: 'varchar' },
  },
});

describe.skipIf(!url)('ownership PostgreSQL predicate', () => {
  let db: DataSource;
  let repo: Repository<Project>;
  beforeAll(async () => {
    db = new DataSource({
      type: 'postgres',
      url,
      entities: [entity],
      synchronize: false,
      installExtensions: false,
    });
    await db.initialize();
    await db.query(
      `CREATE TABLE "${tableName}" (id uuid PRIMARY KEY, owner_user_id uuid NOT NULL, name varchar NOT NULL)`,
    );
    repo = db.getRepository(entity);
  });
  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DROP TABLE IF EXISTS "${tableName}"`);
      await db.destroy();
    }
  });
  it('never reads, updates or deletes another user row and handles missing identically', async () => {
    const project = { id: randomUUID(), ownerUserId: randomUUID(), name: 'Original' };
    await repo.insert(project);
    const foreign = { id: project.id, ownerUserId: randomUUID() };
    const absent = { id: randomUUID(), ownerUserId: foreign.ownerUserId };
    for (const scope of [foreign, absent]) {
      await expect(findOwnedOrThrow(repo, scope, 'project')).rejects.toMatchObject({
        code: 'project_not_found',
      });
      await expect(
        updateOwnedOrThrow(repo, scope, { name: 'Changed' }, 'project'),
      ).rejects.toMatchObject({ code: 'project_not_found' });
      await expect(deleteOwnedOrThrow(repo, scope, 'project')).rejects.toMatchObject({
        code: 'project_not_found',
      });
    }
    expect(await repo.findOneByOrFail({ id: project.id })).toEqual(project);
    await updateOwnedOrThrow(repo, project, { name: 'Owned update' }, 'project');
    expect(await findOwnedOrThrow(repo, project, 'project')).toMatchObject({
      name: 'Owned update',
    });
    await deleteOwnedOrThrow(repo, project, 'project');
    expect(await repo.count()).toBe(0);
  });
});
