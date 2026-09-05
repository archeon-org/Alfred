import applicationDataSource from './data-source';

async function runMigrations(): Promise<void> {
  await applicationDataSource.initialize();
  try {
    // Run ordinary migrations atomically one by one while allowing explicitly
    // non-transactional migrations to use PostgreSQL CONCURRENTLY operations.
    await applicationDataSource.runMigrations({ transaction: 'each' });
  } finally {
    await applicationDataSource.destroy();
  }
}

void runMigrations().catch((error: unknown) => {
  console.error('Database migration failed', error);
  process.exitCode = 1;
});
