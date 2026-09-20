import {
  FILE_MAX_BYTES,
  FILE_MAX_BYTES_CEILING,
  FILE_QUOTA_BYTES_PER_USER,
} from '@alfred/contracts';
import { z } from 'zod';

const integer = (minimum: number, maximum: number, fallback: number) =>
  z.coerce.number().int().min(minimum).max(maximum).default(fallback);

/**
 * Explicit resource bounds for an untrusted input path (register: "uploads, parsers, archives
 * require explicit rate, concurrency, time, storage and cost limits"). The byte limits are the
 * owner's Revision 86 starting profile; the token limits are ALF-DEC-010's preload ceiling.
 */
export const fileUploadEnvironmentFields = {
  FILE_UPLOAD_MAX_BYTES: integer(1, FILE_MAX_BYTES_CEILING, FILE_MAX_BYTES),
  FILE_QUOTA_BYTES_PER_USER: integer(1, 10_737_418_240, FILE_QUOTA_BYTES_PER_USER),
  /** How long an upload may hold its quota reservation before it is collected. */
  FILE_PENDING_UPLOAD_TTL_MS: integer(10_000, 3_600_000, 300_000),
  FILE_UPLOAD_USER_RATE_LIMIT_PER_MINUTE: integer(1, 1_000, 20),
  /** Uploads buffered at once by one API instance: memory is this many times the file limit. */
  FILE_UPLOAD_MAX_CONCURRENT: integer(1, 16, 4),
  FILE_EXTRACTION_TIMEOUT_MS: integer(1_000, 600_000, 60_000),
  FILE_EXTRACTION_MAX_PDF_PAGES: integer(1, 5_000, 500),
  FILE_EXTRACTED_TEXT_MAX_CHARS: integer(1_000, 4_000_000, 1_000_000),
  FILE_IMAGE_MAX_EDGE_PX: integer(256, 4_096, 1_568),
  FILE_IMAGE_MAX_INPUT_PIXELS: integer(1_000_000, 268_402_689, 50_000_000),
  FILE_PROMPT_TOKENS_PER_DOCUMENT: integer(100, 200_000, 10_000),
  FILE_PROMPT_TOKENS_PER_EXECUTION: integer(100, 600_000, 30_000),
} as const;

/**
 * What one API instance may hold for uploads in flight: slots times the per-file limit. Multer
 * concatenates the chunks it received, so the transient peak is about twice this figure.
 */
export const FILE_UPLOAD_MEMORY_ENVELOPE_BYTES = 128 * 1024 * 1024;

export interface FileUploadEnvironment {
  readonly FILE_UPLOAD_MAX_BYTES: number;
  readonly FILE_UPLOAD_MAX_CONCURRENT: number;
  readonly FILE_QUOTA_BYTES_PER_USER: number;
  readonly FILE_PROMPT_TOKENS_PER_DOCUMENT: number;
  readonly FILE_PROMPT_TOKENS_PER_EXECUTION: number;
}

export function validateFileUploadEnvironment(
  environment: FileUploadEnvironment,
  context: z.RefinementCtx,
): void {
  if (environment.FILE_UPLOAD_MAX_BYTES > environment.FILE_QUOTA_BYTES_PER_USER) {
    context.addIssue({
      code: 'custom',
      message: 'A single file cannot exceed the user storage quota',
      path: ['FILE_QUOTA_BYTES_PER_USER'],
    });
  }
  if (
    environment.FILE_UPLOAD_MAX_BYTES * environment.FILE_UPLOAD_MAX_CONCURRENT >
    FILE_UPLOAD_MEMORY_ENVELOPE_BYTES
  ) {
    context.addIssue({
      code: 'custom',
      message: `FILE_UPLOAD_MAX_BYTES x FILE_UPLOAD_MAX_CONCURRENT cannot exceed ${FILE_UPLOAD_MEMORY_ENVELOPE_BYTES} bytes held in memory`,
      path: ['FILE_UPLOAD_MAX_CONCURRENT'],
    });
  }
  if (environment.FILE_PROMPT_TOKENS_PER_DOCUMENT > environment.FILE_PROMPT_TOKENS_PER_EXECUTION) {
    context.addIssue({
      code: 'custom',
      message: 'The per-document prompt budget cannot exceed the per-execution budget',
      path: ['FILE_PROMPT_TOKENS_PER_EXECUTION'],
    });
  }
}
