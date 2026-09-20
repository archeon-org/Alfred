import type {
  ExtractionRequest,
  ExtractionResult,
  ExtractionRunner,
} from '../../domain/extraction.port';
import { extractContent } from './extract-content';

/** Runs in the calling thread. For tests and tooling only: it offers no isolation. */
export class InlineExtractionRunner implements ExtractionRunner {
  run(request: ExtractionRequest): Promise<ExtractionResult> {
    return extractContent(request);
  }
}
