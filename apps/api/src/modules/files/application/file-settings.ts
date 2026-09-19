import type { ConfigService } from '@nestjs/config';
import { z } from 'zod';

import { fileUploadEnvironmentFields } from '../../../config/file-uploads';

export const FILE_SETTINGS = Symbol('FILE_SETTINGS');

/** The validated upload bounds, read once: every limit a request is checked against. */
export interface FileSettings {
  readonly maxFileBytes: number;
  readonly quotaBytesPerUser: number;
  readonly pendingUploadTtlMs: number;
  readonly maxConcurrentUploads: number;
  /**
   * How long a multipart body may take to arrive. A slot is held for as long as a client cares
   * to trickle, so the slowest client still served is one that sends the largest file at
   * 64 KiB/s, and never less than thirty seconds.
   */
  readonly uploadBodyDeadlineMs: number;
  readonly extractionTimeoutMs: number;
  readonly maxPdfPages: number;
  readonly maxExtractedChars: number;
  readonly imageMaxEdgePx: number;
  readonly imageMaxInputPixels: number;
  readonly promptTokensPerDocument: number;
  readonly promptTokensPerExecution: number;
}

const MIN_BODY_BYTES_PER_SECOND = 64 * 1024;
const MIN_BODY_DEADLINE_MS = 30_000;

export function uploadBodyDeadlineMs(maxFileBytes: number): number {
  return Math.max(
    MIN_BODY_DEADLINE_MS,
    Math.ceil((maxFileBytes / MIN_BODY_BYTES_PER_SECOND) * 1_000),
  );
}

const schema = z.object(fileUploadEnvironmentFields);

/**
 * Parsed with the startup schema rather than read key by key, so that a composition which does
 * not load the full environment (a focused test module) still gets the documented defaults.
 */
export function readFileSettings(config: ConfigService): FileSettings {
  const values = schema.parse(
    Object.fromEntries(
      Object.keys(fileUploadEnvironmentFields).map((key) => [key, config.get<unknown>(key)]),
    ),
  );
  return Object.freeze({
    maxFileBytes: values.FILE_UPLOAD_MAX_BYTES,
    quotaBytesPerUser: values.FILE_QUOTA_BYTES_PER_USER,
    pendingUploadTtlMs: values.FILE_PENDING_UPLOAD_TTL_MS,
    maxConcurrentUploads: values.FILE_UPLOAD_MAX_CONCURRENT,
    uploadBodyDeadlineMs: uploadBodyDeadlineMs(values.FILE_UPLOAD_MAX_BYTES),
    extractionTimeoutMs: values.FILE_EXTRACTION_TIMEOUT_MS,
    maxPdfPages: values.FILE_EXTRACTION_MAX_PDF_PAGES,
    maxExtractedChars: values.FILE_EXTRACTED_TEXT_MAX_CHARS,
    imageMaxEdgePx: values.FILE_IMAGE_MAX_EDGE_PX,
    imageMaxInputPixels: values.FILE_IMAGE_MAX_INPUT_PIXELS,
    promptTokensPerDocument: values.FILE_PROMPT_TOKENS_PER_DOCUMENT,
    promptTokensPerExecution: values.FILE_PROMPT_TOKENS_PER_EXECUTION,
  });
}
