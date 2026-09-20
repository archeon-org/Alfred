import { Chip, ChipList } from '@/components/ui/chip';
import { FileTypeIcon } from '@/components/workspace/files/file-type-icon';
import type { AttachmentView } from '@/lib/files/composer-attachments';

/**
 * The files one message carried, under its bubble. The row outlives the file: after a deletion
 * the transcript still names what was sent; a truncated document says so.
 */
export function MessageAttachments({
  attachments,
}: {
  readonly attachments: readonly AttachmentView[];
}) {
  if (attachments.length === 0) return null;
  return (
    <ChipList aria-label="Fichiers joints au message" className="mt-1.5 justify-end gap-1.5">
      {attachments.map((attachment) => (
        <Chip
          className="bg-background"
          icon={<FileTypeIcon className="size-3.5" kind={attachment.kind} />}
          key={attachment.fileId}
          label={attachment.name}
          status={
            attachment.available === false ? (
              'fichier supprimé'
            ) : attachment.truncated === true ? (
              <span title="Alfred n’a reçu que le début de ce document.">tronqué</span>
            ) : undefined
          }
        />
      ))}
    </ChipList>
  );
}
