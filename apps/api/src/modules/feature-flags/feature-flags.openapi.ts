import { featureFlagsSchema, successEnvelopeSchema, type FeatureFlagName } from '@alfred/contracts';
import { applyDecorators } from '@nestjs/common';
import { ApiEnvelopeResponse, ApiRoute } from '../../common/api-docs/api-docs.decorators';

/** No envelope contract is exported for the flags; the browser builds this same one. */
const featureFlagsEnvelopeSchema = successEnvelopeSchema(featureFlagsSchema);

const OFF_ANSWER = 'While `false`, these routes answer `404` "Feature is not available".';
const reserved = (capability: string) =>
  `Reserved for ${capability}, which is not delivered on this version: always \`false\`, whatever the deployment configures.`;

const FEATURE_FLAG_FIELDS: Readonly<Record<FeatureFlagName, string>> = {
  agentRuntime: `Chat executions: \`GET /api/conversations/{id}/messages\`, \`/api/conversations/{id}/executions\` and every \`/api/executions/{id}\` route, the event stream included. ${OFF_ANSWER}`,
  agUiStreaming: `${reserved('the standalone AG-UI streaming profile')} \`GET /api/stream/capabilities\` therefore always answers \`404\`.`,
  fileUploads: `The personal file library, \`/api/files\` and \`/api/files/folders\`, and attaching its files to a message. ${OFF_ANSWER}`,
  generativeUi: reserved('generative UI'),
  googleOAuth: `Sign-in with Google: \`/api/auth/google/start\` and \`/api/auth/google/callback\`. ${OFF_ANSWER}`,
  mcpApps: reserved('MCP apps'),
  outputStyles: reserved('output styles'),
  knowledgeScope: reserved('the knowledge scope'),
  conversationFeedback: reserved('feedback on a conversation'),
  runtimeMemory: reserved('the runtime memory'),
  skills: `Personal skills: every \`/api/skills\` route. ${OFF_ANSWER}`,
  teams: `The specialist agent catalog: \`GET /api/agents\`. ${OFF_ANSWER}`,
  traceLinks: `The link from an execution to its trace: \`GET /api/executions/{id}/trace-link\`, which needs \`agentRuntime\` too. ${OFF_ANSWER}`,
};

/** The flag descriptions under a prefix: `data.` here, `data.features.` in the platform status. */
export const featureFlagFields = (prefix: string): Readonly<Record<string, string>> =>
  Object.fromEntries(
    Object.entries(FEATURE_FLAG_FIELDS).map(([flag, text]) => [`${prefix}${flag}`, text]),
  );

/** A deployment with chat, files, Google sign-in, skills and the agent catalog switched on. */
export const FEATURE_FLAGS_EXAMPLE: Readonly<Record<FeatureFlagName, boolean>> = {
  agentRuntime: true,
  agUiStreaming: false,
  fileUploads: true,
  generativeUi: false,
  googleOAuth: true,
  mcpApps: false,
  outputStyles: false,
  knowledgeScope: false,
  conversationFeedback: false,
  runtimeMemory: false,
  skills: true,
  teams: true,
  traceLinks: false,
};

/** Every capability is off unless the deployment switches it on. */
export const FEATURE_FLAGS_ALL_OFF = Object.fromEntries(
  Object.keys(FEATURE_FLAGS_EXAMPLE).map((flag) => [flag, false]),
);

export const DocGetFeatureFlags = () =>
  applyDecorators(
    ApiRoute(
      'Read which capabilities this deployment offers',
      `The capability switches of this deployment, one boolean per capability. **Public**: no token is needed, so a client can read it before sign-in and show only what the deployment offers.

- Every flag is always present. \`true\` means the capability is delivered on this version **and** switched on by the deployment; every capability is off by default.
- The values are computed when the API starts and do not change until it restarts: read them once per session rather than before every call.
- The routes of a capability that is \`false\` answer \`404\` with the message "Feature is not available". Do not retry them.
- Operational switches (rate limiting, this documentation) are not capabilities and are not listed.
- The route takes no parameter and has no error of its own. The same flags are part of \`GET /api/platform/status\`, which needs a token.`,
    ),
    ApiEnvelopeResponse({
      name: 'FeatureFlagsManifest',
      description: 'The capability switches of this deployment.',
      contract: featureFlagsEnvelopeSchema,
      describe: featureFlagFields('data.'),
      data: FEATURE_FLAGS_EXAMPLE,
      more: {
        allOff: {
          summary: 'A deployment with its default configuration: every capability is off',
          data: FEATURE_FLAGS_ALL_OFF,
        },
      },
    }),
  );
