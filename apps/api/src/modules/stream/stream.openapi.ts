import { successEnvelopeSchema } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { z } from 'zod/mini';
import {
  ApiEnvelopeResponse,
  ApiErrors,
  ApiRoute,
} from '../../common/api-docs/api-docs.decorators';
import { PROBLEM } from '../../common/api-docs/api-problems';

/** No web contract exists for this descriptor: the schema mirrors `StreamService` exactly. */
const streamCapabilitiesEnvelopeSchema = successEnvelopeSchema(
  z.strictObject({
    protocol: z.literal('AG-UI'),
    status: z.literal('reserved'),
    transport: z.literal('SSE'),
  }),
);

export const DocGetStreamCapabilities = () =>
  applyDecorators(
    ApiRoute(
      'Read the reserved descriptor of the standalone AG-UI streaming profile',
      `A placeholder for a future standalone AG-UI streaming profile. It streams nothing and takes no input: the answer is a constant.

**On this version the route always answers \`404\`**: it belongs to the \`agUiStreaming\` capability, which is reserved and stays off whatever the deployment configures. Do not use it to detect streaming support. The event stream that exists today is \`GET /api/executions/{id}/events\`, which depends on the \`agentRuntime\` capability only.`,
    ),
    ApiEnvelopeResponse({
      name: 'StreamCapabilities',
      description: 'The constant descriptor. Not reachable while `agUiStreaming` is reserved.',
      contract: streamCapabilitiesEnvelopeSchema,
      describe: {
        'data.protocol': 'The event vocabulary the profile is reserved for. Always `AG-UI`.',
        'data.status': 'Always `reserved`: the profile is declared, not delivered.',
        'data.transport': 'The transport the profile is reserved for. Always `SSE`.',
      },
      data: { protocol: 'AG-UI', status: 'reserved', transport: 'SSE' },
    }),
    ApiErrors(...PROBLEM.session, {
      ...PROBLEM.featureDisabled('agUiStreaming'),
      when: 'Always on this version: the `agUiStreaming` capability is reserved and cannot be switched on. The capability check runs before authentication, so this is the answer with or without a token.',
    }),
  );
