import type { DataSource } from 'typeorm';

import applicationDataSource from './data-source';

export async function checkSchemaDrift(dataSource: DataSource): Promise<void> {
  let initialized = false;

  try {
    await dataSource.initialize();
    initialized = true;

    if (await dataSource.showMigrations()) {
      throw new Error('Database schema has pending migrations');
    }

    const schema = await dataSource.driver.createSchemaBuilder().log();
    if (schema.upQueries.length > 0) {
      const generatedSql = schema.upQueries.map(({ query }) => query).join('\n');
      throw new Error(`Database entity metadata has schema drift:\n${generatedSql}`);
    }
  } finally {
    if (initialized) await dataSource.destroy();
  }
}

if (require.main === module) {
  void checkSchemaDrift(applicationDataSource).catch((error: unknown) => {
    console.error('Database schema drift check failed', error);
    process.exitCode = 1;
  });
}
