import {
  authProvidersSchema,
  publicUserSchema,
  successEnvelopeSchema,
  type AuthProvider,
  type PublicUser,
  type SessionData,
} from '@alfred/contracts';
import { buildApiUrl } from '@/services/http/api-url';
import { publicApiClient } from '@/services/http/http-client';

export type SessionUser = PublicUser;
export type { SessionData } from '@alfred/contracts';
export type { AuthProvider } from '@alfred/contracts';

const authProvidersEnvelopeSchema = successEnvelopeSchema(authProvidersSchema);

function hasAsciiControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint <= 0x1f || codePoint === 0x7f);
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function responseData(value: unknown) {
  if (!isRecord(value) || value.success !== true || !isRecord(value.data)) {
    throw new Error("La réponse d'authentification est invalide.");
  }

  return value.data;
}

function parseUser(value: unknown): SessionUser {
  const parsed = publicUserSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("L'utilisateur de session est incomplet.");
  }
  return parsed.data;
}

async function readJson(response: Response) {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error("La réponse du serveur n'est pas lisible.");
  }
}

export async function refreshSession(): Promise<SessionData | null> {
  const response = await publicApiClient.request('/auth/refresh', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    method: 'POST',
  });

  if (response.status === 401) {
    return null;
  }
  if (!response.ok) {
    throw new Error('La session ne peut pas être restaurée.');
  }

  const data = responseData(await readJson(response));
  if (typeof data.accessToken !== 'string' || data.accessToken.trim() === '') {
    throw new Error("Le jeton d'accès de session est invalide.");
  }

  return Object.freeze({ accessToken: data.accessToken, user: parseUser(data.user) });
}

export async function logoutSession(): Promise<void> {
  let response: Response;
  try {
    response = await publicApiClient.request('/auth/logout', {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      method: 'POST',
    });
  } catch {
    throw new Error('La déconnexion distante a échoué.');
  }

  if (!response.ok && response.status !== 401) {
    throw new Error('La déconnexion distante a échoué.');
  }
}

export async function getAuthProviders(): Promise<readonly AuthProvider[]> {
  const response = await publicApiClient.request('/auth/providers', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
    method: 'GET',
  });
  if (!response.ok) throw new Error('Les fournisseurs de connexion sont indisponibles.');

  const parsed = authProvidersEnvelopeSchema.safeParse(await readJson(response));
  if (!parsed.success) throw new Error('La configuration des fournisseurs est invalide.');
  return parsed.data.data;
}

export function safeReturnTo(value: string | null | undefined): string {
  return value?.startsWith('/') === true &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !hasAsciiControlCharacter(value)
    ? value
    : '/app';
}

export function getProviderLoginUrl(providerId: string, returnTo = '/app'): string {
  const search = new URLSearchParams({ returnTo: safeReturnTo(returnTo) });
  return `${buildApiUrl(`/auth/providers/${encodeURIComponent(providerId)}/start`)}?${search.toString()}`;
}
