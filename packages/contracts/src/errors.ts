import { z } from 'zod/mini';

export const API_ERROR_CODES = Object.freeze([
  'context_revision_conflict',
  'context_content_too_large',
  'context_revision_required',
  'invalid_cursor',
  'invalid_name',
  'invalid_title',
  'invalid_content',
  'invalid_update',
  'idempotency_mismatch',
  'idempotency_in_progress',
  'invalid_idempotency_key',
  'project_not_found',
  'project_busy',
  'project_archived',
  'project_implicit',
  'project_deleting',
  'project_pin_limit_reached',
  'conversation_not_found',
  'conversation_archived',
  'conversation_source_has_context',
  'conversation_move_not_allowed',
  'thread_busy',
  'invalid_status_transition',
  'message_not_found',
  'message_not_editable',
  'memory_not_found',
  'stale_revision',
  'mutation_conflict',
  'skill_not_found',
  'skill_version_conflict',
  'skill_name_conflict',
  'skill_storage_quota_exceeded',
  'skill_package_invalid',
  'skill_exists',
  'skill_conflict',
  'skill_read_only',
  'skill_identity_mismatch',
  'skill_name_reserved',
  'skill_limit_reached',
  'agent_not_found',
  'team_not_found',
  'team_exists',
  'team_too_large',
  'team_limit_reached',
  'document_not_found',
  'file_too_large',
  'unsupported_media_type',
  'quota_exceeded',
  'version_not_found',
  'storage_unavailable',
  'mcp_not_found',
  'mcp_exists',
  'mcp_limit_reached',
  'feedback_not_found',
  'feedback_not_allowed',
  'unknown_setting',
] as const);

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

// Existing validation failures use message arrays. Codes remain open for HTTP_<status>
// fallbacks and new domain errors introduced by independently delivered capabilities.
export const apiErrorSchema = z.readonly(
  z.object({
    success: z.literal(false),
    error: z.readonly(
      z.object({
        code: z.string(),
        message: z.union([z.string(), z.readonly(z.array(z.string()))]),
        details: z.optional(z.record(z.string(), z.unknown())),
      }),
    ),
  }),
);
export type ApiError = z.infer<typeof apiErrorSchema>;
