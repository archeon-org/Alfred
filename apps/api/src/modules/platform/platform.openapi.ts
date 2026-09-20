import { featureFlagsSchema, successEnvelopeSchema } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { z } from 'zod/mini';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiRoute,
} from '../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../common/api-docs/api-problems';
import {
  FEATURE_FLAGS_ALL_OFF,
  FEATURE_FLAGS_EXAMPLE,
  featureFlagFields,
} from '../feature-flags/feature-flags.openapi';

/** No wire contract exists for this answer: this mirrors `PlatformService.getStatus()`. */
const platformStatusEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    name: z.literal('Alfred'),
    layers: z.array(z.enum(['web', 'api', 'agent'])),
    enabledCapabilities: z.array(z.enum(['orchestration', 'teams', 'skills', 'runtime-memory'])),
    features: featureFlagsSchema,
  }),
);

export const DocGetPlatformStatus = () =>
  applyDecorators(
    ApiRoute(
      'Read the platform status and its enabled capabilities',
      `A summary of this deployment for a signed-in client: the product name, its layers, the capabilities that are switched on and the full flag manifest.

- **Private**, unlike \`GET /api/features\` next to it: it needs an access token. The flags alone are public there, readable before sign-in.
- Only the token is checked, the account is not read: the answer holds nothing personal, and unlike \`GET /api/users/me\` this route never answers \`401\` "Account is unavailable".
- \`enabledCapabilities\` is derived from \`features\`, never stored: \`orchestration\` ⇐ \`agentRuntime\`, \`teams\` ⇐ \`teams\`, \`skills\` ⇐ \`skills\`, \`runtime-memory\` ⇐ \`runtimeMemory\`. The other flags have no capability name; read them in \`features\`.
- The answer is computed from the configuration read when the API starts: it is the same for every account and does not change until the API restarts. It reads no database, so it says nothing about the health of dependencies (see \`GET /health/ready\`).
- The route takes no parameter.`,
    ),
    ApiEnvelopeResponse({
      name: 'PlatformStatus',
      description: 'The deployment summary.',
      contract: platformStatusEnvelopeSchema,
      describe: {
        'data.name': 'Product name. Always `Alfred`.',
        'data.layers':
          'The application layers of the product, always `web`, `api`, `agent` in this order. A constant, not a health report: it does not say that a layer is reachable.',
        'data.enabledCapabilities':
          'Names of the switched-on capabilities among `orchestration`, `teams`, `skills` and `runtime-memory`, in this fixed order. Empty when none is on. `runtime-memory` never appears on this version, because its flag is always `false`.',
        'data.features':
          'The full flag manifest, identical to the answer of `GET /api/features`. Every flag is always present.',
        ...featureFlagFields('data.features.'),
      },
      data: {
        name: 'Alfred',
        layers: ['web', 'api', 'agent'],
        enabledCapabilities: ['orchestration', 'teams', 'skills'],
        features: FEATURE_FLAGS_EXAMPLE,
      },
      more: {
        signInOnly: {
          summary:
            'Only Google sign-in is switched on: a flag that is on, and no capability name for it',
          data: {
            name: 'Alfred',
            layers: ['web', 'api', 'agent'],
            enabledCapabilities: [],
            features: { ...FEATURE_FLAGS_ALL_OFF, googleOAuth: true },
          },
        },
      },
    }),
    // The route reads no account, so the guard's three refusals are its only errors.
    ApiErrors(...PROBLEM.session),
  );
