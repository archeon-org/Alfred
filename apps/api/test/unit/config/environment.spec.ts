import { describe, expect, it } from 'vitest';

import { parseEnvironment } from '@api/config/environment';
import { FEATURE_FLAG_ENVIRONMENT_KEYS } from '@api/modules/feature-flags/feature-flags.types';

const validEnvironment = Object.freeze({
  API_CORS_ORIGINS: 'http://localhost:5173,https://app.alfred.dev',
  API_HOST: '127.0.0.1',
  API_PORT: '3100',
  API_PREFIX: '/v1/',
  AUTH_COOKIE_SECURE: 'false',
  AUTH_JWT_SECRET: 'test-only-secret-that-is-longer-than-32-characters',
  DATABASE_URL: 'postgresql://alfred:local-password@localhost:5432/alfred_app?schema=public',
  FEATURE_GOOGLE_OAUTH_ENABLED: 'false',
  NODE_ENV: 'test',
  WEB_APP_URL: 'http://localhost:5173',
});

describe('parseEnvironment', () => {
  it('defaults the existing native runtime target and ignores the retired stream-modes variable', () => {
    expect(parseEnvironment(validEnvironment)).toMatchObject({
      AGENT_RUNTIME_ASSISTANT_ID: 'orchestrator',
      AGENT_RUNTIME_TITLE_ASSISTANT_ID: 'title_agent',
      AGENT_RUNTIME_URL: 'http://localhost:8000',
    });
    expect(
      parseEnvironment({ ...validEnvironment, AGENT_RUNTIME_TITLE_ASSISTANT_ID: ' ' }),
    ).toHaveProperty('AGENT_RUNTIME_TITLE_ASSISTANT_ID', '');
    expect(
      parseEnvironment({
        ...validEnvironment,
        AGENT_RUNTIME_STREAM_MODES: 'messages,tokens',
        AGENT_RUNTIME_URL: 'http://agents-api:8000',
      }),
    ).toMatchObject({ AGENT_RUNTIME_URL: 'http://agents-api:8000' });
    expect(parseEnvironment(validEnvironment)).not.toHaveProperty('AGENT_RUNTIME_STREAM_MODES');
    expect(() =>
      parseEnvironment({ ...validEnvironment, AGENT_RUNTIME_URL: 'agents-api' }),
    ).toThrow('AGENT_RUNTIME_URL');
  });
  it.each([
    'SKILLS_MAX_FILES',
    'SKILLS_MAX_PACKAGE_BYTES',
    'SKILLS_MAX_INSTRUCTIONS_BYTES',
    'SKILLS_MAX_TOTAL_BYTES_PER_USER',
  ])('validates the resource bound %s at startup', (key) => {
    expect(parseEnvironment(validEnvironment)).toHaveProperty(key);
    expect(() => parseEnvironment({ ...validEnvironment, [key]: '0' })).toThrow(key);
    expect(() => parseEnvironment({ ...validEnvironment, [key]: 'unbounded' })).toThrow(key);
  });
  it('bounds the memory uploads in flight may hold, and the file size the proxy lets through', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        FILE_QUOTA_BYTES_PER_USER: '104857600',
        FILE_UPLOAD_MAX_BYTES: '26214400',
        FILE_UPLOAD_MAX_CONCURRENT: '8',
      }),
    ).toThrow('FILE_UPLOAD_MAX_CONCURRENT');
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        FILE_QUOTA_BYTES_PER_USER: '104857600',
        FILE_UPLOAD_MAX_BYTES: '26214400',
        FILE_UPLOAD_MAX_CONCURRENT: '4',
      }),
    ).not.toThrow();
    // Beyond what the web proxy is sized for, a limit would be unreachable from the application.
    expect(() =>
      parseEnvironment({ ...validEnvironment, FILE_UPLOAD_MAX_BYTES: '26214401' }),
    ).toThrow('FILE_UPLOAD_MAX_BYTES');
  });

  it('rejects inconsistent file upload limits', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        FILE_UPLOAD_MAX_BYTES: '2048',
        FILE_QUOTA_BYTES_PER_USER: '1024',
      }),
    ).toThrow('FILE_QUOTA_BYTES_PER_USER');
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        FILE_PROMPT_TOKENS_PER_DOCUMENT: '5000',
        FILE_PROMPT_TOKENS_PER_EXECUTION: '1000',
      }),
    ).toThrow('FILE_PROMPT_TOKENS_PER_EXECUTION');
  });
  it('rejects inconsistent skills storage limits', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        SKILLS_MAX_PACKAGE_BYTES: '1024',
        SKILLS_MAX_INSTRUCTIONS_BYTES: '2048',
      }),
    ).toThrow('SKILLS_MAX_INSTRUCTIONS_BYTES');
    expect(() =>
      parseEnvironment({ ...validEnvironment, SKILLS_MAX_TOTAL_BYTES_PER_USER: '1024' }),
    ).toThrow('SKILLS_MAX_TOTAL_BYTES_PER_USER');
  });
  it.each([
    'FEATURE_OUTPUT_STYLES_ENABLED',
    'FEATURE_KNOWLEDGE_SCOPE_ENABLED',
    'FEATURE_CONVERSATION_FEEDBACK_ENABLED',
  ])('parses both states and defaults %s to false', (key) => {
    expect(parseEnvironment(validEnvironment)).toHaveProperty(key, false);
    expect(parseEnvironment({ ...validEnvironment, [key]: 'true' })).toHaveProperty(key, true);
    expect(parseEnvironment({ ...validEnvironment, [key]: 'false' })).toHaveProperty(key, false);
    expect(() => parseEnvironment({ ...validEnvironment, [key]: 'yes' })).toThrow(key);
  });
  it.each(Object.values(FEATURE_FLAG_ENVIRONMENT_KEYS))(
    'rejects ambiguous values for %s',
    (key) => {
      expect(() => parseEnvironment({ ...validEnvironment, [key]: 'off' })).toThrow(key);
    },
  );

  it('does not require usable credentials for explicitly disabled optional integrations', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      API_CORS_ORIGINS: 'https://alfred.example',
      AUTH_COOKIE_SECURE: true,
      FEATURE_GOOGLE_OAUTH_ENABLED: false,
      FEATURE_RATE_LIMITING_ENABLED: false,
      NODE_ENV: 'production',
      WEB_APP_URL: 'https://alfred.example',
      GOOGLE_OAUTH_CLIENT_ID: 'replace-with-client-id',
      GOOGLE_OAUTH_CLIENT_SECRET: 'replace-with-google-client-secret',
      OBSERVABILITY_METRICS_ENABLED: false,
      OBSERVABILITY_METRICS_TOKEN: 'replace-with-metrics-token-at-least-32-characters',
    });
    expect(environment.FEATURE_GOOGLE_OAUTH_ENABLED).toBe(false);
    expect(environment.OBSERVABILITY_METRICS_ENABLED).toBe(false);
  });
  it('returns an immutable, normalized and typed configuration', () => {
    const environment = parseEnvironment(validEnvironment);

    expect(environment).toEqual({
      AGENT_RUNTIME_ASSISTANT_ID: 'orchestrator',
      AGENT_RUNTIME_TITLE_ASSISTANT_ID: 'title_agent',
      AGENT_RUNTIME_URL: 'http://localhost:8000',
      API_CORS_ORIGINS: ['http://localhost:5173', 'https://app.alfred.dev'],
      API_HOST: '127.0.0.1',
      API_PORT: 3100,
      API_PREFIX: 'v1',
      AUTH_ACCESS_TOKEN_TTL_SECONDS: 300,
      AUTH_COOKIE_SECURE: false,
      AUTH_JWT_AUDIENCE: 'alfred-web',
      AUTH_IP_RATE_LIMIT_PER_MINUTE: 6000,
      AUTH_JWT_ISSUER: 'alfred-api',
      AUTH_JWT_SECRET: 'test-only-secret-that-is-longer-than-32-characters',
      AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE: 600,
      AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE: 300,
      AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE: 1200,
      AUTH_REFRESH_TOKEN_TTL_SECONDS: 2_592_000,
      AUTH_SESSION_CLEANUP_INTERVAL_SECONDS: 3_600,
      AUTH_SESSION_RETENTION_SECONDS: 2_592_000,
      AUTH_USER_RATE_LIMIT_PER_MINUTE: 120,
      CONTEXT_DOCUMENT_MAX_BYTES: 65536,
      DATABASE_POOL_MAX: 20,
      DATABASE_SSL: false,
      DATABASE_URL: 'postgresql://alfred:local-password@localhost:5432/alfred_app?schema=public',
      EXECUTION_CURSOR_KEY: 'a8ba8903ae93e4c825fe3e8d05a111315b384a245991b935616dc49b4a06cc50',
      EXECUTION_COMMIT_WINDOW_MS: 500,
      EXECUTION_CURSOR_TTL_MS: 3_600_000,
      EXECUTION_DEADLINE_MS: 600_000,
      EXECUTION_LEASE_MS: 30_000,
      EXECUTION_WORKER_CONCURRENCY: 4,
      EXECUTION_MAX_ACTIVE_PER_USER: 4,
      EXECUTION_MAX_ACTIVE_GLOBAL: 64,
      EXECUTION_SSE_HEARTBEAT_MS: 25_000,
      EXECUTION_SSE_DRAIN_TIMEOUT_MS: 10_000,
      EXECUTION_SSE_MAX_FRAME_BYTES: 2_097_152,
      EXECUTION_SSE_MAX_BUFFERED_BYTES: 4_194_304,
      EXECUTION_MAX_OBSERVERS_PER_USER: 4,
      EXECUTION_MAX_OBSERVERS_PER_INSTANCE: 128,
      EXECUTION_OBSERVER_REAUTH_MS: 25_000,
      EXECUTION_WORK_LOG_CONTENT_ENABLED: true,
      FEATURE_AGENT_RUNTIME_ENABLED: false,
      FEATURE_AG_UI_STREAMING_ENABLED: false,
      FEATURE_FILE_UPLOADS_ENABLED: false,
      FEATURE_GENERATIVE_UI_ENABLED: false,
      FEATURE_GOOGLE_OAUTH_ENABLED: false,
      FEATURE_MCP_APPS_ENABLED: false,
      FEATURE_OUTPUT_STYLES_ENABLED: false,
      FEATURE_KNOWLEDGE_SCOPE_ENABLED: false,
      FEATURE_CONVERSATION_FEEDBACK_ENABLED: false,
      FEATURE_OPENAPI_ENABLED: true,
      FEATURE_RATE_LIMITING_ENABLED: true,
      FEATURE_RUNTIME_MEMORY_ENABLED: false,
      FEATURE_SKILLS_ENABLED: false,
      FEATURE_TEAMS_ENABLED: false,
      FEATURE_TRACE_LINKS_ENABLED: false,
      FILE_EXTRACTED_TEXT_MAX_CHARS: 1_000_000,
      FILE_EXTRACTION_MAX_PDF_PAGES: 500,
      FILE_EXTRACTION_TIMEOUT_MS: 60_000,
      FILE_IMAGE_MAX_EDGE_PX: 1_568,
      FILE_IMAGE_MAX_INPUT_PIXELS: 50_000_000,
      FILE_PENDING_UPLOAD_TTL_MS: 300_000,
      FILE_PROMPT_TOKENS_PER_DOCUMENT: 10_000,
      FILE_PROMPT_TOKENS_PER_EXECUTION: 30_000,
      FILE_QUOTA_BYTES_PER_USER: 26_214_400,
      FILE_STORAGE_LOCAL_ROOT: 'var/uploads',
      FILE_UPLOAD_MAX_BYTES: 5_242_880,
      FILE_UPLOAD_MAX_CONCURRENT: 4,
      FILE_UPLOAD_USER_RATE_LIMIT_PER_MINUTE: 20,
      NODE_ENV: 'test',
      OBSERVABILITY_LOG_LEVEL: 'info',
      OBSERVABILITY_METRICS_ENABLED: false,
      REDIS_URL: 'redis://localhost:6379',
      SKILLS_MAX_FILES: 50,
      SKILLS_MAX_PACKAGE_BYTES: 1_048_576,
      SKILLS_MAX_INSTRUCTIONS_BYTES: 131_072,
      SKILLS_MAX_TOTAL_BYTES_PER_USER: 26_214_400,
      TRUST_PROXY_HOPS: 0,
      WEB_APP_URL: 'http://localhost:5173',
    });
    expect(Object.isFrozen(environment)).toBe(true);
    expect(Object.isFrozen(environment.API_CORS_ORIGINS)).toBe(true);
  });

  it('binds standalone development to loopback by default', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      API_HOST: undefined,
    });

    expect(environment.API_HOST).toBe('127.0.0.1');
  });

  it('fails fast when DATABASE_URL is absent', () => {
    const withoutDatabaseUrl = Object.fromEntries(
      Object.entries(validEnvironment).filter(([key]) => key !== 'DATABASE_URL'),
    );

    expect(() => parseEnvironment(withoutDatabaseUrl)).toThrow(/DATABASE_URL/u);
  });

  it('accepts only PostgreSQL connection URLs', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        DATABASE_URL: 'mysql://alfred:password@localhost:3306/alfred',
      }),
    ).toThrow(/DATABASE_URL/u);
  });

  it('rejects a wildcard CORS origin in production', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        API_CORS_ORIGINS: '*',
        NODE_ENV: 'production',
      }),
    ).toThrow(/API_CORS_ORIGINS/u);
  });

  it('requires HTTPS CORS origins in production', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        API_CORS_ORIGINS: 'http://alfred.example.test',
        AUTH_COOKIE_SECURE: 'true',
        NODE_ENV: 'production',
        WEB_APP_URL: 'https://alfred.example.test',
      }),
    ).toThrow(/HTTPS/u);
  });

  it('requires a strong application signing secret', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        AUTH_JWT_SECRET: 'too-short',
      }),
    ).toThrow(/AUTH_JWT_SECRET/u);
  });

  it('keeps the shared IP ceiling above the per-user ceiling', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        AUTH_IP_RATE_LIMIT_PER_MINUTE: '120',
        AUTH_USER_RATE_LIMIT_PER_MINUTE: '120',
      }),
    ).toThrow(/AUTH_IP_RATE_LIMIT_PER_MINUTE/u);
  });

  it('rejects invalid route-specific pre-authentication limits', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE: '0',
      }),
    ).toThrow(/AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE/u);
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE: '1000001',
      }),
    ).toThrow(/AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE/u);
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE: '1.5',
      }),
    ).toThrow(/AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE/u);
  });

  it('requires the complete Google OAuth configuration when the provider is enabled', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        FEATURE_GOOGLE_OAUTH_ENABLED: 'true',
        GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
      }),
    ).toThrow(/GOOGLE_OAUTH/u);
  });

  it('requires the trace console addresses when trace links are enabled', () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, FEATURE_TRACE_LINKS_ENABLED: 'true' }),
    ).toThrow(/TRACE_LINK_UI_URL is required when FEATURE_TRACE_LINKS_ENABLED is true/u);
    const environment = parseEnvironment({
      ...validEnvironment,
      FEATURE_TRACE_LINKS_ENABLED: 'true',
      TRACE_LINK_UI_URL: 'https://smith.langchain.com',
      TRACE_LINK_ORGANIZATION_ID: 'org',
      TRACE_LINK_PROJECT_ID: 'proj',
    });
    expect(environment.FEATURE_TRACE_LINKS_ENABLED).toBe(true);
    expect(environment.TRACE_LINK_PROJECT_ID).toBe('proj');
    expect(
      parseEnvironment({ ...validEnvironment, TRACE_LINK_PROJECT_ID: '' }).TRACE_LINK_PROJECT_ID,
    ).toBeUndefined();
  });

  it('refuses a trace console address carrying credentials, a query or a fragment', () => {
    for (const address of [
      'https://user:secret@smith.langchain.com',
      'https://smith.langchain.com/?token=1',
      'https://smith.langchain.com/#frag',
      'ftp://smith.langchain.com',
    ]) {
      expect(() => parseEnvironment({ ...validEnvironment, TRACE_LINK_UI_URL: address })).toThrow(
        /TRACE_LINK_UI_URL must be an http\(s\) address without credentials/u,
      );
    }
    expect(
      parseEnvironment({
        ...validEnvironment,
        TRACE_LINK_UI_URL: 'https://observability.internal/ls/',
      }).TRACE_LINK_UI_URL,
    ).toBe('https://observability.internal/ls/');
  });

  it('refuses trace console settings that leave no room for a run identifier in a link', () => {
    const settings = { TRACE_LINK_ORGANIZATION_ID: 'org', TRACE_LINK_PROJECT_ID: 'proj' };
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        ...settings,
        TRACE_LINK_UI_URL: `https://observability.internal/${'p'.repeat(900)}`,
      }),
    ).toThrow(/must leave a trace link within 2048 characters for any run identifier/u);
    expect(
      parseEnvironment({
        ...validEnvironment,
        ...settings,
        TRACE_LINK_UI_URL: `https://observability.internal/${'p'.repeat(800)}`,
      }).TRACE_LINK_UI_URL,
    ).toHaveLength(31 + 800);
  });

  it('refuses trace links in production: they are a development diagnostic', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        API_CORS_ORIGINS: 'https://alfred.example.test',
        AUTH_COOKIE_SECURE: 'true',
        NODE_ENV: 'production',
        REDIS_URL: 'redis://default:a-real-redis-password@redis:6379/0',
        WEB_APP_URL: 'https://alfred.example',
        FEATURE_TRACE_LINKS_ENABLED: 'true',
        TRACE_LINK_UI_URL: 'https://smith.langchain.com',
        TRACE_LINK_ORGANIZATION_ID: 'org',
        TRACE_LINK_PROJECT_ID: 'proj',
      }),
    ).toThrow(/must be false in production/u);
  });

  it('treats empty optional Google variables from container environments as absent', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      GOOGLE_OAUTH_CALLBACK_URL: '',
      GOOGLE_OAUTH_CLIENT_ID: '',
      GOOGLE_OAUTH_CLIENT_SECRET: '',
      GOOGLE_WORKSPACE_DOMAIN: '',
    });

    expect(environment.GOOGLE_OAUTH_CALLBACK_URL).toBeUndefined();
    expect(environment.GOOGLE_OAUTH_CLIENT_ID).toBeUndefined();
    expect(environment.GOOGLE_OAUTH_CLIENT_SECRET).toBeUndefined();
    expect(environment.GOOGLE_WORKSPACE_DOMAIN).toBeUndefined();
  });

  it('fails closed when production cookies are not secure', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        AUTH_COOKIE_SECURE: 'false',
        NODE_ENV: 'production',
        WEB_APP_URL: 'https://alfred.example.test',
      }),
    ).toThrow(/AUTH_COOKIE_SECURE/u);
  });

  it('allows commercial Google login without a Workspace restriction', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      API_CORS_ORIGINS: 'https://alfred.example',
      AUTH_COOKIE_SECURE: 'true',
      FEATURE_GOOGLE_OAUTH_ENABLED: 'true',
      GOOGLE_OAUTH_CALLBACK_URL: 'https://alfred.example/api/auth/google/callback',
      GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
      GOOGLE_OAUTH_CLIENT_SECRET: 'a-real-secret-from-the-runtime-vault',
      NODE_ENV: 'production',
      REDIS_URL: 'redis://default:a-real-redis-password@redis:6379/0',
      WEB_APP_URL: 'https://alfred.example',
    });

    expect(environment.GOOGLE_WORKSPACE_DOMAIN).toBeUndefined();
  });

  it('requires an HTTPS Google callback in production', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        API_CORS_ORIGINS: 'https://alfred.example.test',
        AUTH_COOKIE_SECURE: 'true',
        GOOGLE_OAUTH_CALLBACK_URL: 'http://api.alfred.example/auth/google/callback',
        GOOGLE_OAUTH_CLIENT_ID: 'client-id.apps.googleusercontent.com',
        GOOGLE_OAUTH_CLIENT_SECRET: 'a-real-secret-from-the-runtime-vault',
        FEATURE_GOOGLE_OAUTH_ENABLED: 'true',
        GOOGLE_WORKSPACE_DOMAIN: 'alfred.example.test',
        NODE_ENV: 'production',
        WEB_APP_URL: 'https://alfred.example.test',
      }),
    ).toThrow(/GOOGLE_OAUTH_CALLBACK_URL/u);
  });

  it('rejects committed placeholder credentials in production', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        AUTH_COOKIE_SECURE: 'true',
        AUTH_JWT_SECRET: 'replace-with-at-least-32-random-characters',
        NODE_ENV: 'production',
        WEB_APP_URL: 'https://alfred.example',
      }),
    ).toThrow(/placeholder/u);
  });

  it('requires a credentialed non-placeholder Redis URL in production', () => {
    const productionEnvironment = {
      ...validEnvironment,
      API_CORS_ORIGINS: 'https://alfred.example',
      AUTH_COOKIE_SECURE: 'true',
      NODE_ENV: 'production',
      WEB_APP_URL: 'https://alfred.example',
    };

    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        REDIS_URL: 'redis://redis:6379/0',
      }),
    ).toThrow(/REDIS_URL/u);
    expect(() =>
      parseEnvironment({
        ...productionEnvironment,
        REDIS_URL: 'redis://default:replace-with-a-random-password@redis:6379/0',
      }),
    ).toThrow(/placeholder/u);
  });

  it('bounds the access-token revocation window to fifteen minutes', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        AUTH_ACCESS_TOKEN_TTL_SECONDS: '901',
      }),
    ).toThrow(/AUTH_ACCESS_TOKEN_TTL_SECONDS/u);
  });

  it('keeps replay tombstones for at least one refresh-token lifetime', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        AUTH_REFRESH_TOKEN_TTL_SECONDS: '2592000',
        AUTH_SESSION_RETENTION_SECONDS: '604800',
      }),
    ).toThrow(/AUTH_SESSION_RETENTION_SECONDS/u);

    expect(
      parseEnvironment({
        ...validEnvironment,
        AUTH_REFRESH_TOKEN_TTL_SECONDS: '2592000',
        AUTH_SESSION_RETENTION_SECONDS: '2592000',
      }).AUTH_SESSION_RETENTION_SECONDS,
    ).toBe(2_592_000);
  });

  it('rejects invalid feature flag values instead of enabling them implicitly', () => {
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        FEATURE_SKILLS_ENABLED: 'yes',
      }),
    ).toThrow(/FEATURE_SKILLS_ENABLED/u);
    expect(() =>
      parseEnvironment({
        ...validEnvironment,
        FEATURE_RATE_LIMITING_ENABLED: 'off',
      }),
    ).toThrow(/FEATURE_RATE_LIMITING_ENABLED/u);
  });

  it('accepts only an explicit bounded number of trusted reverse-proxy hops', () => {
    expect(parseEnvironment({ ...validEnvironment, TRUST_PROXY_HOPS: '1' }).TRUST_PROXY_HOPS).toBe(
      1,
    );
    expect(() => parseEnvironment({ ...validEnvironment, TRUST_PROXY_HOPS: '-1' })).toThrow(
      /TRUST_PROXY_HOPS/u,
    );
  });

  it('requires a dedicated secret when the metrics endpoint is enabled', () => {
    expect(() =>
      parseEnvironment({ ...validEnvironment, OBSERVABILITY_METRICS_ENABLED: 'true' }),
    ).toThrow(/OBSERVABILITY_METRICS_TOKEN/u);

    expect(
      parseEnvironment({
        ...validEnvironment,
        OBSERVABILITY_METRICS_ENABLED: 'true',
        OBSERVABILITY_METRICS_TOKEN: 'metrics-only-secret-that-is-longer-than-32-characters',
      }).OBSERVABILITY_METRICS_ENABLED,
    ).toBe(true);
  });

  it('allows production startup without Redis credentials when rate limiting is explicitly disabled', () => {
    const environment = parseEnvironment({
      ...validEnvironment,
      API_CORS_ORIGINS: 'https://alfred.example',
      AUTH_COOKIE_SECURE: 'true',
      FEATURE_RATE_LIMITING_ENABLED: 'false',
      NODE_ENV: 'production',
      REDIS_URL: 'redis://redis:6379/0',
      WEB_APP_URL: 'https://alfred.example',
    });

    expect(environment.FEATURE_RATE_LIMITING_ENABLED).toBe(false);
    expect(environment.REDIS_URL).toBe('redis://redis:6379/0');
  });
});
