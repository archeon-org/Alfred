import { randomBytes } from 'node:crypto';
import { constants, existsSync } from 'node:fs';
import { access, chmod, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';

const workspaceRoot = resolve(process.cwd());
const envPaths = Object.freeze({
  root: join(workspaceRoot, '.env'),
  api: join(workspaceRoot, 'apps/api/.env'),
  web: join(workspaceRoot, 'apps/web/.env'),
  agent: join(workspaceRoot, 'apps/agent/.env'),
});
const featureFlagKeys = Object.freeze([
  'FEATURE_AGENT_RUNTIME_ENABLED',
  'FEATURE_AG_UI_STREAMING_ENABLED',
  'FEATURE_FILE_UPLOADS_ENABLED',
  'FEATURE_GENERATIVE_UI_ENABLED',
  'FEATURE_GOOGLE_OAUTH_ENABLED',
  'FEATURE_MCP_APPS_ENABLED',
  'FEATURE_OUTPUT_STYLES_ENABLED',
  'FEATURE_KNOWLEDGE_SCOPE_ENABLED',
  'FEATURE_CONVERSATION_FEEDBACK_ENABLED',
  'FEATURE_OPENAPI_ENABLED',
  'FEATURE_RATE_LIMITING_ENABLED',
  'FEATURE_RUNTIME_MEMORY_ENABLED',
  'FEATURE_SKILLS_ENABLED',
  'FEATURE_TEAMS_ENABLED',
  'FEATURE_TRACE_LINKS_ENABLED',
]);
const managedSecretKeys = new Set([
  'AUTH_JWT_SECRET',
  'OBSERVABILITY_METRICS_TOKEN',
  'GOOGLE_OAUTH_CLIENT_SECRET',
]);
// PostgreSQL and Redis come from the sibling LangGraph platform stack (langgraph-agent-repo).
// Containers reach them as `postgres`/`redis` on that stack's network; host processes use loopback.
const dataServices = Object.freeze({
  hostDatabaseUrl: 'postgresql://postgres:postgres@127.0.0.1:5432/langgraph?schema=public',
  hostRedisUrl: 'redis://127.0.0.1:6379/0',
  containerDatabaseUrl: 'postgresql://postgres:postgres@postgres:5432/langgraph?schema=public',
  containerRedisUrl: 'redis://redis:6379/0',
  agentDatabaseUri: 'postgres://postgres:postgres@postgres:5432/alfred_langgraph?sslmode=disable',
  agentRedisUri: 'redis://redis:6379/1',
});
const legacyDatabaseRoles = new Set(['alfred_api', 'alfred_migrator', 'alfred_agent']);
const dataUrlKeys = new Set(['DATABASE_URL', 'REDIS_URL', 'DATABASE_URI', 'REDIS_URI']);
const placeholderFragments = ['change-me', 'changeme', 'placeholder', 'replace-with'];
const legacyGoogleCallbackUrl = 'http://localhost:3000/api/auth/google/callback';
const defaultGoogleCallbackUrl = 'http://localhost:3000/api/auth/providers/google/callback';

function parseEnvironmentFile(content) {
  return Object.fromEntries(
    content
      .split(/\r?\n/u)
      .map((line) => line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u))
      .filter((match) => match !== null)
      .map((match) => [match[1], match[2]]),
  );
}

async function readExistingEnvironment(path) {
  if (!existsSync(path)) return {};
  return parseEnvironmentFile(await readFile(path, 'utf8'));
}

function isUsableSecret(value) {
  return (
    typeof value === 'string' &&
    value.length >= 24 &&
    !placeholderFragments.some((fragment) => value.toLowerCase().includes(fragment))
  );
}

function isConfiguredValue(value) {
  return (
    typeof value === 'string' &&
    value.trim() !== '' &&
    !placeholderFragments.some((fragment) => value.toLowerCase().includes(fragment))
  );
}

function randomSecret() {
  return randomBytes(48).toString('base64url');
}

function firstUsableSecret(key, environments) {
  return environments.map((environment) => environment[key]).find(isUsableSecret) ?? randomSecret();
}

function firstValue(key, environments, fallback = '') {
  return (
    environments.map((environment) => environment[key]).find((value) => value !== undefined) ??
    fallback
  );
}

function firstNonEmptyValue(key, environments, fallback = '') {
  return environments.map((environment) => environment[key]).find(isConfiguredValue) ?? fallback;
}

function targetsRemovedDataService(value) {
  try {
    const current = new URL(value);
    const legacyRole = legacyDatabaseRoles.has(current.username);
    const legacyRedis =
      current.protocol === 'redis:' && current.username === 'default' && current.password !== '';
    const legacyHost = current.hostname === 'agent-redis';
    return legacyRole || legacyRedis || legacyHost;
  } catch {
    return false;
  }
}

function shouldReplaceManagedValue(key, value, expectedValue) {
  if (value.trim() === '') return expectedValue.trim() !== '';
  if (managedSecretKeys.has(key)) return !isUsableSecret(value);
  if (key === 'GOOGLE_OAUTH_CLIENT_ID') return !isConfiguredValue(value);
  if (key === 'GOOGLE_OAUTH_CALLBACK_URL') {
    return value === legacyGoogleCallbackUrl && value !== expectedValue;
  }
  if (expectedValue.trim() === '') return false;
  if (dataUrlKeys.has(key)) return targetsRemovedDataService(value);
  return false;
}

function renderEnvironment(lines) {
  return `${lines.join('\n')}\n`;
}

function renderFeatureFlags(flags) {
  return [
    '# Feature flags: optional product capabilities default off; operational safety defaults on.',
    `FEATURE_AGENT_RUNTIME_ENABLED=${flags.agentRuntime}`,
    `FEATURE_AG_UI_STREAMING_ENABLED=${flags.agUiStreaming}`,
    `FEATURE_FILE_UPLOADS_ENABLED=${flags.fileUploads}`,
    `FEATURE_GENERATIVE_UI_ENABLED=${flags.generativeUi}`,
    `FEATURE_GOOGLE_OAUTH_ENABLED=${flags.googleOAuth}`,
    `FEATURE_MCP_APPS_ENABLED=${flags.mcpApps}`,
    `FEATURE_OUTPUT_STYLES_ENABLED=${flags.outputStyles}`,
    `FEATURE_KNOWLEDGE_SCOPE_ENABLED=${flags.knowledgeScope}`,
    `FEATURE_CONVERSATION_FEEDBACK_ENABLED=${flags.conversationFeedback}`,
    `FEATURE_OPENAPI_ENABLED=${flags.openApi}`,
    `FEATURE_RATE_LIMITING_ENABLED=${flags.rateLimiting}`,
    `FEATURE_RUNTIME_MEMORY_ENABLED=${flags.runtimeMemory}`,
    `FEATURE_SKILLS_ENABLED=${flags.skills}`,
    `FEATURE_TEAMS_ENABLED=${flags.teams}`,
    `FEATURE_TRACE_LINKS_ENABLED=${flags.traceLinks}`,
  ];
}

async function writePrivateEnvironment(path, content) {
  await mkdir(dirname(path), { recursive: true });

  try {
    await writeFile(path, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
    console.log(`created ${path.slice(workspaceRoot.length + 1) || '.env'}`);
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
    await chmod(path, 0o600);
    console.log(`kept    ${path.slice(workspaceRoot.length + 1) || '.env'}`);
  }
}

async function synchronizeFeatureFlags(path, flags) {
  const content = await readFile(path, 'utf8');
  const environment = parseEnvironmentFile(content);
  const requiresMigration =
    environment.GOOGLE_OAUTH_ENABLED !== undefined ||
    featureFlagKeys.some((key) => environment[key] === undefined);
  if (!requiresMigration) return;

  const managedKeys = new Set([...featureFlagKeys, 'GOOGLE_OAUTH_ENABLED']);
  const preservedLines = content
    .split(/\r?\n/u)
    .filter((line) => {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=/u);
      return (
        !line.includes('GOOGLE_OAUTH_ENABLED') && (match === null || !managedKeys.has(match[1]))
      );
    })
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trimEnd();
  const configuredLines = renderFeatureFlags(flags).map((line) => {
    const key = line.match(/^([A-Z][A-Z0-9_]*)=/u)?.[1];
    return key !== undefined && environment[key] !== undefined
      ? `${key}=${environment[key]}`
      : line;
  });
  const synchronized = `${preservedLines}\n\n${configuredLines.join('\n')}\n`;

  await writeFile(path, synchronized, { encoding: 'utf8', mode: 0o600 });
  console.log(`updated feature flags in ${path.slice(workspaceRoot.length + 1) || '.env'}`);
}

async function synchronizeEnvironmentContract(path, entries) {
  const content = await readFile(path, 'utf8');
  const environment = parseEnvironmentFile(content);
  const obsoleteKeys = new Set([
    'LANGGRAPH_API_URL',
    'TRUST_PROXY',
    // In-repo PostgreSQL/Redis provisioning was removed; these credentials no longer exist.
    'POSTGRES_USER',
    'POSTGRES_PASSWORD',
    'POSTGRES_PORT',
    'MIGRATOR_DATABASE_PASSWORD',
    'API_DATABASE_PASSWORD',
    'AGENT_DATABASE_PASSWORD',
    'REDIS_API_PASSWORD',
    'AGENT_REDIS_PASSWORD',
    'REDIS_PORT',
    // The API selects native stream modes itself; the variable was never read.
    'AGENT_RUNTIME_STREAM_MODES',
  ]);
  const managedEntries = new Map(entries);
  const seenKeys = new Set();
  let replacedEmptyValue = false;
  const filteredLines = content
    .split(/\r?\n/u)
    .filter((line) => {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=/u);
      return match === null || !obsoleteKeys.has(match[1]);
    })
    .map((line) => {
      const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/u);
      if (match === null) return line;

      const value = managedEntries.get(match[1]);
      if (value === undefined) return line;
      seenKeys.add(match[1]);
      if (!shouldReplaceManagedValue(match[1], match[2], value)) return line;
      replacedEmptyValue = true;
      return `${match[1]}=${value}`;
    });
  const additions = entries.filter(([key]) => !seenKeys.has(key));
  const removedObsoleteKey = Object.keys(environment).some((key) => obsoleteKeys.has(key));
  if (additions.length === 0 && !removedObsoleteKey && !replacedEmptyValue) return;

  const synchronizedSections = [
    filteredLines
      .join('\n')
      .replace(/\n{3,}/gu, '\n\n')
      .trimEnd(),
  ];
  if (additions.length > 0) {
    synchronizedSections.push(
      '',
      '# Managed runtime defaults added by pnpm setup:env.',
      ...additions.map(([key, value]) => `${key}=${value}`),
    );
  }
  const synchronized = `${synchronizedSections.join('\n')}\n`;

  await writeFile(path, synchronized, { encoding: 'utf8', mode: 0o600 });
  console.log(`updated environment contract in ${path.slice(workspaceRoot.length + 1) || '.env'}`);
}

async function assertWorkspace() {
  const packagePath = join(workspaceRoot, 'package.json');
  await access(packagePath, constants.R_OK);
  const packageJson = JSON.parse(await readFile(packagePath, 'utf8'));

  if (packageJson.name !== 'alfred') {
    throw new Error('Run this command from the Alfred repository root.');
  }
}

await assertWorkspace();

const [rootEnvironment, apiEnvironment, webEnvironment, agentEnvironment] = await Promise.all([
  readExistingEnvironment(envPaths.root),
  readExistingEnvironment(envPaths.api),
  readExistingEnvironment(envPaths.web),
  readExistingEnvironment(envPaths.agent),
]);
const environments = [rootEnvironment, apiEnvironment, agentEnvironment];

const secrets = Object.freeze({
  jwt: firstUsableSecret('AUTH_JWT_SECRET', environments),
  metrics: firstUsableSecret('OBSERVABILITY_METRICS_TOKEN', environments),
});

function preservedDataUrl(key, fallback) {
  const current = firstNonEmptyValue(key, environments);
  return current !== '' && !targetsRemovedDataService(current) ? current : fallback;
}

const dataUrls = Object.freeze({
  rootDatabase: preservedDataUrl('DATABASE_URL', dataServices.containerDatabaseUrl),
  rootRedis: preservedDataUrl('REDIS_URL', dataServices.containerRedisUrl),
  agentDatabase: preservedDataUrl('AGENT_DATABASE_URI', dataServices.agentDatabaseUri),
  agentRedis: preservedDataUrl('AGENT_REDIS_URI', dataServices.agentRedisUri),
});

const configuredGoogleCallbackUrl = firstNonEmptyValue(
  'GOOGLE_OAUTH_CALLBACK_URL',
  environments,
  defaultGoogleCallbackUrl,
);
const google = Object.freeze({
  clientId: firstNonEmptyValue('GOOGLE_OAUTH_CLIENT_ID', environments),
  clientSecret:
    environments
      .map((environment) => environment.GOOGLE_OAUTH_CLIENT_SECRET)
      .find(isUsableSecret) ?? '',
  callbackUrl:
    configuredGoogleCallbackUrl === legacyGoogleCallbackUrl
      ? defaultGoogleCallbackUrl
      : configuredGoogleCallbackUrl,
  workspaceDomain: firstNonEmptyValue('GOOGLE_WORKSPACE_DOMAIN', environments),
});

// Development-only trace links: public address parts of the runtime's LangSmith console.
const traceLinks = Object.freeze({
  uiUrl: firstNonEmptyValue('TRACE_LINK_UI_URL', environments, 'https://smith.langchain.com'),
  organizationId: firstNonEmptyValue('TRACE_LINK_ORGANIZATION_ID', environments),
  projectId: firstNonEmptyValue('TRACE_LINK_PROJECT_ID', environments),
});

const featureFlags = Object.freeze({
  agentRuntime: firstValue('FEATURE_AGENT_RUNTIME_ENABLED', environments, 'false'),
  agUiStreaming: firstValue('FEATURE_AG_UI_STREAMING_ENABLED', environments, 'false'),
  fileUploads: firstValue('FEATURE_FILE_UPLOADS_ENABLED', environments, 'false'),
  generativeUi: firstValue('FEATURE_GENERATIVE_UI_ENABLED', environments, 'false'),
  googleOAuth: firstValue(
    'FEATURE_GOOGLE_OAUTH_ENABLED',
    environments,
    firstValue('GOOGLE_OAUTH_ENABLED', environments, 'false'),
  ),
  mcpApps: firstValue('FEATURE_MCP_APPS_ENABLED', environments, 'false'),
  outputStyles: firstValue('FEATURE_OUTPUT_STYLES_ENABLED', environments, 'false'),
  knowledgeScope: firstValue('FEATURE_KNOWLEDGE_SCOPE_ENABLED', environments, 'false'),
  conversationFeedback: firstValue('FEATURE_CONVERSATION_FEEDBACK_ENABLED', environments, 'false'),
  rateLimiting: firstValue('FEATURE_RATE_LIMITING_ENABLED', environments, 'true'),
  openApi: firstValue('FEATURE_OPENAPI_ENABLED', environments, 'true'),
  runtimeMemory: firstValue('FEATURE_RUNTIME_MEMORY_ENABLED', environments, 'false'),
  skills: firstValue('FEATURE_SKILLS_ENABLED', environments, 'false'),
  teams: firstValue('FEATURE_TEAMS_ENABLED', environments, 'false'),
  traceLinks: firstValue('FEATURE_TRACE_LINKS_ENABLED', environments, 'false'),
});

const ports = Object.freeze({
  api: firstValue('API_PORT', environments, '3000'),
  web: firstValue('WEB_PORT', [rootEnvironment, webEnvironment], '5173'),
  agent: firstValue('AGENT_PORT', environments, '2024'),
});

const runtimeDefaults = Object.freeze({
  AGENT_RUNTIME_ASSISTANT_ID: 'orchestrator',
  AGENT_RUNTIME_TITLE_ASSISTANT_ID: 'title_agent',
  // Optional cursor overrides; the API derives its default from the existing JWT secret.
  EXECUTION_CURSOR_KEY: '',
  EXECUTION_CURSOR_KEY_PREVIOUS: '',
  EXECUTION_DEADLINE_MS: '600000',
  EXECUTION_LEASE_MS: '30000',
  EXECUTION_WORKER_CONCURRENCY: '4',
  EXECUTION_WORK_LOG_CONTENT_ENABLED: 'true',
  EXECUTION_MAX_ACTIVE_PER_USER: '4',
  EXECUTION_MAX_ACTIVE_GLOBAL: '64',
  EXECUTION_COMMIT_WINDOW_MS: '500',
  EXECUTION_CURSOR_TTL_MS: '3600000',
  EXECUTION_SSE_HEARTBEAT_MS: '25000',
  EXECUTION_SSE_DRAIN_TIMEOUT_MS: '10000',
  EXECUTION_SSE_MAX_FRAME_BYTES: '2097152',
  EXECUTION_SSE_MAX_BUFFERED_BYTES: '4194304',
  EXECUTION_MAX_OBSERVERS_PER_USER: '4',
  EXECUTION_MAX_OBSERVERS_PER_INSTANCE: '128',
  EXECUTION_OBSERVER_REAUTH_MS: '25000',
});

function runtimeEntries(environment, defaultUrl) {
  return [
    ['AGENT_RUNTIME_URL', firstValue('AGENT_RUNTIME_URL', [environment], defaultUrl)],
    ...Object.entries(runtimeDefaults).map(([key, fallback]) => [
      key,
      firstValue(key, [environment, ...environments], fallback),
    ]),
  ];
}

const rootRuntimeEntries = runtimeEntries(rootEnvironment, 'http://agents-api:8000');
const apiRuntimeEntries = runtimeEntries(apiEnvironment, 'http://localhost:8000');

const rootContent = renderEnvironment([
  '# Generated by pnpm setup:env. Private local values: never commit this file.',
  'NODE_ENV=development',
  '',
  '# Shared PostgreSQL and Redis from the langgraph-agent-repo platform stack, as seen by containers.',
  `DATABASE_URL=${dataUrls.rootDatabase}`,
  `REDIS_URL=${dataUrls.rootRedis}`,
  'DATA_NETWORK=langgraph-agent-repo_agent-network',
  '',
  '# NestJS and browser session',
  `API_PORT=${ports.api}`,
  'API_PREFIX=api',
  'API_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173',
  `AUTH_JWT_SECRET=${secrets.jwt}`,
  'AUTH_JWT_ISSUER=alfred-api',
  'AUTH_JWT_AUDIENCE=alfred-web',
  'AUTH_ACCESS_TOKEN_TTL_SECONDS=300',
  'AUTH_REFRESH_TOKEN_TTL_SECONDS=2592000',
  'AUTH_SESSION_CLEANUP_INTERVAL_SECONDS=3600',
  'AUTH_SESSION_RETENTION_SECONDS=2592000',
  'AUTH_COOKIE_SECURE=false',
  'AUTH_IP_RATE_LIMIT_PER_MINUTE=6000',
  'AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE=300',
  'AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE=600',
  'AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE=1200',
  'AUTH_USER_RATE_LIMIT_PER_MINUTE=120',
  'WEB_APP_URL=http://localhost:5173',
  'CONTEXT_DOCUMENT_MAX_BYTES=65536',
  `SKILLS_MAX_FILES=${firstValue('SKILLS_MAX_FILES', environments, '50')}`,
  `SKILLS_MAX_PACKAGE_BYTES=${firstValue('SKILLS_MAX_PACKAGE_BYTES', environments, '1048576')}`,
  `SKILLS_MAX_INSTRUCTIONS_BYTES=${firstValue('SKILLS_MAX_INSTRUCTIONS_BYTES', environments, '131072')}`,
  `SKILLS_MAX_TOTAL_BYTES_PER_USER=${firstValue('SKILLS_MAX_TOTAL_BYTES_PER_USER', environments, '26214400')}`,
  'DATABASE_POOL_MAX=20',
  'DATABASE_SSL=false',
  'TRUST_PROXY_HOPS=1',
  '',
  '# Existing private LangGraph server; only the API connects to it.',
  ...rootRuntimeEntries.map(([key, value]) => `${key}=${value}`),
  '',
  '# Structured logs and opt-in Prometheus metrics.',
  'OBSERVABILITY_LOG_LEVEL=info',
  'OBSERVABILITY_METRICS_ENABLED=false',
  `OBSERVABILITY_METRICS_TOKEN=${secrets.metrics}`,
  '',
  ...renderFeatureFlags(featureFlags),
  '',
  '# External/commercial Google OAuth credentials. Workspace restriction is optional.',
  `GOOGLE_OAUTH_CLIENT_ID=${google.clientId}`,
  `GOOGLE_OAUTH_CLIENT_SECRET=${google.clientSecret}`,
  `GOOGLE_OAUTH_CALLBACK_URL=${google.callbackUrl}`,
  `GOOGLE_WORKSPACE_DOMAIN=${google.workspaceDomain}`,
  '',
  '# Trace links (development diagnostic): ids from any LangSmith trace URL, then enable the flag.',
  `TRACE_LINK_UI_URL=${traceLinks.uiUrl}`,
  `TRACE_LINK_ORGANIZATION_ID=${traceLinks.organizationId}`,
  `TRACE_LINK_PROJECT_ID=${traceLinks.projectId}`,
  '',
  '# Public web build configuration',
  `WEB_PORT=${ports.web}`,
  'VITE_API_URL=/api',
  `VITE_DEBUG_EVENTS=${firstValue('VITE_DEBUG_EVENTS', environments, 'false')}`,
  '',
  '# LangGraph local port and optional standalone Agent Server licence',
  `AGENT_PORT=${ports.agent}`,
  `LANGGRAPH_CLOUD_LICENSE_KEY=${firstValue('LANGGRAPH_CLOUD_LICENSE_KEY', environments)}`,
  '',
  '# Standalone Agent Server overlay: reserve a database and Redis logical DB on the shared services.',
  `AGENT_DATABASE_URI=${dataUrls.agentDatabase}`,
  `AGENT_REDIS_URI=${dataUrls.agentRedis}`,
]);

const apiContent = renderEnvironment([
  '# Generated by pnpm setup:env. Used by pnpm dev:api.',
  'NODE_ENV=development',
  'API_HOST=127.0.0.1',
  `API_PORT=${ports.api}`,
  'API_PREFIX=api',
  'API_CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173',
  'TRUST_PROXY_HOPS=0',
  '',
  '# Existing private LangGraph server; only the API connects to it.',
  ...apiRuntimeEntries.map(([key, value]) => `${key}=${value}`),
  '',
  '# Shared PostgreSQL from the langgraph-agent-repo stack; API tables carry the api_ prefix.',
  `DATABASE_URL=${dataServices.hostDatabaseUrl}`,
  'CONTEXT_DOCUMENT_MAX_BYTES=65536',
  `SKILLS_MAX_FILES=${firstValue('SKILLS_MAX_FILES', environments, '50')}`,
  `SKILLS_MAX_PACKAGE_BYTES=${firstValue('SKILLS_MAX_PACKAGE_BYTES', environments, '1048576')}`,
  `SKILLS_MAX_INSTRUCTIONS_BYTES=${firstValue('SKILLS_MAX_INSTRUCTIONS_BYTES', environments, '131072')}`,
  `SKILLS_MAX_TOTAL_BYTES_PER_USER=${firstValue('SKILLS_MAX_TOTAL_BYTES_PER_USER', environments, '26214400')}`,
  'DATABASE_POOL_MAX=20',
  'DATABASE_SSL=false',
  '',
  `AUTH_JWT_SECRET=${secrets.jwt}`,
  'AUTH_JWT_ISSUER=alfred-api',
  'AUTH_JWT_AUDIENCE=alfred-web',
  'AUTH_ACCESS_TOKEN_TTL_SECONDS=300',
  'AUTH_REFRESH_TOKEN_TTL_SECONDS=2592000',
  'AUTH_SESSION_CLEANUP_INTERVAL_SECONDS=3600',
  'AUTH_SESSION_RETENTION_SECONDS=2592000',
  'AUTH_COOKIE_SECURE=false',
  'AUTH_IP_RATE_LIMIT_PER_MINUTE=6000',
  'AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE=300',
  'AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE=600',
  'AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE=1200',
  'AUTH_USER_RATE_LIMIT_PER_MINUTE=120',
  'WEB_APP_URL=http://localhost:5173',
  '',
  ...renderFeatureFlags(featureFlags),
  '',
  '# External/commercial Google OAuth credentials. Workspace restriction is optional.',
  `GOOGLE_OAUTH_CLIENT_ID=${google.clientId}`,
  `GOOGLE_OAUTH_CLIENT_SECRET=${google.clientSecret}`,
  `GOOGLE_OAUTH_CALLBACK_URL=${google.callbackUrl}`,
  `GOOGLE_WORKSPACE_DOMAIN=${google.workspaceDomain}`,
  '',
  '# Trace links (development diagnostic): ids from any LangSmith trace URL, then enable the flag.',
  `TRACE_LINK_UI_URL=${traceLinks.uiUrl}`,
  `TRACE_LINK_ORGANIZATION_ID=${traceLinks.organizationId}`,
  `TRACE_LINK_PROJECT_ID=${traceLinks.projectId}`,
  '',
  `REDIS_URL=${dataServices.hostRedisUrl}`,
  '',
  '# Structured logs and opt-in Prometheus metrics.',
  'OBSERVABILITY_LOG_LEVEL=info',
  'OBSERVABILITY_METRICS_ENABLED=false',
  `OBSERVABILITY_METRICS_TOKEN=${secrets.metrics}`,
]);

const webContent = renderEnvironment([
  '# Generated by pnpm setup:env. VITE_ values are public browser configuration.',
  'VITE_API_URL=/api',
  `VITE_DEBUG_EVENTS=${firstValue('VITE_DEBUG_EVENTS', environments, 'false')}`,
  `ALFRED_DEV_API_PROXY_TARGET=http://127.0.0.1:${ports.api}`,
]);

const agentContent = renderEnvironment([
  '# Generated by pnpm setup:env for standalone Agent Server configuration.',
  '# Local pnpm dev:agent loads the repository root .env through langgraph.json.',
  `DATABASE_URI=${dataUrls.agentDatabase}`,
  `REDIS_URI=${dataUrls.agentRedis}`,
  `LANGGRAPH_CLOUD_LICENSE_KEY=${firstValue('LANGGRAPH_CLOUD_LICENSE_KEY', environments)}`,
]);

await Promise.all([
  writePrivateEnvironment(envPaths.root, rootContent),
  writePrivateEnvironment(envPaths.api, apiContent),
  writePrivateEnvironment(envPaths.web, webContent),
  writePrivateEnvironment(envPaths.agent, agentContent),
]);

await Promise.all([
  synchronizeFeatureFlags(envPaths.root, featureFlags),
  synchronizeFeatureFlags(envPaths.api, featureFlags),
]);

await Promise.all([
  synchronizeEnvironmentContract(envPaths.root, [
    ...rootRuntimeEntries,
    ['VITE_DEBUG_EVENTS', firstValue('VITE_DEBUG_EVENTS', environments, 'false')],
    ['NODE_ENV', 'development'],
    ['DATABASE_URL', dataUrls.rootDatabase],
    ['REDIS_URL', dataUrls.rootRedis],
    ['DATA_NETWORK', 'langgraph-agent-repo_agent-network'],
    ['AGENT_DATABASE_URI', dataUrls.agentDatabase],
    ['AGENT_REDIS_URI', dataUrls.agentRedis],
    ['AUTH_JWT_SECRET', secrets.jwt],
    ['AUTH_SESSION_CLEANUP_INTERVAL_SECONDS', '3600'],
    ['AUTH_SESSION_RETENTION_SECONDS', '2592000'],
    ['AUTH_IP_RATE_LIMIT_PER_MINUTE', '6000'],
    ['AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE', '300'],
    ['AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE', '600'],
    ['AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE', '1200'],
    ['AUTH_USER_RATE_LIMIT_PER_MINUTE', '120'],
    ['TRUST_PROXY_HOPS', '1'],
    ['OBSERVABILITY_LOG_LEVEL', 'info'],
    ['OBSERVABILITY_METRICS_ENABLED', 'false'],
    ['OBSERVABILITY_METRICS_TOKEN', secrets.metrics],
    ['GOOGLE_OAUTH_CLIENT_ID', google.clientId],
    ['GOOGLE_OAUTH_CLIENT_SECRET', google.clientSecret],
    ['GOOGLE_OAUTH_CALLBACK_URL', google.callbackUrl],
    ['GOOGLE_WORKSPACE_DOMAIN', google.workspaceDomain],
    ['TRACE_LINK_UI_URL', traceLinks.uiUrl],
    ['TRACE_LINK_ORGANIZATION_ID', traceLinks.organizationId],
    ['TRACE_LINK_PROJECT_ID', traceLinks.projectId],
  ]),
  synchronizeEnvironmentContract(envPaths.api, [
    ...apiRuntimeEntries,
    ['DATABASE_URL', dataServices.hostDatabaseUrl],
    ['AUTH_JWT_SECRET', secrets.jwt],
    ['AUTH_SESSION_CLEANUP_INTERVAL_SECONDS', '3600'],
    ['AUTH_SESSION_RETENTION_SECONDS', '2592000'],
    ['AUTH_IP_RATE_LIMIT_PER_MINUTE', '6000'],
    ['AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE', '300'],
    ['AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE', '600'],
    ['AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE', '1200'],
    ['AUTH_USER_RATE_LIMIT_PER_MINUTE', '120'],
    ['TRUST_PROXY_HOPS', '0'],
    ['OBSERVABILITY_LOG_LEVEL', 'info'],
    ['OBSERVABILITY_METRICS_ENABLED', 'false'],
    ['OBSERVABILITY_METRICS_TOKEN', secrets.metrics],
    ['GOOGLE_OAUTH_CLIENT_ID', google.clientId],
    ['GOOGLE_OAUTH_CLIENT_SECRET', google.clientSecret],
    ['GOOGLE_OAUTH_CALLBACK_URL', google.callbackUrl],
    ['GOOGLE_WORKSPACE_DOMAIN', google.workspaceDomain],
    ['TRACE_LINK_UI_URL', traceLinks.uiUrl],
    ['TRACE_LINK_ORGANIZATION_ID', traceLinks.organizationId],
    ['TRACE_LINK_PROJECT_ID', traceLinks.projectId],
    ['REDIS_URL', dataServices.hostRedisUrl],
  ]),
  synchronizeEnvironmentContract(envPaths.web, [
    ['VITE_API_URL', '/api'],
    ['VITE_DEBUG_EVENTS', firstValue('VITE_DEBUG_EVENTS', environments, 'false')],
    ['ALFRED_DEV_API_PROXY_TARGET', `http://127.0.0.1:${ports.api}`],
  ]),
  synchronizeEnvironmentContract(envPaths.agent, [
    ['DATABASE_URI', dataUrls.agentDatabase],
    ['REDIS_URI', dataUrls.agentRedis],
    ['LANGGRAPH_CLOUD_LICENSE_KEY', firstValue('LANGGRAPH_CLOUD_LICENSE_KEY', environments)],
  ]),
]);

console.log('Local environment files are ready. OAuth and platform credentials remain opt-in.');
