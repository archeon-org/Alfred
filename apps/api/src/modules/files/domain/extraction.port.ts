import type { FileFailureCode, FileKind } from '@alfred/contracts';

export interface ExtractionLimits {
  readonly maxPdfPages: number;
  readonly maxChars: number;
  readonly imageMaxEdgePx: number;
  readonly imageMaxInputPixels: number;
}

export interface ExtractionRequest {
  readonly kind: FileKind;
  readonly bytes: Buffer;
  readonly limits: ExtractionLimits;
}

export type ExtractionResult =
  | {
      readonly status: 'text';
      readonly text: string;
      readonly pageCount: number | null;
      readonly truncated: boolean;
    }
  | {
      readonly status: 'image';
      /** The reduced, metadata-free copy the model receives; the original stays untouched. */
      readonly derivative: Buffer;
      readonly mediaType: 'image/jpeg';
    }
  | { readonly status: 'failed'; readonly failureCode: FileFailureCode };

/**
 * Turns stored bytes into what the agent can use. CPU-heavy and fed with untrusted input, so the
 * production adapter runs it off the API's event loop with its own memory and time limits
 * (ALF-DEC-010: "CPU-heavy extraction runs in isolated workers").
 */
export interface ExtractionRunner {
  run(request: ExtractionRequest, timeoutMs: number): Promise<ExtractionResult>;
}

export const EXTRACTION_RUNNER = Symbol('EXTRACTION_RUNNER');
