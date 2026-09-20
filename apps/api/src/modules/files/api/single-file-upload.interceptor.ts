import {
  type CallHandler,
  type ExecutionContext,
  Inject,
  Injectable,
  type NestInterceptor,
  PayloadTooLargeException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { finalize, type Observable } from 'rxjs';

import { ApiException } from '../../../common/errors/api.exception';
import { FILE_SETTINGS, type FileSettings } from '../application/file-settings';
import { uploadCancelled } from '../application/file-upload.service';
import { UploadSlots } from '../application/upload-slots';

export const UPLOAD_FILE_FIELD = 'file';

/** Room for the multipart boundaries and the few short text fields around the file. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

const ABANDONED = Symbol('uploadAbandoned');

interface UploadRequest {
  readonly headers: Record<string, unknown>;
  readonly user?: { readonly id?: string };
  readonly aborted?: boolean;
  readonly destroyed?: boolean;
  destroy(): void;
  [ABANDONED]?: AbortSignal;
}

interface UploadResponse {
  readonly destroyed: boolean;
  readonly writableFinished: boolean;
  once(event: 'close', listener: () => void): unknown;
}

/** Aborts when the browser gave the upload up, at any point since its first byte. */
export function abandonedSignalOf(request: object): AbortSignal | undefined {
  return (request as UploadRequest)[ABANDONED];
}

/**
 * Parses one multipart file into memory under explicit bounds. The JSON body limits of the API do
 * not apply to `multipart/form-data`, so every dimension is capped here: one file, a few short
 * text fields, the configured size. A larger body is cut off while it streams in.
 *
 * The concurrency slot is taken before a single byte of the body is read and is held until the
 * request is over, so the instance never buffers more files than it has slots for. A body has a
 * deadline sized from the file limit, because a slot is otherwise held for as long as a client
 * cares to trickle. Listening for the client's departure starts here too, before the body: a
 * listener attached by the handler, once parsing is done, would miss a connection closed in
 * between, and the file of a browser that left would be published.
 */
@Injectable()
export class SingleFileUploadInterceptor implements NestInterceptor {
  private readonly parser: NestInterceptor;
  constructor(
    @Inject(FILE_SETTINGS) private readonly settings: FileSettings,
    private readonly slots: UploadSlots,
  ) {
    const Parser = FileInterceptor(UPLOAD_FILE_FIELD, {
      limits: {
        fileSize: settings.maxFileBytes,
        files: 1,
        fields: 4,
        fieldSize: 1_024,
        fieldNameSize: 64,
        parts: 6,
        headerPairs: 64,
      },
    });
    this.parser = new Parser();
  }

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    const http = context.switchToHttp();
    const request = http.getRequest<UploadRequest>();
    const response = http.getResponse<UploadResponse>();

    // Guards ran first, so the account is known; one account never takes every slot.
    const release = this.slots.acquire(request.user?.id ?? '');
    if (release === null) {
      throw new ApiException(503, 'upload_busy', 'Too many uploads are in progress.');
    }

    const abandoned = new AbortController();
    response.once('close', () => {
      if (!response.writableFinished) abandoned.abort();
    });
    if (response.destroyed) abandoned.abort();
    request[ABANDONED] = abandoned.signal;

    const deadline = setTimeout(() => {
      abandoned.abort();
      request.destroy();
    }, this.settings.uploadBodyDeadlineMs);
    deadline.unref();

    try {
      // A declared length cannot be trusted to be small, but one that is too large is reason
      // enough to refuse before reading anything.
      const declared = Number(request.headers['content-length']);
      if (
        Number.isFinite(declared) &&
        declared > this.settings.maxFileBytes + MULTIPART_OVERHEAD_BYTES
      ) {
        throw new PayloadTooLargeException();
      }
      const handled = await this.parser.intercept(context, next);
      return handled.pipe(finalize(release));
    } catch (error) {
      release();
      if (error instanceof PayloadTooLargeException) {
        throw new ApiException(413, 'file_too_large', 'The file exceeds the size limit.', {
          maxFileBytes: this.settings.maxFileBytes,
        });
      }
      // The parser reports a client that left as a plain error; it is not a server fault.
      if (abandoned.signal.aborted || request.aborted === true || request.destroyed === true) {
        throw uploadCancelled();
      }
      throw error;
    } finally {
      // Only the body is on a deadline: storing and publishing have their own bounds.
      clearTimeout(deadline);
    }
  }
}
