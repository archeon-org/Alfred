import type { FileFolder, StoredFile } from '@alfred/contracts';
import { Folder, FolderInput, Paperclip, Pencil, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router-dom';

import { ActionMenu } from '@/components/ui/action-menu';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { FileActionMenu, type FileRowActions } from '@/components/workspace/files/file-action-menu';
import { FileThumbnail } from '@/components/workspace/files/file-thumbnail';
import { useFileReadiness } from '@/hooks/files/use-file-readiness';
import { describeFileFailure, describeFileUsage, formatFileSize } from '@/lib/files/file-format';
import { FILE_KIND_LABELS } from '@/lib/files/file-kinds';
import { latestFile } from '@/lib/files/latest-file';
import { formatDate } from '@/lib/workspace/format-date';

export interface FolderActions {
  readonly onRename: (folder: FileFolder) => void;
  readonly onMove: (folder: FileFolder) => void;
  readonly onDelete: (folder: FileFolder) => void;
}

/** The "⋯" menu of a folder: on its row in the parent, and beside the trail once it is open. */
export function FolderActionMenu({
  folder,
  onDelete,
  onMove,
  onRename,
}: FolderActions & { readonly folder: FileFolder }) {
  return (
    <ActionMenu
      className="shrink-0"
      items={[
        { id: 'rename', icon: Pencil, label: 'Renommer', onSelect: () => onRename(folder) },
        { id: 'move', icon: FolderInput, label: 'Déplacer', onSelect: () => onMove(folder) },
        {
          id: 'delete',
          icon: Trash2,
          label: 'Supprimer',
          destructive: true,
          separatorBefore: true,
          onSelect: () => onDelete(folder),
        },
      ]}
      label={`Actions du dossier ${folder.name}`}
    />
  );
}

interface FolderRowProps extends FolderActions {
  readonly folder: FileFolder;
  /** Address of the folder, carrying the conversation to attach to when there is one. */
  readonly to: string;
}

/** A folder of the library: a link into it, and its own actions beside the link. */
export function FolderRow({ folder, onDelete, onMove, onRename, to }: FolderRowProps) {
  return (
    <li className="flex min-w-0 items-center gap-1 rounded-lg border border-border bg-card/70 pr-1">
      <Link
        className="flex min-h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-1.5 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        to={to}
      >
        <Folder aria-hidden="true" className="size-4 shrink-0 text-primary" />
        <span className="min-w-0 flex-1 truncate font-medium" title={folder.name}>
          {folder.name}
        </span>
        <span className="shrink-0 text-2xs text-muted-foreground">
          {folder.fileCount} fichier{folder.fileCount > 1 ? 's' : ''}
        </span>
      </Link>
      <FolderActionMenu folder={folder} onDelete={onDelete} onMove={onMove} onRename={onRename} />
    </li>
  );
}

export interface ExplorerFileRowProps extends FileRowActions {
  readonly file: StoredFile;
  readonly isSelected: boolean;
  readonly onToggleSelected: (fileId: string) => void;
  /** Present when the explorer was opened from a conversation: attaches the file to it. */
  readonly onAttach?: ((file: StoredFile) => void) | undefined;
  readonly isAttached?: boolean;
}

/** A file being analysed is followed by bounded reads while its row is mounted, and only then. */
export function ExplorerFileRow(props: ExplorerFileRowProps) {
  return props.file.readiness === 'processing' ? (
    <WatchedRow {...props} />
  ) : (
    <ExplorerFileRowView {...props} />
  );
}

function WatchedRow(props: ExplorerFileRowProps) {
  const read = useFileReadiness(props.file.id, { enabled: true, known: props.file });
  return <ExplorerFileRowView {...props} file={latestFile(props.file, read)} />;
}

function ExplorerFileRowView({
  file,
  isAttached = false,
  isSelected,
  onAttach,
  onToggleSelected,
  ...actions
}: ExplorerFileRowProps) {
  const id = useId();
  const usage = describeFileUsage(file.usage);
  return (
    <li
      className="flex min-w-0 items-center gap-3 rounded-lg border border-border bg-card/70 py-2 pr-1 pl-3 has-[:checked]:border-ring has-[:checked]:bg-accent/60"
      data-readiness={file.readiness}
    >
      {/* The label only widens the touch target to 44 px; the checkbox carries the name. */}
      <label className="grid size-11 shrink-0 cursor-pointer place-items-center" htmlFor={id}>
        <Checkbox
          aria-label={`Sélectionner ${file.name}`}
          checked={isSelected}
          id={id}
          onChange={() => onToggleSelected(file.id)}
        />
      </label>
      <FileThumbnail file={file} />
      <div className="min-w-0 flex-1">
        <h3 className="truncate text-sm font-medium" title={file.name}>
          {file.name}
        </h3>
        <p className="text-2xs text-muted-foreground">
          {FILE_KIND_LABELS[file.kind]} · {formatFileSize(file.sizeBytes)}
          {file.pageCount !== null && file.pageCount > 0
            ? ` · ${file.pageCount} page${file.pageCount > 1 ? 's' : ''}`
            : ''}{' '}
          · {formatDate(file.createdAt)}
          {usage === null ? '' : ` · ${usage}`}
        </p>
        {file.readiness === 'processing' ? (
          <p className="text-2xs text-muted-foreground">Analyse en cours…</p>
        ) : file.readiness === 'failed' ? (
          <p className="text-2xs text-destructive">{describeFileFailure(file.failureCode)}</p>
        ) : null}
        {file.description ? (
          <p className="mt-0.5 line-clamp-2 text-2xs text-muted-foreground">{file.description}</p>
        ) : null}
        {file.tags.length > 0 ? (
          <ul aria-label={`Tags de ${file.name}`} className="mt-1 flex flex-wrap gap-1">
            {file.tags.map((tag) => (
              <li key={tag}>
                <Badge className="min-h-5 px-1.5 text-2xs font-medium">{tag}</Badge>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      {onAttach !== undefined ? (
        <Button
          aria-label={
            isAttached
              ? `${file.name} est joint à la conversation`
              : `Joindre ${file.name} à la conversation`
          }
          className="shrink-0"
          disabled={file.readiness !== 'ready' || isAttached}
          onClick={() => onAttach(file)}
          size="sm"
          title={
            file.readiness === 'ready'
              ? undefined
              : 'Seul un fichier prêt peut être joint à un message.'
          }
          variant="outline"
        >
          <Paperclip aria-hidden="true" size={14} />
          <span className="max-sm:sr-only">{isAttached ? 'Joint' : 'Joindre'}</span>
        </Button>
      ) : null}
      <FileActionMenu {...actions} file={file} />
    </li>
  );
}
