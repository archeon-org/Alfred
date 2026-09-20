import type { ApiProblem } from './api-docs.decorators';

const label = (resource: string) =>
  `${resource.charAt(0).toUpperCase()}${resource.slice(1).replace(/_/gu, ' ')}`;

const unauthenticated: ApiProblem = {
  status: 401,
  code: 'HTTP_401',
  message: 'Authentication required',
  when: 'No `Authorization` header, or a header that is not exactly `Bearer <token>`.',
};
const invalidToken: ApiProblem = {
  status: 401,
  code: 'HTTP_401',
  message: 'Invalid or expired access token',
  when: 'The token is expired, malformed or signed by another key. Refresh the session (`POST /api/auth/refresh`) and retry once.',
};
const notAccessToken: ApiProblem = {
  status: 401,
  code: 'HTTP_401',
  message: 'Invalid access token',
  when: 'The token verifies but is not an Alfred access token (another `typ`, or a missing claim). Refreshing will not help: sign in again.',
};

/**
 * Error answers many routes share, worded once so every route says the same thing. Each one was
 * read from the code that sends it; keep the message strings identical to the source.
 */
export const PROBLEM = {
  unauthenticated,
  invalidToken,
  notAccessToken,
  /** The three `401` of the access-token guard. Every private route: `...PROBLEM.session`. */
  session: [unauthenticated, invalidToken, notAccessToken],
  /** Routes that resolve the owner scope (`TenantsService.scopeFor` and the like). */
  accountUnavailable: {
    status: 401,
    code: 'HTTP_401',
    message: 'Account is unavailable',
    when: 'The access token is valid but its account no longer exists or is disabled. Retrying cannot succeed.',
  },
  /** The feature-flag guard runs before the token check, so this `404` needs no valid token. */
  featureDisabled: (...capabilities: readonly string[]): ApiProblem => ({
    status: 404,
    code: 'HTTP_404',
    message: 'Feature is not available',
    when: `${capabilities.map((name) => `\`${name}\``).join(' or ')} is switched off on this deployment. Do not retry; \`GET /api/features\` lists the capabilities that are on.`,
  }),
  /** The same answer for an unknown, a foreign and a malformed identifier, on purpose. */
  notFound: (resource: string): ApiProblem => ({
    status: 404,
    code: `${resource}_not_found`,
    message: `${label(resource)} not found.`,
    when: `The ${resource.replace(/_/gu, ' ')} does not exist, belongs to another account, or the identifier is not a UUID. The three cases are indistinguishable by design.`,
  }),
  validation: (when: string, ...messages: readonly string[]): ApiProblem => ({
    status: 400,
    code: 'HTTP_400',
    message: messages,
    when,
  }),
  unknownField: {
    status: 400,
    code: 'HTTP_400',
    message: ['property ownerUserId should not exist'],
    when: 'The request carries a field or query parameter the route does not define. Nothing is ignored silently.',
  },
  /** `unknownField` with a name that reads naturally on the route. */
  unknownParameter: (name: string): ApiProblem => ({
    status: 400,
    code: 'HTTP_400',
    message: [`property ${name} should not exist`],
    when: 'The request carries a field or query parameter the route does not define. Nothing is ignored silently.',
  }),
  invalidCursor: {
    status: 400,
    code: 'invalid_cursor',
    message: 'Invalid pagination cursor.',
    when: 'The `cursor` was not produced by this route, was altered, or was issued for other filters. Start again from the first page.',
  },
  invalidJson: {
    status: 400,
    code: 'HTTP_400',
    message: 'Invalid JSON body.',
    when: 'The body is not valid JSON.',
  },
  /** 394 240 bytes on ordinary routes; a route with another limit uses `bodyTooLargeAt`. */
  bodyTooLarge: {
    status: 413,
    code: 'HTTP_413',
    message: 'Request body is too large.',
    when: 'The JSON body exceeds 394 240 bytes. JSON escaping counts.',
  },
  bodyTooLargeAt: (bytes: number): ApiProblem => ({
    status: 413,
    code: 'HTTP_413',
    message: 'Request body is too large.',
    when: `The JSON body exceeds ${bytes.toLocaleString('en-US').replace(/,/gu, ' ')} bytes. JSON escaping counts.`,
  }),
  forbidden: {
    status: 403,
    code: 'HTTP_403',
    message: 'Insufficient permissions',
    when: "The account's role does not allow this route.",
  },
  /** A named throttler of one route. The header is suffixed: `Retry-After-<throttler>`. */
  rateLimited: (throttler: string, when: string): ApiProblem => ({
    status: 429,
    code: 'HTTP_429',
    message: 'ThrottlerException: Too Many Requests',
    when: `${when} Wait for the number of seconds in the \`Retry-After-${throttler}\` response header.`,
  }),
  /**
   * A domain failure of status 500 or above keeps its `code`, but the filter replaces its message
   * with "Internal server error" and drops its details. Never document the service's own message.
   */
  masked: (status: number, code: string, when: string): ApiProblem => ({
    status,
    code,
    message: 'Internal server error',
    when,
  }),
  projectArchived: {
    status: 409,
    code: 'project_archived',
    message: 'Project is archived.',
    when: 'The project is archived: it can still be read, no longer written.',
  },
  projectDeleting: {
    status: 409,
    code: 'project_deleting',
    message: 'Project is being deleted.',
    when: 'The project is being deleted. Nothing can be written to it any more.',
  },
  projectImplicit: {
    status: 409,
    code: 'project_implicit',
    message: 'Convert the chat into a project before using it as one.',
    when: 'The project is the private shell of a standalone chat, not a named project.',
  },
  threadBusy: {
    status: 409,
    code: 'thread_busy',
    message: 'Stop the active execution before changing this resource.',
    when: 'An execution is still active on the resource. Stop it (`POST /api/executions/{id}/stop`) or wait for it to settle, then retry.',
  },
} as const satisfies Record<
  string,
  ApiProblem | readonly ApiProblem[] | ((...parameters: never[]) => ApiProblem)
>;

/**
 * Answers of the idempotency layer (`@Idempotent()` routes). `reconcile` ends the `409`: how a
 * caller of this route learns whether the earlier attempt happened.
 */
export const idempotencyProblems = (reconcile: string): readonly ApiProblem[] => [
  {
    status: 400,
    code: 'invalid_idempotency_key',
    message: 'Invalid Idempotency-Key',
    when: '`Idempotency-Key` is empty, longer than 128 characters, holds a character other than `A-Z a-z 0-9 _ -`, or was sent twice. Nothing ran; fix the key.',
  },
  {
    status: 409,
    code: 'idempotency_in_progress',
    message: 'This request is still in progress or requires reconciliation',
    when: `The same \`Idempotency-Key\` is still running after a 2-second wait, or its earlier attempt ended without a stored success (an error other than a validation \`400\`, or a crash). The key stays reserved for 24 hours: ${reconcile}`,
  },
  {
    status: 422,
    code: 'idempotency_mismatch',
    message: 'Idempotency-Key was used for a different request',
    when: 'This account already used the `Idempotency-Key` within 24 hours with another path, query string or body, on this route or on another one. Nothing ran; use a new key for a new intent.',
  },
];
