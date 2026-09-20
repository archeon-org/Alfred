import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ApiErrors, ApiRoute, type ApiProblem } from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';
import {
  AUTH_PROBLEM,
  CookieHeader,
  ProviderParam,
  REFRESH_COOKIE,
  SET_COOKIE,
  STATE_COOKIE,
  STATE_COOKIE_EXAMPLE,
  responseHeader,
} from './auth-shared.openapi';

const CALLBACK_BEHAVIOUR = `Public. No application calls this route: the identity provider redirects the browser here at the end of a sign-in begun with the start route. The callback URL registered at the provider (\`GOOGLE_OAUTH_CALLBACK_URL\` for Google) must point to it.

Three query parameters decide the outcome: \`state\`, always, and exactly one of \`code\` and \`error\`. The others (\`authuser\`, \`error_description\`, \`hd\`, \`iss\`, \`prompt\`, \`scope\`, \`session_state\`) are what providers append to their redirect: they are validated, then ignored.

The state cookie is read, then cleared as soon as the request passes validation, whatever happens next: a login state serves once. Two outcomes redirect to the web application (\`WEB_APP_URL\`):
- **Signed in** (\`code\`). The state is consumed, the code is exchanged with the provider and the identity it returns is verified (for Google: signed ID token, nonce, verified e-mail, and the Workspace domain when \`GOOGLE_WORKSPACE_DOMAIN\` is set). The identity is matched to its Alfred account, created on the first sign-in with the role \`user\` and a membership of the default workspace; name, e-mail and avatar are refreshed from the provider at every sign-in. A refresh session is created and its token set in the refresh cookie. Redirect to \`/auth/callback?returnTo=…\`. No token travels in a URL: the web application then calls \`POST /api/auth/refresh\` to get its first access token.
- **Refused at the provider** (\`error\`). The state is consumed and no session is created. Redirect to \`/auth/callback?error=…&returnTo=…\` with the provider's error code; \`error_description\` is never forwarded.

Every other failure is answered as a JSON error shown in the browser tab, not as a redirect. That includes \`500\` "Internal server error" when the code exchange with the provider fails (a \`code\` the provider refuses, a provider that cannot be reached, an ID token that fails its signature check): these failures are not mapped to a \`4xx\`. A failed or repeated attempt cannot be replayed: the state is consumed and the state cookie cleared, so reloading this URL answers \`401\` "Invalid OAuth state". Begin again from the start route.

Rate limit: on top of the general per-address limit this route has its own bucket, \`oauth-callback-ip\` (600 calls per minute and per client address by default).`;

const stateProblem = (message: string, when: string): ApiProblem => ({
  status: 401,
  code: 'HTTP_401',
  message,
  when,
});

const CALLBACK_PROBLEMS: readonly ApiProblem[] = [
  PROBLEM.validation(
    'The query holds both `code` and `error`, or neither of them.',
    'OAuth callback must contain exactly one of code or error',
  ),
  PROBLEM.validation(
    '`state` is shorter than 32 characters.',
    'state must be longer than or equal to 32 characters',
  ),
  PROBLEM.validation(
    '`state` is missing (with a `code` or an `error` present) or exceeds 256 characters.',
    'state must be shorter than or equal to 256 characters',
  ),
  PROBLEM.validation(
    '`code` is empty; beyond 2048 characters the message names the upper bound instead.',
    'code must be longer than or equal to 1 characters',
  ),
  PROBLEM.validation(
    '`error` is not an OAuth error code (lower-case letters, digits and `_`, starting with a letter); beyond 64 characters the message names the upper bound instead (`error must be shorter than or equal to 64 characters`).',
    'error must match /^[a-z][a-z0-9_]{0,63}$/u regular expression',
  ),
  PROBLEM.validation(
    'A parameter the provider appends is malformed or too long (`authuser`, `error_description`, `hd`, `iss`, `prompt`, `scope`, `session_state`): one message per broken parameter.',
    'iss must be a URL address',
  ),
  PROBLEM.unknownParameter('unexpected'),
  stateProblem(
    'Invalid OAuth state',
    'The state cookie is absent or differs from `state`: the browser that comes back is not the one that started, the cookie expired (10 minutes), cookies are blocked, or this URL is reloaded (the first call cleared the cookie). Begin again from the start route.',
  ),
  stateProblem(
    'Expired or reused OAuth state',
    'The cookie matches `state`, but the state is unknown, older than 10 minutes or already consumed: two callbacks racing with the same cookie, or a client that replays the cookie itself. Begin again from the start route.',
  ),
  stateProblem(
    'OAuth state does not match the provider',
    'The state was issued by the start route of another provider. Begin again from the start route of this provider.',
  ),
  stateProblem(
    'Google did not return a valid identity token',
    'Google exchanged the code without returning an ID token. The state is consumed: begin again from the start route.',
  ),
  stateProblem(
    'Google identity validation failed',
    'The Google identity cannot be trusted: nonce mismatch, e-mail not verified, or no e-mail or subject in the ID token. The state is consumed: begin again from the start route, with a Google account whose e-mail address is verified.',
  ),
  stateProblem(
    'Google Workspace domain is not allowed',
    '`GOOGLE_WORKSPACE_DOMAIN` is set and the Google account belongs to another domain, or to none. The user must choose an account of the allowed domain.',
  ),
  stateProblem(
    'Account is disabled',
    'The identity is verified but its Alfred account is not active. No session is created. Signing in again does not help: the user must contact the administrator of this deployment.',
  ),
  {
    status: 409,
    code: 'HTTP_409',
    message: 'The verified identity is already linked to another account',
    when: 'The e-mail of this identity already belongs to another Alfred account, linked to a different identity. Accounts are never merged and no session is created. Signing in again does not help: the user must contact the administrator of this deployment.',
  },
  PROBLEM.masked(
    500,
    'HTTP_500',
    'The code exchange with the provider failed: it refused `code` (forged, expired or already exchanged), could not be reached, or returned an ID token whose signature, audience or expiry check failed. These failures are not mapped to a `4xx`. The login state is already consumed and the state cookie cleared: begin again from the start route.',
  ),
  AUTH_PROBLEM.rateLimited(
    'oauth-callback-ip',
    600,
    'AUTH_OAUTH_CALLBACK_IP_RATE_LIMIT_PER_MINUTE',
  ),
];

const StateCookieHeader = () =>
  CookieHeader({
    required: true,
    description:
      'The state cookie set by the start route (`__Host-alfred_oauth_state` when `AUTH_COOKIE_SECURE=true`). The browser sends it by itself; without it the answer is `401` "Invalid OAuth state".',
    example: STATE_COOKIE_EXAMPLE,
  });

const CallbackRedirect = () =>
  ApiResponse({
    status: 302,
    description: `The browser is sent back to the web application, signed in or with the provider's error code:
- signed in: \`<WEB_APP_URL>/auth/callback?returnTo=%2Fapp\`, and the refresh cookie is set;
- refused at the provider: \`<WEB_APP_URL>/auth/callback?error=access_denied&returnTo=%2Fapp\`, and no refresh cookie.

\`returnTo\` is the value given to the start route (\`/app\` by default).`,
    headers: {
      Location: responseHeader({
        description:
          'A URL of the web application: always the `/auth/callback` page of `WEB_APP_URL`, with `returnTo` and, after a refusal, `error`.',
        format: 'uri',
        examples: {
          signedIn: {
            summary: 'Signed in',
            value: 'http://localhost:5173/auth/callback?returnTo=%2Fapp',
          },
          refused: {
            summary: 'The user refused the consent at the provider',
            value: 'http://localhost:5173/auth/callback?error=access_denied&returnTo=%2Fapp',
          },
        },
      }),
      'Set-Cookie': responseHeader({
        description: `Sent twice after a sign-in, once after a refusal.

1. The state cookie is cleared (empty value, \`Expires\` in 1970), with the name, \`Path\` and flags it was set with. ${STATE_COOKIE}
2. After a sign-in only, the refresh cookie is set. ${REFRESH_COOKIE}`,
        examples: {
          clearState: {
            summary: 'Always: the state cookie is cleared',
            value: SET_COOKIE.clearState,
          },
          setRefresh: {
            summary: 'After a sign-in: the refresh cookie is set',
            value: SET_COOKIE.setRefresh,
          },
        },
      }),
    },
  });

export const DocCompleteProviderLogin = () =>
  applyDecorators(
    ApiRoute('Complete a sign-in when the identity provider redirects back', CALLBACK_BEHAVIOUR),
    ProviderParam(),
    StateCookieHeader(),
    CallbackRedirect(),
    ApiErrors(
      PROBLEM.validation(
        '`provider` is not a lower-case identifier (letters, digits and `-`, starting with a letter); beyond 64 characters the message names the length instead.',
        'provider must match /^[a-z][a-z0-9-]*$/u regular expression',
      ),
      ...CALLBACK_PROBLEMS,
      AUTH_PROBLEM.providerUnavailable,
    ),
  );

export const DocCompleteGoogleLogin = () =>
  applyDecorators(
    ApiRoute(
      'Complete a sign-in when Google redirects back',
      `Google-only form of \`GET /api/auth/providers/{provider}/callback\`: same behaviour with \`google\` as the provider, under a fixed path that exists only while the \`googleOAuth\` capability is on. A sign-in may begin on either start route; it ends on whichever callback URL is registered at Google. The two routes count their rate limit separately.

${CALLBACK_BEHAVIOUR}`,
    ),
    StateCookieHeader(),
    CallbackRedirect(),
    ApiErrors(...CALLBACK_PROBLEMS, AUTH_PROBLEM.googleDisabled),
  );
