import { sessionDataSchema, successEnvelopeSchema } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiRoute,
  type ApiProblem,
} from '../../../common/api-docs/api-docs.decorators';
import {
  AUTH_PROBLEM,
  CookieHeader,
  OriginHeader,
  REFRESH_COOKIE,
  REFRESH_COOKIE_EXAMPLE,
  SET_COOKIE,
  responseHeader,
} from './auth-shared.openapi';

/** The contracts export the payload (`sessionDataSchema`) and the envelope builder, not the pair. */
const authSessionEnvelopeSchema = successEnvelopeSchema(sessionDataSchema);

/** A placeholder on purpose: the documentation never shows something shaped like a real token. */
const ACCESS_TOKEN = '<access-token>';

const member = {
  accessToken: ACCESS_TOKEN,
  user: {
    avatarUrl: 'https://avatars.example.test/camille-martin.png',
    displayName: 'Camille Martin',
    email: 'camille.martin@example.test',
    id: '7c1e2f4a-8b3d-4c6e-9f10-2a5b7d8e9c01',
    role: 'user',
  },
};
const administrator = {
  accessToken: ACCESS_TOKEN,
  user: {
    displayName: 'Noor Haddad',
    email: 'noor.haddad@example.test',
    id: 'b2d4f6a8-1c3e-4a5b-8d7f-9e0a1b2c3d4e',
    role: 'admin',
  },
};

const refreshUnauthorized = (message: string, when: string): ApiProblem => ({
  status: 401,
  code: 'HTTP_401',
  message,
  when,
});

const RefreshedSession = () =>
  ApiEnvelopeResponse({
    name: 'AuthSession',
    description:
      'The session is renewed: a new access token in the body, a new refresh token in the cookie.',
    contract: authSessionEnvelopeSchema,
    describe: {
      'data.accessToken':
        'Signed JWT to send as `Authorization: Bearer <token>` on private routes. Valid 5 minutes by default. Its subject is the account; keep it in memory, never in storage or in a URL.',
      'data.user': 'The signed-in account, as the provider described it at the last sign-in.',
      'data.user.id': 'Identifier of the account (UUID), stable across sign-ins.',
      'data.user.email': 'E-mail address verified by the identity provider.',
      'data.user.displayName':
        'Name given by the identity provider; the e-mail address when it gave none.',
      'data.user.avatarUrl':
        'Picture given by the identity provider. Absent, never `null`, when there is none.',
      'data.user.role':
        '`user` or `admin`. An account is created as `user`. The same value is the `role` claim of the access token.',
    },
    headers: {
      'Set-Cookie': responseHeader({
        description: `The rotated refresh token, which replaces the one that was sent. ${REFRESH_COOKIE}`,
        examples: {
          setRefresh: {
            summary: 'With `AUTH_COOKIE_SECURE=false` and the default 30 days',
            value: SET_COOKIE.setRefresh,
          },
        },
      }),
    },
    data: member,
    more: {
      administrator: {
        summary: 'An administrator whose provider gave no avatar: `avatarUrl` is absent',
        data: administrator,
      },
    },
  });

export const DocRefreshSession = () =>
  applyDecorators(
    ApiRoute(
      'Renew the session and get a new access token',
      `Needs no access token: the refresh cookie set at sign-in identifies the session. No body; from a browser, send the request with credentials (\`credentials: 'include'\`).

- **When**: once when the application loads, which is how a browser gets its first access token after the sign-in redirect, and whenever a private route answers \`401\` "Invalid or expired access token" (then retry that request once).
- **Access token**: a JWT valid 5 minutes by default (\`AUTH_ACCESS_TOKEN_TTL_SECONDS\`, 60 to 900 seconds).
- **Rotation**: every success replaces the refresh token. The cookie of the answer carries the new one, valid for a full period again (30 days by default); the one that was sent is dead.
- **One refresh at a time per cookie.** Concurrent calls are serialised, so the second one presents a token that was just rotated. That is handled as a stolen token: every session born from the same sign-in is revoked and the user must sign in again. The same happens when a call is repeated after its answer was lost.
- **On \`401\`** the cookie is cleared: show the sign-in screen. **On \`5xx\`** or a network failure the cookie is kept: retry later.
- **Same-origin guard**: the \`Origin\` header must be an origin of the web application, otherwise \`403\`.
- **From this page**: "Try it out" sends the origin of this documentation page and answers \`403\` unless that origin is listed in \`API_CORS_ORIGINS\`. To try the private routes, sign in through the web application, copy \`data.accessToken\` from the answer of its \`POST /api/auth/refresh\` call (browser developer tools, network tab) and paste it in **Authorize**, without the \`Bearer\` prefix. It stays valid 5 minutes by default; reload the web application and copy a newer one when a route answers \`401\` "Invalid or expired access token".
- **Rate limit**: its own bucket, \`refresh-ip\` (1 200 calls per minute and per client address by default), on top of the general per-address limit.`,
    ),
    OriginHeader(),
    CookieHeader({
      required: true,
      description:
        'The refresh cookie set at sign-in or by the previous refresh (`__Host-alfred_refresh` when `AUTH_COOKIE_SECURE=true`). The browser sends it by itself on a request made with credentials.',
      example: REFRESH_COOKIE_EXAMPLE,
    }),
    RefreshedSession(),
    ApiErrors(
      refreshUnauthorized(
        'Refresh session required',
        'The request carries no refresh cookie: nobody is signed in on this browser, or the request was sent without credentials. The cookie is cleared.',
      ),
      refreshUnauthorized(
        'Invalid refresh session',
        'The refresh token is unknown, expired or revoked (sign-out, replay), or the account is no longer active. The cookie is cleared: sign in again.',
      ),
      refreshUnauthorized(
        'Refresh token reuse detected',
        'The token was already rotated: a replay, a concurrent refresh or a repeated call. Every session born from the same sign-in is revoked and the cookie is cleared: sign in again.',
      ),
      AUTH_PROBLEM.originRefused,
      AUTH_PROBLEM.rateLimited('refresh-ip', 1200, 'AUTH_REFRESH_IP_RATE_LIMIT_PER_MINUTE'),
    ),
  );

export const DocLogout = () =>
  applyDecorators(
    ApiRoute(
      'Sign out of this browser',
      `Needs no access token: the refresh cookie names the session to end. No body; from a browser, send the request with credentials.

- Revokes every refresh token born from the same sign-in, then clears the refresh cookie. Sign-ins made elsewhere with the same account (another browser, another device) stay signed in.
- Idempotent: without a cookie, or with an unknown, expired or already revoked one, the answer is still \`204\` and the cookie is still cleared.
- An access token already issued is a self-contained JWT that this route cannot revoke: it stops working when it expires (5 minutes by default). Drop it from memory.
- If the revocation fails (\`5xx\`) the cookie is kept, so that the call can be repeated.
- Same-origin guard: the \`Origin\` header must be an origin of the web application, otherwise \`403\`. No dedicated rate limit.`,
    ),
    OriginHeader(),
    CookieHeader({
      required: false,
      description:
        'The refresh cookie of the session to end (`__Host-alfred_refresh` when `AUTH_COOKIE_SECURE=true`). Optional: without it nothing is revoked and the answer is the same.',
      example: REFRESH_COOKIE_EXAMPLE,
    }),
    ApiResponse({
      status: 204,
      description: 'Signed out: the session is revoked and the refresh cookie cleared. No body.',
      headers: {
        'Set-Cookie': responseHeader({
          description:
            'Clears the refresh cookie: empty value and `Expires` in 1970, with the name, `Path` and flags it was set with.',
          examples: {
            clearRefresh: {
              summary: 'With `AUTH_COOKIE_SECURE=false`',
              value: SET_COOKIE.clearRefresh,
            },
          },
        }),
      },
    }),
    ApiErrors(AUTH_PROBLEM.originRefused),
  );
