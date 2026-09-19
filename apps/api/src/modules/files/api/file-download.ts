import { StreamableFile } from '@nestjs/common';

import type { FileBytes } from '../application/files.service';

/** RFC 6266 / RFC 5987: an ASCII fallback plus the exact UTF-8 name, both safely encoded. */
function contentDisposition(name: string): string {
  const fallback = name.replace(/[^\x20-\x7e]/gu, '_').replace(/["\\]/gu, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/gu,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}

/**
 * User bytes are served from the application's own origin, so they are never rendered inline:
 * always an attachment, always the type the server detected at upload — never a declared one —
 * and never cached by a shared intermediary.
 */
export function toDownload(file: FileBytes): StreamableFile {
  return new StreamableFile(file.bytes, {
    type: file.mediaType,
    disposition: contentDisposition(file.name),
    length: file.bytes.byteLength,
  });
}

export const DOWNLOAD_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
});
