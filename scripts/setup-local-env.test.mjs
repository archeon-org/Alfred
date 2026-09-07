import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const setupScript = resolve('scripts/setup-local-env.mjs');
const legacyGoogleCallback = 'http://localhost:3000/api/auth/google/callback';
const providerGoogleCallback = 'http://localhost:3000/api/auth/providers/google/callback';
const examplePaths = [
  '.env.example',
  'apps/api/.env.example',
  'apps/web/.env.example',
  'apps/agent/.env.example',
];
const generatedPaths = ['.env', 'apps/api/.env', 'apps/web/.env', 'apps/agent/.env'];

test('preserves explicit per-file rate-limit choices while adding missing flags', async (context) => {
  const workspace = await createWorkspace(context);
  await writeFile(join(workspace, '.env'), 'FEATURE_RATE_LIMITING_ENABLED=true\n');
  await writeFile(join(workspace, 'apps/api/.env'), 'FEATURE_RATE_LIMITING_ENABLED=false\n');

  await execFileAsync(process.execPath, [setupScript], { cwd: workspace });

  const root = parseEnvironment(await readFile(join(workspace, '.env'), 'utf8'));
  const api = parseEnvironment(await readFile(join(workspace, 'apps/api/.env'), 'utf8'));
  assert.equal(root.FEATURE_RATE_LIMITING_ENABLED, 'true');
  assert.equal(api.FEATURE_RATE_LIMITING_ENABLED, 'false');
});

function parseEnvironment(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/u)
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u))
      .filter((match) => match !== null)
      .map((match) => [match[1], match[2]]),
  );
}

async function createWorkspace(context) {
  const workspace = await mkdtemp(join(tmpdir(), 'alfred-env-contract-'));
  context.after(async () => rm(workspace, { recursive: true, force: true }));

  await Promise.all([
    mkdir(join(workspace, 'apps/api'), { recursive: true }),
    mkdir(join(workspace, 'apps/web'), { recursive: true }),
    mkdir(join(workspace, 'apps/agent'), { recursive: true }),
  ]);
  await writeFile(join(workspace, 'package.json'), '{"name":"alfred"}\n');
  return workspace;
}

test('fresh generation matches every versioned environment example', async (context) => {
  const workspace = await createWorkspace(context);

  await execFileAsync(process.execPath, [setupScript], { cwd: workspace });

  const [examples, generated] = await Promise.all([
    Promise.all(examplePaths.map((path) => readFile(resolve(path), 'utf8').then(parseEnvironment))),
    Promise.all(
      generatedPaths.map((path) => readFile(join(workspace, path), 'utf8').then(parseEnvironment)),
    ),
  ]);

  for (const [index, example] of examples.entries()) {
    assert.deepEqual(Object.keys(generated[index]).sort(), Object.keys(example).sort());
  }
});

test('migrates generated local environment files to the current contract', async (context) => {
  const workspace = await createWorkspace(context);

  const sharedEnvironment = [
    'POSTGRES_PASSWORD=postgres-password-that-is-long-enough',
    'MIGRATOR_DATABASE_PASSWORD=migrator-password-that-is-long-enough',
    'API_DATABASE_PASSWORD=api-password-that-is-long-enough',
    'AGENT_DATABASE_PASSWORD=agent-password-that-is-long-enough',
    'REDIS_API_PASSWORD=redis-password-that-is-long-enough',
    'AGENT_REDIS_PASSWORD=agent-redis-password-that-is-long-enough',
    'AUTH_JWT_SECRET=jwt-secret-that-is-long-enough',
    `GOOGLE_OAUTH_CALLBACK_URL=${legacyGoogleCallback}`,
  ].join('\n');

  await Promise.all([
    writeFile(join(workspace, '.env'), `${sharedEnvironment}\n`),
    writeFile(join(workspace, 'apps/api/.env'), `${sharedEnvironment}\n`),
    writeFile(join(workspace, 'apps/web/.env'), 'VITE_API_URL=/api\n'),
    writeFile(join(workspace, 'apps/agent/.env'), 'LANGGRAPH_CLOUD_LICENSE_KEY=\n'),
  ]);

  await execFileAsync(process.execPath, [setupScript], { cwd: workspace });

  const [rootEnvironment, apiEnvironment] = await Promise.all([
    readFile(join(workspace, '.env'), 'utf8').then(parseEnvironment),
    readFile(join(workspace, 'apps/api/.env'), 'utf8').then(parseEnvironment),
  ]);

  assert.equal(rootEnvironment.GOOGLE_OAUTH_CALLBACK_URL, providerGoogleCallback);
  assert.equal(apiEnvironment.GOOGLE_OAUTH_CALLBACK_URL, providerGoogleCallback);
  assert.equal(rootEnvironment.NODE_ENV, 'development');
  assert.equal(rootEnvironment.AUTH_JWT_SECRET, 'jwt-secret-that-is-long-enough');
  assert.equal(apiEnvironment.AUTH_JWT_SECRET, 'jwt-secret-that-is-long-enough');
  assert.equal(
    rootEnvironment.REDIS_URL,
    'redis://default:redis-password-that-is-long-enough@localhost:6379/0',
  );
  assert.equal(rootEnvironment.AUTH_IP_RATE_LIMIT_PER_MINUTE, '6000');
  assert.equal(apiEnvironment.AUTH_IP_RATE_LIMIT_PER_MINUTE, '6000');
  assert.equal(rootEnvironment.FEATURE_RATE_LIMITING_ENABLED, 'true');
  assert.equal(apiEnvironment.FEATURE_RATE_LIMITING_ENABLED, 'true');
});

const newFlagKeys = [
  'FEATURE_OUTPUT_STYLES_ENABLED',
  'FEATURE_KNOWLEDGE_SCOPE_ENABLED',
  'FEATURE_CONVERSATION_FEEDBACK_ENABLED',
];

test('generates all three reserved flags as false in root and API env', async (context) => {
  const workspace = await createWorkspace(context);
  await execFileAsync(process.execPath, [setupScript], { cwd: workspace });
  for (const path of ['.env', 'apps/api/.env']) {
    const environment = parseEnvironment(await readFile(join(workspace, path), 'utf8'));
    for (const key of newFlagKeys) assert.equal(environment[key], 'false');
  }
});

test('adds missing reserved flags, preserves per-file choices and is idempotent', async (context) => {
  const workspace = await createWorkspace(context);
  await writeFile(join(workspace, '.env'), 'FEATURE_OUTPUT_STYLES_ENABLED=true\n');
  await writeFile(join(workspace, 'apps/api/.env'), 'FEATURE_OUTPUT_STYLES_ENABLED=false\n');
  await execFileAsync(process.execPath, [setupScript], { cwd: workspace });
  const paths = ['.env', 'apps/api/.env'];
  const first = await Promise.all(paths.map((path) => readFile(join(workspace, path), 'utf8')));
  for (const [index, content] of first.entries()) {
    const environment = parseEnvironment(content);
    assert.equal(environment.FEATURE_OUTPUT_STYLES_ENABLED, index === 0 ? 'true' : 'false');
    for (const key of newFlagKeys.slice(1)) assert.equal(environment[key], 'false');
  }
  await execFileAsync(process.execPath, [setupScript], { cwd: workspace });
  const second = await Promise.all(paths.map((path) => readFile(join(workspace, path), 'utf8')));
  assert.deepEqual(second, first);
});
