import { LoaderCircle, RotateCw } from 'lucide-react';

import { Chip, ChipList } from '@/components/ui/chip';
import { IconButton } from '@/components/ui/icon-button';
import { FileTypeIcon } from '@/components/workspace/files/file-type-icon';
import { useFileReadiness } from '@/hooks/files/use-file-readiness';
import {
  STATUS_LABELS,
  type ComposerAttachment,
  type ComposerAttachmentsControls,
} from '@/lib/files/composer-attachments';

const BUSY = new Set<ComposerAttachment['status']>(['validating', 'uploading', 'processing']);

const plural = (count: number, one: string, many: string) => `${count} ${count > 1 ? many : one}`;

/** What a screen reader hears when the chips change; one sentence, never one per chip. */
function summarize(items: readonly ComposerAttachment[]): string {
  if (items.length === 0) return '';
  const count = (status: ComposerAttachment['status']) =>
    items.filter((item) => item.status === status).length;
  const sending = count('validating') + count('uploading');
  const parts = [
    sending > 0 ? `${sending} en cours d’envoi` : null,
    count('processing') > 0 ? `${count('processing')} en cours d’analyse` : null,
    count('ready') > 0 ? plural(count('ready'), 'prêt', 'prêts') : null,
    count('failed') > 0 ? `${count('failed')} en échec` : null,
  ].filter((part) => part !== null);
  return `${plural(items.length, 'fichier joint', 'fichiers joints')} : ${parts.join(', ')}.`;
}

/** The chips of the next message and the single live region that tells how they are doing. */
export function ComposerAttachments({
  attachments,
}: {
  readonly attachments: ComposerAttachmentsControls;
}) {
  const { items, notice } = attachments;
  const failures = items.filter((item) => item.status === 'failed' && item.error !== null);
  return (
    <div data-slot="composer-attachments">
      {items.length > 0 ? (
        <ChipList aria-label="Fichiers joints" className="px-1 pb-2">
          {items.map((item) => (
            <AttachmentChip attachments={attachments} item={item} key={item.localId} />
          ))}
        </ChipList>
      ) : null}
      <div className="px-2 text-2xs" role="status">
        {notice !== null ? <p className="pb-1 text-muted-foreground">{notice}</p> : null}
        {failures.map((item) => (
          <p className="pb-1 text-destructive" key={item.localId}>
            « {item.name} » : {item.error}
          </p>
        ))}
        <span className="sr-only">{summarize(items)}</span>
      </div>
    </div>
  );
}

interface AttachmentChipProps {
  readonly item: ComposerAttachment;
  readonly attachments: ComposerAttachmentsControls;
}

function AttachmentChip({ item, attachments }: AttachmentChipProps) {
  const busy = BUSY.has(item.status);
  return (
    <Chip
      aria-busy={busy}
      icon={
        busy ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-3.5 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        ) : (
          <FileTypeIcon className="size-3.5" kind={item.kind} />
        )
      }
      label={item.name}
      onRemove={() => attachments.remove(item.localId)}
      removeLabel={
        item.status === 'uploading' || item.status === 'validating'
          ? `Annuler l’envoi de ${item.name}`
          : `Retirer ${item.name}`
      }
      status={item.status === 'ready' ? undefined : STATUS_LABELS[item.status]}
      tone={item.status === 'failed' ? 'danger' : busy ? 'busy' : 'default'}
    >
      {item.status === 'processing' && item.fileId !== null ? (
        <ReadinessWatch attachments={attachments} fileId={item.fileId} />
      ) : null}
      {item.status === 'failed' && item.retryable ? (
        <IconButton
          className="relative size-6 shrink-0 rounded-full after:absolute after:-inset-2.5"
          label={`Renvoyer ${item.name}`}
          onClick={() => attachments.retry(item.localId)}
          size="icon-sm"
        >
          <RotateCw aria-hidden="true" size={13} />
        </IconButton>
      ) : null}
    </Chip>
  );
}

/** Mounted only while its chip waits for the analysis: the bounded reads stop with it. */
function ReadinessWatch({
  attachments,
  fileId,
}: {
  readonly attachments: ComposerAttachmentsControls;
  readonly fileId: string;
}) {
  useFileReadiness(fileId, {
    enabled: true,
    onSettled: attachments.settle,
    onUnavailable: (error) => attachments.markUnavailable(fileId, error),
  });
  return null;
}
