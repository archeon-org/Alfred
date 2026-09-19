import { parentPort, workerData } from 'node:worker_threads';

import type { ExtractionRequest } from '../../domain/extraction.port';
import { extractContent } from './extract-content';

interface WorkerInput {
  readonly kind: ExtractionRequest['kind'];
  readonly bytes: Uint8Array;
  readonly limits: ExtractionRequest['limits'];
}

const input = workerData as WorkerInput;

void extractContent({
  kind: input.kind,
  bytes: Buffer.from(input.bytes),
  limits: input.limits,
}).then((result) => {
  parentPort?.postMessage(result);
});
