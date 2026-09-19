import assert from 'node:assert/strict';
import test from 'node:test';
import { regressionRuns, runRegressionTests } from './run-regression-tests.mjs';

const database = {
  TEST_DATABASE_URL: 'postgresql://runtime:test@127.0.0.1:55445/alfred_test',
  TEST_MIGRATION_DATABASE_URL: 'postgresql://migrate:test@127.0.0.1:55445/alfred_test',
  TEST_DATABASE_ADMIN_URL: 'postgresql://admin:test@127.0.0.1:55445/alfred_test',
};

for (const mode of ['api', 'soak']) {
  for (const name of Object.keys(database)) {
    test(`${mode} refuses to report success when ${name} is missing`, () => {
      assert.throws(() => regressionRuns([mode], { ...database, [name]: ' ' }), {
        message: new RegExp(name, 'u'),
      });
    });
  }
}

test('API gate requires database suites and excludes accidental long-run settings', () => {
  const env = {
    ...database,
    REQUIRE_DATABASE_E2E: 'false',
    ALFRED_SSE_SOAK_MS: '240000',
    ALFRED_MULTICHAT_SOAK_MS: '240000',
  };
  const original = { ...env };
  const [run] = regressionRuns(['api'], env);
  assert.equal(run.env.REQUIRE_DATABASE_E2E, 'true');
  assert.equal(run.env.CI, '1');
  assert.equal(run.env.ALFRED_SSE_SOAK_MS, undefined);
  assert.equal(run.env.ALFRED_MULTICHAT_SOAK_MS, undefined);
  assert.ok(run.args.includes('test:e2e'));
  assert.deepEqual(env, original);
});

for (const duration of ['120000', '240000']) {
  test(`soak runs both recovery fixtures for ${duration} ms`, () => {
    const [run] = regressionRuns(['soak', duration], database);
    assert.equal(run.env.ALFRED_SSE_SOAK_MS, duration);
    assert.equal(run.env.ALFRED_MULTICHAT_SOAK_MS, duration);
    assert.equal(run.env.REQUIRE_DATABASE_E2E, 'true');
    assert.ok(
      run.args.includes(
        'test/integration/modules/executions/native-stream-recovery.postgres.spec.ts',
      ),
    );
    assert.ok(
      run.args.includes('test/integration/modules/executions/native-multichat.postgres.spec.ts'),
    );
  });
}

test('default soak requests a real four-minute duration', () => {
  assert.equal(regressionRuns(['soak'], database)[0].env.ALFRED_MULTICHAT_SOAK_MS, '240000');
});

for (const args of [
  [],
  ['unknown'],
  ['api', '120000'],
  ['browser', '--update-snapshots'],
  ['soak', '0'],
  ['soak', 'NaN'],
  ['soak', '10000.5'],
  ['soak', '300001'],
  ['soak', '120000', 'extra'],
]) {
  test(`rejects unsupported arguments ${JSON.stringify(args)} before execution`, () => {
    assert.throws(() => regressionRuns(args, database));
  });
}

test('browser regression covers both diagnostics profiles on fresh servers without retries', () => {
  const env = {
    VITE_DEBUG_EVENTS: 'false',
    CI: undefined,
    PLAYWRIGHT_BASE_URL: 'https://example.test',
  };
  const runs = regressionRuns(['browser'], env);
  assert.equal(runs.length, 2);
  assert.deepEqual(
    runs.map((run) => run.env.VITE_DEBUG_EVENTS),
    ['true', 'false'],
  );
  for (const run of runs) {
    assert.equal(run.env.CI, '1');
    assert.match(run.env.PLAYWRIGHT_BASE_URL, /^http:\/\/127\.0\.0\.1:417[34]$/u);
    assert.ok(run.args.includes('--retries=0'));
    assert.ok(run.args.includes('--trace=retain-on-failure'));
    assert.equal(
      run.args.some((arg) => arg.startsWith('--project=')),
      false,
    );
  }
  assert.equal(
    new Set(runs.flatMap((run) => run.args.filter((arg) => arg.startsWith('--output=')))).size,
    2,
  );
  assert.equal(env.VITE_DEBUG_EVENTS, 'false');
});

test('browser profiles use isolated preview ports', () => {
  assert.deepEqual(
    regressionRuns(['browser'], {}).map((run) => run.env.PLAYWRIGHT_BASE_URL),
    ['http://127.0.0.1:4173', 'http://127.0.0.1:4174'],
  );
});

test('browser profiles execute sequentially, preventing competing builds and preview servers', async () => {
  let active = 0;
  const seen = [];
  await runRegressionTests(['browser'], {}, async (run) => {
    active += 1;
    assert.equal(active, 1);
    await new Promise((resolve) => setImmediate(resolve));
    seen.push(run.env.VITE_DEBUG_EVENTS);
    active -= 1;
    return 0;
  });
  assert.deepEqual(seen, ['true', 'false']);
});

test('first failed child preserves its exit code and stops later profiles', async () => {
  let calls = 0;
  const result = await runRegressionTests(['browser'], {}, async () => {
    calls += 1;
    return 7;
  });
  assert.equal(result, 7);
  assert.equal(calls, 1);
});

test('a later failure cannot be hidden by an earlier passing profile', async () => {
  let calls = 0;
  const result = await runRegressionTests(['browser'], {}, async () => (++calls === 1 ? 0 : 2));
  assert.equal(result, 2);
  assert.equal(calls, 2);
});

test('missing database configuration never starts a child process', async () => {
  let called = false;
  await assert.rejects(
    runRegressionTests(['api'], {}, async () => {
      called = true;
      return 0;
    }),
  );
  assert.equal(called, false);
});
