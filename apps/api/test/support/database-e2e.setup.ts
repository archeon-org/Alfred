// Every selected database suite must fail instead of silently skipping in the required gate.
if (process.env.REQUIRE_DATABASE_E2E === 'true') {
  const required = [
    'TEST_DATABASE_URL',
    'TEST_MIGRATION_DATABASE_URL',
    'TEST_DATABASE_ADMIN_URL',
  ] as const;
  const missing = required.filter((name) => !process.env[name]?.trim());
  if (missing.length > 0) {
    throw new Error(`REQUIRE_DATABASE_E2E=true requires ${missing.join(', ')}`);
  }
}
