import type { FileFolder, StoredFile } from '@alfred/contracts';
import { FolderInput, Trash2 } from 'lucide-react';
import { useId, type Ref } from 'react';

import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { ExplorerFileRow, FolderRow } from '@/components/workspace/files/explorer-rows';
import type { FileRowActions } from '@/components/workspace/files/file-action-menu';
import { cn } from '@/lib/cn';

interface FolderListProps {
  readonly folders: readonly FileFolder[];
  readonly pathOf: (folder: FileFolder) => string;
  readonly onRename: (folder: FileFolder) => void;
  readonly onMove: (folder: FileFolder) => void;
  readonly onDelete: (folder: FileFolder) => void;
}

/** The folders of the open folder, before its files. */
export function ExplorerFolderList({ folders, pathOf, ...actions }: FolderListProps) {
  const titleId = useId();
  if (folders.length === 0) return null;
  return (
    <section aria-labelledby={titleId} className="space-y-2">
      <h2 className="text-xs font-semibold text-muted-foreground" id={titleId}>
        Dossiers
      </h2>
      <ul aria-labelledby={titleId} className="grid gap-1.5 sm:grid-cols-2">
        {folders.map((folder) => (
          <FolderRow folder={folder} key={folder.id} to={pathOf(folder)} {...actions} />
        ))}
      </ul>
    </section>
  );
}

interface FileListProps extends FileRowActions {
  readonly files: readonly StoredFile[];
  readonly selectedIds: ReadonlySet<string>;
  readonly onToggleSelected: (fileId: string) => void;
  readonly onSelectAll: (fileIds: readonly string[]) => void;
  readonly onClearSelection: () => void;
  readonly onMoveSelection: (files: readonly StoredFile[]) => void;
  readonly onDeleteSelection: (files: readonly StoredFile[]) => void;
  readonly onAttach?: ((file: StoredFile) => void) | undefined;
  readonly attachedIds: ReadonlySet<string | null>;
  /** The previous results stay, dimmed, while another search or filter loads. */
  readonly isStale: boolean;
  readonly isFetching: boolean;
  readonly isFetchingNextPage: boolean;
  readonly hasNextPage: boolean;
  readonly nextPageFailed: boolean;
  readonly onRetryNextPage: () => void;
  readonly sentinel: Ref<HTMLDivElement>;
}

/** The files of the open folder (or of a search), with their selection and its bulk actions. */
export function ExplorerFileList({
  attachedIds,
  files,
  hasNextPage,
  isFetching,
  isFetchingNextPage,
  isStale,
  nextPageFailed,
  onAttach,
  onClearSelection,
  onDeleteSelection,
  onMoveSelection,
  onRetryNextPage,
  onSelectAll,
  onToggleSelected,
  selectedIds,
  sentinel,
  ...actions
}: FileListProps) {
  const titleId = useId();
  const selected = files.filter((file) => selectedIds.has(file.id));
  const allSelected = files.length > 0 && selected.length === files.length;
  return (
    <section aria-busy={isFetching} aria-labelledby={titleId} className="space-y-2">
      <div className="flex min-h-11 flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="text-xs font-semibold text-muted-foreground" id={titleId}>
          Fichiers
        </h2>
        <label
          className="ml-1 flex min-h-11 cursor-pointer items-center gap-2 text-xs"
          htmlFor={`${titleId}-all`}
        >
          <Checkbox
            checked={allSelected}
            id={`${titleId}-all`}
            onChange={() =>
              allSelected ? onClearSelection() : onSelectAll(files.map((file) => file.id))
            }
          />
          Tout sélectionner
        </label>
        {selected.length > 0 ? (
          <div
            aria-label="Actions sur la sélection"
            className="ml-auto flex flex-wrap items-center gap-2"
            role="group"
          >
            <span className="text-xs text-muted-foreground" role="status">
              {selected.length} sélectionné{selected.length > 1 ? 's' : ''}
            </span>
            <Button onClick={() => onMoveSelection(selected)} size="sm" variant="outline">
              <FolderInput aria-hidden="true" size={14} />
              Déplacer
            </Button>
            <Button onClick={() => onDeleteSelection(selected)} size="sm" variant="outline">
              <Trash2 aria-hidden="true" size={14} />
              Supprimer
            </Button>
            <Button onClick={onClearSelection} size="sm" variant="ghost">
              Désélectionner
            </Button>
          </div>
        ) : null}
      </div>
      <ul
        aria-labelledby={titleId}
        className={cn(
          'space-y-1.5 transition-opacity motion-reduce:transition-none',
          isStale && 'opacity-60',
        )}
      >
        {files.map((file) => (
          <ExplorerFileRow
            file={file}
            isAttached={attachedIds.has(file.id)}
            isSelected={selectedIds.has(file.id)}
            key={file.id}
            onAttach={onAttach}
            onToggleSelected={onToggleSelected}
            {...actions}
          />
        ))}
      </ul>
      {isFetchingNextPage ? (
        <div role="status">
          <span className="sr-only">Chargement d’autres fichiers…</span>
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : null}
      {nextPageFailed ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm text-muted-foreground">
            Impossible de charger la suite des fichiers.
          </p>
          <Button onClick={onRetryNextPage} size="sm" variant="outline">
            Réessayer
          </Button>
        </div>
      ) : null}
      {hasNextPage ? <div aria-hidden="true" className="h-px" ref={sentinel} /> : null}
    </section>
  );
}
