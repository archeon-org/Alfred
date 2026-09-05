import applicationDataSource from './data-source';

async function runMigrations(): Promise<void> {
  await applicationDataSource.initialize();
  try {
    await applicationDataSource.runMigrations({ transaction: 'all' });
  } finally {
    await applicationDataSource.destroy();
  }
}

void runMigrations().catch((error: unknown) => {
  console.error('Database migration failed', error);
  process.exitCode = 1;
});
