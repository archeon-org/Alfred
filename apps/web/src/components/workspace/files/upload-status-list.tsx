import { LoaderCircle, RotateCw } from 'lucide-react';
import { useEffect } from 'react';

import { Chip, ChipList } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { FileTypeIcon } from '@/components/workspace/files/file-type-icon';
import { LIBRARY_UPLOADS, type FileUploadManager } from '@/lib/files/file-upload';

/**
 * Files on their way into the library (« Importer », a drop on the explorer). `fetch` reports no
 * progress, so an upload reads « Envoi… » until it ends. An imported file leaves this list: the
 * library shows it. A refused one stays with its reason until retried or dismissed.
 */
export function UploadStatusList({ uploads }: { readonly uploads: FileUploadManager }) {
  const items = uploads.items.filter((item) => item.owner === LIBRARY_UPLOADS);
  const done = items.filter((item) => item.status === 'done');
  const shown = items.filter((item) => item.status !== 'done');
  const { remove } = uploads;
  useEffect(() => {
    for (const item of done) remove(item.uploadId);
  }, [done, remove]);
  const sending = shown.filter((item) => item.status !== 'failed').length;
  return (
    <div aria-busy={sending > 0} data-slot="upload-status">
      {shown.length > 0 ? (
        <ChipList aria-label="Envois en cours" className="pb-1.5">
          {shown.map((item) => (
            <Chip
              aria-busy={item.status !== 'failed'}
              icon={
                item.status === 'failed' ? (
                  <FileTypeIcon className="size-3.5" kind={item.kind} />
                ) : (
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
                  />
                )
              }
              key={item.uploadId}
              label={item.name}
              onRemove={() => remove(item.uploadId)}
              removeLabel={
                item.status === 'failed'
                  ? `Ignorer l’échec de ${item.name}`
                  : `Annuler l’envoi de ${item.name}`
              }
              status={item.status === 'failed' ? 'Échec' : 'Envoi…'}
              tone={item.status === 'failed' ? 'danger' : 'busy'}
            >
              {item.status === 'failed' && item.retryable ? (
                <IconButton
                  className="relative size-6 shrink-0 rounded-full after:absolute after:-inset-2.5"
                  label={`Renvoyer ${item.name}`}
                  onClick={() => uploads.retry(item.uploadId)}
                  size="icon-sm"
                >
                  <RotateCw aria-hidden="true" size={13} />
                </IconButton>
              ) : null}
            </Chip>
          ))}
        </ChipList>
      ) : null}
      <div className="text-2xs" role="status">
        {shown
          .filter((item) => item.status === 'failed')
          .map((item) => (
            <p className="pb-1 text-destructive" key={item.uploadId}>
              « {item.name} » : {item.error}
            </p>
          ))}
        <span className="sr-only">
          {sending > 0 ? `Envoi de ${sending} fichier${sending > 1 ? 's' : ''}…` : ''}
        </span>
      </div>
    </div>
  );
}
