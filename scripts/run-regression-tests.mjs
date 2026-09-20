import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const usage =
  'Usage: node scripts/run-regression-tests.mjs api | browser | soak [10000..300000 ms]';

/** Build explicit test profiles without allowing a missing database to silently skip the gate. */
export function regressionRuns(args, environment) {
  const [mode, requestedDuration] = args;
  if (!['api', 'browser', 'soak'].includes(mode) || args.length > (mode === 'soak' ? 2 : 1)) {
    throw new Error(usage);
  }
  const {
    ALFRED_SSE_SOAK_MS: ignoredSingleDuration,
    ALFRED_MULTICHAT_SOAK_MS: ignoredConcurrentDuration,
    ...env
  } = environment;
  // Durations are selected by this command, not inherited from a previous local experiment.
  void ignoredSingleDuration;
  void ignoredConcurrentDuration;
  if (mode === 'browser') {
    return [
      ['true', '4173'],
      ['false', '4174'],
    ].map(([debug, port]) => ({
      label: `Browser regression (diagnostics ${debug === 'true' ? 'on' : 'off'})`,
      env: {
        ...env,
        CI: '1',
        VITE_DEBUG_EVENTS: debug,
        PLAYWRIGHT_BASE_URL: `http://127.0.0.1:${port}`,
      },
      args: [
        '--filter',
        '@alfred/web',
        'exec',
        'playwright',
        'test',
        'concurrent-executions.e2e.spec.ts',
        'execution-recovery.e2e.spec.ts',
        'runtime-events.e2e.spec.ts',
        '--workers=2',
        '--retries=0',
        '--trace=retain-on-failure',
        '--reporter=line',
        `--output=test-results/regression-debug-${debug === 'true' ? 'on' : 'off'}`,
      ],
    }));
  }
  const required = ['TEST_DATABASE_URL', 'TEST_MIGRATION_DATABASE_URL', 'TEST_DATABASE_ADMIN_URL'];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length > 0)
    throw new Error(`Regression database gate requires ${missing.join(', ')}`);
  const requiredEnv = { ...env, CI: '1', REQUIRE_DATABASE_E2E: 'true' };
  if (mode === 'api') {
    return [
      {
        label: 'API regression against PostgreSQL',
        env: requiredEnv,
        args: ['--filter', '@alfred/api', 'test:e2e'],
      },
    ];
  }
  const duration = Number(requestedDuration ?? '240000');
  if (!Number.isInteger(duration) || duration < 10_000 || duration > 300_000)
    throw new Error(usage);
  return [
    {
      label: `Streaming recovery soak (${duration} ms per scenario)`,
      env: {
        ...requiredEnv,
        ALFRED_SSE_SOAK_MS: String(duration),
        ALFRED_MULTICHAT_SOAK_MS: String(duration),
      },
      args: [
        '--filter',
        '@alfred/api',
        'exec',
        'vitest',
        'run',
        '--config',
        'vitest.e2e.config.mts',
        'test/integration/modules/executions/native-stream-recovery.postgres.spec.ts',
        'test/integration/modules/executions/native-multichat.postgres.spec.ts',
      ],
    },
  ];
}

function execute(run) {
  process.stdout.write(`\n${run.label}\n`);
  return new Promise((resolveResult, reject) => {
    const detached = process.platform !== 'win32';
    const child = spawn('pnpm', run.args, { cwd: root, detached, env: run.env, stdio: 'inherit' });
    const signalChild = (signal) => {
      if (child.pid === undefined) return;
      try {
        process.kill(detached ? -child.pid : child.pid, signal);
      } catch {
        // The process group may already be gone after a clean Playwright shutdown.
      }
    };
    const onInterrupt = () => signalChild('SIGINT');
    const onTerminate = () => signalChild('SIGTERM');
    process.once('SIGINT', onInterrupt);
    process.once('SIGTERM', onTerminate);
    const cleanup = () => {
      process.removeListener('SIGINT', onInterrupt);
      process.removeListener('SIGTERM', onTerminate);
    };
    child.once('error', (error) => {
      cleanup();
      reject(error);
    });
    child.once('exit', () => signalChild('SIGTERM'));
    child.once('close', (code) => {
      cleanup();
      resolveResult(code ?? 1);
    });
  });
}

export async function runRegressionTests(args, env, executeRun = execute) {
  for (const run of regressionRuns(args, env)) {
    const code = await executeRun(run);
    if (code !== 0) return code;
  }
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = await runRegressionTests(process.argv.slice(2), process.env);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Regression runner failed'}\n`,
    );
    process.exitCode = 1;
  }
}
