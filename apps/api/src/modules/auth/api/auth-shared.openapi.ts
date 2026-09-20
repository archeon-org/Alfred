import { ApiHeader, ApiParam } from '@nestjs/swagger';
import type { ApiProblem } from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';

/** Placeholders on purpose: no real state, token or cookie value is ever documented. */
const STATE_PLACEHOLDER = '<login-state>';
const REFRESH_PLACEHOLDER = '<opaque-refresh-token>';

/** How `AuthCookieService` names and scopes a cookie in its two modes. */
const cookieModes = (name: string) =>
  `Named \`${name}\` with \`Path=/api/auth\` (the API prefix followed by \`/auth\`) when \`AUTH_COOKIE_SECURE=false\`, the development default; named \`__Host-${name}\` with \`Path=/\` and \`Secure\` when \`AUTH_COOKIE_SECURE=true\`. Always \`HttpOnly\` and \`SameSite=Lax\`, never readable by scripts.`;

export const STATE_COOKIE = `**State cookie**: the one-time login state, \`Max-Age=600\` (10 minutes). ${cookieModes('alfred_oauth_state')}`;
export const REFRESH_COOKIE = `**Refresh cookie**: the opaque refresh token of the session, \`Max-Age\` = \`AUTH_REFRESH_TOKEN_TTL_SECONDS\` (2 592 000 seconds, 30 days, by default). ${cookieModes('alfred_refresh')}`;

export const SET_COOKIE = {
  setState: `alfred_oauth_state=${STATE_PLACEHOLDER}; Max-Age=600; Path=/api/auth; Expires=Sun, 20 Sep 2026 17:50:25 GMT; HttpOnly; SameSite=Lax`,
  clearState:
    'alfred_oauth_state=; Path=/api/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
  setRefresh: `alfred_refresh=${REFRESH_PLACEHOLDER}; Max-Age=2592000; Path=/api/auth; Expires=Tue, 20 Oct 2026 17:40:25 GMT; HttpOnly; SameSite=Lax`,
  clearRefresh:
    'alfred_refresh=; Path=/api/auth; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Lax',
} as const;

export const ProviderParam = () =>
  ApiParam({
    name: 'provider',
    description:
      'Identifier of a sign-in provider, the `id` listed by `GET /api/auth/providers`. Lower-case letters, digits and `-`, starting with a letter, at most 64 characters.',
    schema: { type: 'string', pattern: '^[a-z][a-z0-9-]*$', maxLength: 64, example: 'google' },
  });

/** Browsers refuse to let a script set `Cookie` or `Origin`: both are documented, neither can be typed in. */
const BROWSER_OWNED =
  'A browser attaches the cookie by itself and ignores a value typed here; the value shown is a placeholder.';

export const CookieHeader = (options: {
  readonly required: boolean;
  readonly description: string;
  readonly example: string;
}) =>
  ApiHeader({
    name: 'Cookie',
    required: options.required,
    description: options.required
      ? `${options.description} ${BROWSER_OWNED}`
      : `${options.description} ${BROWSER_OWNED} Example: \`${options.example}\`.`,
    ...(options.required ? { schema: { type: 'string', example: options.example } } : {}),
  });

export const STATE_COOKIE_EXAMPLE = `alfred_oauth_state=${STATE_PLACEHOLDER}`;
export const REFRESH_COOKIE_EXAMPLE = `alfred_refresh=${REFRESH_PLACEHOLDER}`;

export const OriginHeader = () =>
  ApiHeader({
    name: 'Origin',
    required: true,
    description:
      'Origin of the calling page. It must equal, character for character, one of the origins of the web application configured in `API_CORS_ORIGINS` (`http://localhost:5173` by default). A browser sets it by itself on a `POST` and ignores a value typed here, so "Try it out" sends the origin of this documentation page and answers `403` unless that origin is configured too. Any other client must send the header itself.',
    schema: { type: 'string', example: 'http://localhost:5173' },
  });

export const AUTH_PROBLEM = {
  originRefused: {
    status: 403,
    code: 'HTTP_403',
    message: 'Request origin is not allowed',
    when: 'The `Origin` header is absent or is not one of the origins listed in `API_CORS_ORIGINS`. Checked before the cookie is read: nothing is rotated, revoked or cleared.',
  },
  providerUnavailable: {
    status: 404,
    code: 'HTTP_404',
    message: 'Authentication provider is unavailable',
    when: 'No provider has this identifier, or it is switched off on this deployment. Use an `id` listed by `GET /api/auth/providers`.',
  },
  googleDisabled: PROBLEM.featureDisabled('googleOAuth'),
  unknownParameter: (name: string): ApiProblem => ({
    ...PROBLEM.unknownField,
    message: [`property ${name} should not exist`],
  }),
  /** A dedicated bucket is counted per route and per client address, apart from the general limit. */
  rateLimited: (bucket: string, perMinute: number, variable: string): ApiProblem => ({
    status: 429,
    code: 'HTTP_429',
    message: 'ThrottlerException: Too Many Requests',
    when: `Too many calls of this route from one client address within 60 seconds: its dedicated bucket \`${bucket}\` allows ${perMinute} per minute by default (\`${variable}\`), on top of the general per-address limit. Wait for the number of seconds given by the \`Retry-After-${bucket}\` header.`,
  }),
} as const satisfies Record<string, ApiProblem | ((...parameters: never[]) => ApiProblem)>;
