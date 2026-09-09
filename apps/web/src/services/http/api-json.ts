import { apiErrorSchema } from '@alfred/contracts';

/** A rejected API call with its stable business code (`project_not_found`, `HTTP_401`, …). */
export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiRequestError';
  }
}

export const JSON_HEADERS = Object.freeze({
  Accept: 'application/json',
  'Content-Type': 'application/json',
});

export async function readJsonBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new Error('La réponse du serveur n’est pas lisible.');
  }
}

/** Turns a failed response into an `ApiRequestError`, keeping the server code when present. */
export async function throwApiError(response: Response): Promise<never> {
  let code = `HTTP_${response.status}`;
  let message = 'La requête a échoué.';
  try {
    const parsed = apiErrorSchema.safeParse(await response.json());
    if (parsed.success) {
      code = parsed.data.error.code;
      const detail = parsed.data.error.message;
      message = typeof detail === 'string' ? detail : detail.join(' ');
    }
  } catch {
    // The default HTTP_<status> code and message apply.
  }
  throw new ApiRequestError(response.status, code, message);
}

interface EnvelopeSchema<T> {
  safeParse(
    value: unknown,
  ): { readonly success: true; readonly data: T } | { readonly success: false };
}

/** Validates a success envelope at the boundary and returns its `data`. */
export function parseEnvelope<T>(
  schema: EnvelopeSchema<{ readonly data: T }>,
  payload: unknown,
  invalidMessage: string,
): T {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new Error(invalidMessage);
  return parsed.data.data;
}

/** Appends the string, number and boolean members of `params` as a query string; other values are skipped. */
export function withQuery<T extends object>(path: `/${string}`, params: T): `/${string}` {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, unknown][]) {
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      search.set(key, String(value));
    }
  }
  const query = search.toString();
  return query === '' ? path : `${path}?${query}`;
}
