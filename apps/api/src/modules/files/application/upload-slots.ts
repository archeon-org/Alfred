import { FILE_MAX_CONCURRENT_UPLOADS_PER_USER } from '@alfred/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { FILE_SETTINGS, type FileSettings } from './file-settings';

/**
 * How many uploads one API instance holds in memory at once. A slot is taken *before* the
 * multipart body is read, because reading it is what costs the memory: counting later would let
 * any number of files be buffered first. The envelope is `slots × FILE_UPLOAD_MAX_BYTES`, which
 * the startup validation bounds.
 *
 * One user never holds more than the application sends in parallel, so that a single account
 * trickling a few bodies cannot take every slot of the instance from everybody else.
 */
@Injectable()
export class UploadSlots {
  private taken = 0;
  private readonly takenBy = new Map<string, number>();

  constructor(@Inject(FILE_SETTINGS) private readonly settings: FileSettings) {}

  /** A release function, or `null` when no slot is free. Releasing twice is harmless. */
  acquire(userId: string): (() => void) | null {
    const mine = this.takenBy.get(userId) ?? 0;
    if (this.taken >= this.settings.maxConcurrentUploads) return null;
    if (mine >= FILE_MAX_CONCURRENT_UPLOADS_PER_USER) return null;
    this.taken += 1;
    this.takenBy.set(userId, mine + 1);
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.taken -= 1;
      const left = (this.takenBy.get(userId) ?? 1) - 1;
      if (left <= 0) this.takenBy.delete(userId);
      else this.takenBy.set(userId, left);
    };
  }
}
