import type { StoredFile } from '@alfred/contracts';
import { LoaderCircle, Paperclip, TriangleAlert } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { FileActionMenu, type FileRowActions } from '@/components/workspace/files/file-action-menu';
import { FileTypeIcon } from '@/components/workspace/files/file-type-icon';
import { useFileReadiness } from '@/hooks/files/use-file-readiness';
import { describeFileFailure, formatFileSize } from '@/lib/files/file-format';
import { FILE_KIND_LABELS } from '@/lib/files/file-kinds';
import { latestFile } from '@/lib/files/latest-file';
import { formatDate } from '@/lib/workspace/format-date';

export interface FileRowProps extends FileRowActions {
  readonly file: StoredFile;
  /**
   * Attaches the file to the composer on screen. Absent when no composer is on screen: the row
   * then says why its main action is unavailable.
   */
  readonly onAttach?: ((file: StoredFile) => void) | undefined;
  /** Already among the chips of the next message. */
  readonly isAttached?: boolean;
  readonly disabled?: boolean;
}

/**
 * One file of the « Fichiers » tab. Its main action attaches it to the next message; a file still
 * being analysed is followed by bounded reads for as long as its row is mounted, and only then.
 */
export function FileRow(props: FileRowProps) {
  return props.file.readiness === 'processing' ? (
    <WatchedFileRow {...props} />
  ) : (
    <FileRowView {...props} />
  );
}

function WatchedFileRow(props: FileRowProps) {
  const read = useFileReadiness(props.file.id, { enabled: true, known: props.file });
  return <FileRowView {...props} file={latestFile(props.file, read)} />;
}

/** Why the main action is unavailable, or null when the file can be attached. */
function attachBlock(file: StoredFile, canAttach: boolean, isAttached: boolean): string | null {
  if (file.readiness === 'processing')
    return 'Analyse en cours… Ce fichier pourra être joint une fois prêt.';
  if (file.readiness === 'failed')
    return `${describeFileFailure(file.failureCode)} Il ne peut pas être joint.`;
  if (isAttached) return 'Joint au prochain message.';
  if (!canAttach) return 'Ouvrez une conversation pour joindre ce fichier.';
  return null;
}

function FileRowView({
  disabled = false,
  file,
  isAttached = false,
  onAttach,
  ...actions
}: FileRowProps) {
  const id = useId();
  const block = attachBlock(file, onAttach !== undefined, isAttached);
  return (
    <li
      className="flex min-w-0 items-center gap-1 rounded-lg border border-border bg-card/70 pr-1"
      data-readiness={file.readiness}
    >
      <Button
        aria-describedby={`${id}-meta${block === null ? '' : ` ${id}-state`}`}
        aria-label={`Joindre ${file.name} au message`}
        className="h-auto min-h-11 min-w-0 flex-1 justify-start gap-2.5 rounded-lg px-2.5 py-1.5 text-left whitespace-normal"
        disabled={disabled || block !== null}
        onClick={() => onAttach?.(file)}
        variant="ghost"
      >
        {file.readiness === 'processing' ? (
          <LoaderCircle
            aria-hidden="true"
            className="size-4 shrink-0 animate-spin text-muted-foreground motion-reduce:animate-none"
          />
        ) : file.readiness === 'failed' ? (
          <TriangleAlert aria-hidden="true" className="size-4 shrink-0 text-destructive" />
        ) : (
          <FileTypeIcon kind={file.kind} />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-medium text-foreground" title={file.name}>
            {file.name}
          </span>
          <span className="block text-2xs font-normal text-muted-foreground" id={`${id}-meta`}>
            {FILE_KIND_LABELS[file.kind]} · {formatFileSize(file.sizeBytes)} ·{' '}
            {formatDate(file.createdAt)}
          </span>
          {block !== null ? (
            <span
              className={
                file.readiness === 'failed'
                  ? 'block text-2xs font-normal text-destructive'
                  : 'block text-2xs font-normal text-muted-foreground'
              }
              id={`${id}-state`}
            >
              {block}
            </span>
          ) : null}
        </span>
        {block === null ? (
          <Paperclip aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        ) : null}
      </Button>
      <FileActionMenu {...actions} disabled={disabled} file={file} />
    </li>
  );
}
