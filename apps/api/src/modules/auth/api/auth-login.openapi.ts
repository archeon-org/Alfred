import { authProvidersSchema, successEnvelopeSchema } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiRoute,
  type ApiProblem,
} from '../../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../../common/api-docs/api-problems';
import { AUTH_PROBLEM, ProviderParam, SET_COOKIE, STATE_COOKIE } from './auth-shared.openapi';

/** The web application composes the same envelope; the contracts export its two parts only. */
const authProviderListEnvelopeSchema = successEnvelopeSchema(authProvidersSchema);

export const DocListAuthProviders = () =>
  applyDecorators(
    ApiRoute(
      'List the sign-in providers of this deployment',
      `Public. The identity providers a user can sign in with right now. Call it before showing a sign-in screen and offer one choice per item: the \`id\` is the \`{provider}\` of \`GET /api/auth/providers/{provider}/start\`.

- Not paginated: \`data\` is the list itself, without \`items\` or \`nextCursor\`.
- A provider that is switched off is absent. An empty list means nobody can sign in on this deployment.
- Google (\`google\`) is the only provider implemented today; it is listed when the \`googleOAuth\` capability is on.`,
    ),
    ApiEnvelopeResponse({
      name: 'AuthProviderList',
      description: 'The enabled providers.',
      contract: authProviderListEnvelopeSchema,
      describe: {
        data: 'The enabled providers, sorted by `displayName`. The list itself: no `items`, no `nextCursor`.',
        'data[].id':
          'Stable identifier of the provider, to use as `{provider}` in the start route. Lower-case letters, digits and `-`.',
        'data[].displayName': 'Name to show on the sign-in choice, at most 80 characters.',
      },
      data: [{ displayName: 'Google', id: 'google' }],
      more: {
        none: { summary: 'No provider is enabled: nobody can sign in', data: [] },
      },
    }),
  );

const START_BEHAVIOUR = `Public, and meant for the browser: navigate to this URL (a link, \`window.location\`), do not call it with \`fetch\` or "Try it out", which would follow the redirect to the provider's page and fail there.

What the API does before it redirects:
- it creates a one-time login state, valid 10 minutes and stored as a hash, that remembers the provider and \`returnTo\`;
- it puts that state in the state cookie (see the \`Set-Cookie\` header of the \`302\`), so that the callback can check that the same browser comes back;
- for Google it adds a PKCE challenge (\`S256\`) and a nonce, asks for the scopes \`openid email profile\` and always shows the account chooser.

There is nothing else to call: the provider sends the browser to the callback route, which signs the user in and redirects to \`returnTo\` inside the web application. Every call creates a new state; one that is never used expires by itself.

Rate limit: on top of the general per-address limit this route has its own bucket, \`oauth-start-ip\` (300 calls per minute and per client address by default).`;

const START_PROBLEMS: readonly ApiProblem[] = [
  PROBLEM.validation(
    '`returnTo` is empty, an absolute URL, starts with `//` or holds a backslash: only a path of the web application is accepted.',
    'returnTo must be a relative application path',
  ),
  PROBLEM.validation(
    '`returnTo` holds an ASCII control character (U+0000 to U+001F, U+007F), or is given more than once.',
    'returnTo cannot contain ASCII control characters',
  ),
  PROBLEM.validation(
    '`returnTo` exceeds 2048 characters.',
    'returnTo must be shorter than or equal to 2048 characters',
  ),
  AUTH_PROBLEM.unknownParameter('redirect'),
  AUTH_PROBLEM.rateLimited('oauth-start-ip', 300, 'AUTH_OAUTH_START_IP_RATE_LIMIT_PER_MINUTE'),
];

const StartRedirect = () =>
  ApiResponse({
    status: 302,
    description:
      "The login state is created and the browser is sent to the provider's sign-in page.",
    headers: {
      Location: {
        description:
          "The provider's authorization URL, built for this attempt. For Google it carries the client identifier, the registered callback URL, the `state`, the PKCE `code_challenge`, the `nonce`, the scopes and `prompt=select_account`. Follow it as it is.",
        schema: { type: 'string', format: 'uri' },
        example:
          'https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=<client-id>&redirect_uri=<callback-url>&scope=openid%20email%20profile&state=<login-state>&code_challenge=<pkce-challenge>&code_challenge_method=S256&nonce=<nonce>&prompt=select_account',
      },
      'Set-Cookie': {
        description: `${STATE_COOKIE} Its value is the same state as in \`Location\`; the callback compares the two.`,
        schema: { type: 'string' },
        example: SET_COOKIE.setState,
      },
    },
  });

export const DocStartProviderLogin = () =>
  applyDecorators(
    ApiRoute('Start a sign-in with an identity provider', START_BEHAVIOUR),
    ProviderParam(),
    StartRedirect(),
    ApiErrors(
      PROBLEM.validation(
        '`provider` is not a lower-case identifier (letters, digits and `-`, starting with a letter).',
        'provider must match /^[a-z][a-z0-9-]*$/u regular expression',
      ),
      PROBLEM.validation(
        '`provider` exceeds 64 characters.',
        'provider must be shorter than or equal to 64 characters',
      ),
      ...START_PROBLEMS,
      AUTH_PROBLEM.providerUnavailable,
    ),
  );

export const DocStartGoogleLogin = () =>
  applyDecorators(
    ApiRoute(
      'Start a sign-in with Google',
      `Google-only form of \`GET /api/auth/providers/{provider}/start\`: same behaviour with \`google\` as the provider, under a fixed path that exists only while the \`googleOAuth\` capability is on. The two routes count their rate limit separately.

${START_BEHAVIOUR}`,
    ),
    StartRedirect(),
    ApiErrors(...START_PROBLEMS, AUTH_PROBLEM.googleDisabled),
  );
