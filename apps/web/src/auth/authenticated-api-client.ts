import type { SessionData } from '@alfred/contracts';
import { buildApiUrl } from '../lib/api-url';

type ApiPath = `/${string}`;

export interface AuthenticatedApiClientOptions {
  readonly getAccessToken: () => string | null;
  readonly refresh: () => Promise<SessionData | null>;
}

export interface AuthenticatedRequestInit extends RequestInit {
  readonly retryOnUnauthorized?: boolean;
}

export interface AuthenticatedApiClient {
  readonly request: (path: ApiPath, init?: AuthenticatedRequestInit) => Promise<Response>;
}

const automaticallyRetryableMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

export function createAuthenticatedApiClient(
  options: AuthenticatedApiClientOptions,
): AuthenticatedApiClient {
  let inFlightRefresh: Promise<SessionData | null> | null = null;

  const refreshOnce = () => {
    if (inFlightRefresh !== null) return inFlightRefresh;
    const request = options.refresh();
    inFlightRefresh = request;
    const clearRequest = () => {
      if (inFlightRefresh === request) inFlightRefresh = null;
    };
    void request.then(clearRequest, clearRequest);
    return request;
  };

  const request = async (path: ApiPath, init: AuthenticatedRequestInit = {}) => {
    assertApiPath(path);
    const { retryOnUnauthorized, ...requestInit } = init;
    const method = (requestInit.method ?? 'GET').toUpperCase();
    const response = await send(path, requestInit, options.getAccessToken());
    const mayRetry = retryOnUnauthorized ?? automaticallyRetryableMethods.has(method);
    if (response.status !== 401 || !mayRetry) return response;

    const refreshed = await refreshOnce();
    if (refreshed === null) return response;
    return send(path, requestInit, refreshed.accessToken);
  };

  return Object.freeze({ request });
}

function send(path: ApiPath, init: RequestInit, accessToken: string | null): Promise<Response> {
  const headers = new Headers(init.headers);
  if (accessToken === null) headers.delete('Authorization');
  else headers.set('Authorization', `Bearer ${accessToken}`);

  return fetch(buildApiUrl(path), {
    ...init,
    credentials: init.credentials ?? 'same-origin',
    headers,
  });
}

function assertApiPath(path: string): asserts path is ApiPath {
  if (!path.startsWith('/') || path.startsWith('//') || path.includes('\\')) {
    throw new Error('Authenticated requests require a same-origin relative API path.');
  }
}
