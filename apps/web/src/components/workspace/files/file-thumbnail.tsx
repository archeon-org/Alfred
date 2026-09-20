import type { StoredFile } from '@alfred/contracts';
import { useCallback } from 'react';

import { FileTypeIcon } from '@/components/workspace/files/file-type-icon';
import { useFilePreview } from '@/hooks/files/use-file-preview';

/**
 * A small preview of a ready image; any other file shows its type icon. The bytes are fetched
 * with the bearer token, shown through an object URL (`img-src blob:`, ADR 0029) and the URL is
 * revoked when the image leaves the page. Documents are not previewed in the application.
 */
export function FileThumbnail({ file }: { readonly file: StoredFile }) {
  const previewable = file.kind === 'image' && file.readiness === 'ready';
  const bytes = useFilePreview(file.id, previewable);
  // The element owns its URL: created when it mounts with bytes, revoked when it unmounts.
  const show = useCallback(
    (image: HTMLImageElement | null) => {
      if (image === null || bytes === undefined) return;
      const url = URL.createObjectURL(bytes);
      image.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [bytes],
  );
  return (
    <span
      className="grid size-10 shrink-0 place-items-center overflow-hidden rounded-md border border-border bg-muted/50"
      data-slot="file-thumbnail"
    >
      {bytes === undefined ? (
        <FileTypeIcon kind={file.kind} />
      ) : (
        // Decorative: the row names the file right beside it.
        <img alt="" className="size-full object-cover" ref={show} />
      )}
    </span>
  );
}
