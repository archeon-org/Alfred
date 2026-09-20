import type { ApiProblem } from './api-docs.decorators';

const label = (resource: string) =>
  `${resource.charAt(0).toUpperCase()}${resource.slice(1).replace(/_/gu, ' ')}`;

/** Error answers many routes share, worded once so every route says the same thing. */
export const PROBLEM = {
  /** Every private route. */
  unauthenticated: {
    status: 401,
    code: 'HTTP_401',
    message: 'Authentication required',
    when: 'No `Authorization: Bearer` header, or a header that is not exactly `Bearer <token>`.',
  },
  /** Every private route. */
  invalidToken: {
    status: 401,
    code: 'HTTP_401',
    message: 'Invalid or expired access token',
    when: 'The access token is expired, signed by another key, or not an access token. Refresh the session and retry once.',
  },
  featureDisabled: (capability: string): ApiProblem => ({
    status: 404,
    code: 'HTTP_404',
    message: 'Feature is not available',
    when: `The \`${capability}\` capability is switched off on this deployment. Do not retry; read \`GET /api/platform\` to know which capabilities are on.`,
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
  invalidCursor: {
    status: 400,
    code: 'invalid_cursor',
    message: 'Invalid pagination cursor.',
    when: 'The `cursor` was not produced by this route, was altered, or belongs to another sort order.',
  },
  invalidJson: {
    status: 400,
    code: 'HTTP_400',
    message: 'Invalid JSON body.',
    when: 'The body is not valid JSON.',
  },
  bodyTooLarge: {
    status: 413,
    code: 'HTTP_413',
    message: 'Request body is too large.',
    when: 'The JSON body exceeds the size this route accepts.',
  },
  forbidden: {
    status: 403,
    code: 'HTTP_403',
    message: 'Insufficient permissions',
    when: "The account's role does not allow this route.",
  },
} as const satisfies Record<string, ApiProblem | ((...parameters: never[]) => ApiProblem)>;
