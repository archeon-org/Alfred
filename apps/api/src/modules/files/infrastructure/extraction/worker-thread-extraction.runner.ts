import { join } from 'node:path';
import { Worker } from 'node:worker_threads';

import type {
  ExtractionRequest,
  ExtractionResult,
  ExtractionRunner,
} from '../../domain/extraction.port';

/**
 * One short-lived worker thread per extraction. The thread has its own heap limit and is
 * terminated at the deadline, so a document built to exhaust memory or time costs one failed
 * job, not the API process that also serves execution streams (register: "streaming path stays
 * isolated"; ALF-DEC-054: "extraction cannot block AG-UI").
 */
export class WorkerThreadExtractionRunner implements ExtractionRunner {
  private readonly entry = join(__dirname, 'extraction.worker-entry.js');

  run(request: ExtractionRequest, timeoutMs: number): Promise<ExtractionResult> {
    return new Promise((resolve) => {
      const worker = new Worker(this.entry, {
        workerData: { kind: request.kind, bytes: request.bytes, limits: request.limits },
        resourceLimits: { maxOldGenerationSizeMb: 512, maxYoungGenerationSizeMb: 64 },
      });
      let settled = false;
      const settle = (result: ExtractionResult): void => {
        if (settled) return;
        settled = true;
        clearTimeout(deadline);
        void worker.terminate();
        resolve(result);
      };
      const deadline = setTimeout(() => {
        settle({ status: 'failed', failureCode: 'timeout' });
      }, timeoutMs);

      worker.once('message', (result: ExtractionResult) => {
        settle(result);
      });
      // An out-of-memory worker exits through `error`: the document was too large to read.
      worker.once('error', () => {
        settle({ status: 'failed', failureCode: 'too_large' });
      });
      worker.once('exit', () => {
        settle({ status: 'failed', failureCode: 'parser_error' });
      });
    });
  }
}
