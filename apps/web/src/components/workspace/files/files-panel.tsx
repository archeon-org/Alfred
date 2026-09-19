import { FILE_SEARCH_MAX_LENGTH, type StoredFile } from '@alfred/contracts';
import { Files, Search, Upload } from 'lucide-react';
import { useId } from 'react';
import { Link } from 'react-router-dom';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FileActionDialogs } from '@/components/workspace/files/file-action-dialogs';
import { ActiveFileFilters, FileFilterMenu } from '@/components/workspace/files/file-filters';
import { FilePickerButton } from '@/components/workspace/files/file-picker-button';
import { FileRow } from '@/components/workspace/files/file-row';
import { QuotaMeter } from '@/components/workspace/files/quota-meter';
import { UploadStatusList } from '@/components/workspace/files/upload-status-list';
import { useFileActions } from '@/hooks/files/use-file-actions';
import { useFileCatalog } from '@/hooks/files/use-file-catalog';
import { useFileFolders } from '@/hooks/files/use-file-folders';
import { useFileQuota } from '@/hooks/files/use-file-quota';
import { useInfiniteScroll } from '@/hooks/ui/use-infinite-scroll';
import { cn } from '@/lib/cn';
import type { ComposerAttachmentsControls } from '@/lib/files/composer-attachments';
import { CONVERSATION_PARAM, hasActiveFilters } from '@/lib/files/file-filters';
import { LIBRARY_UPLOADS, type FileUploadManager } from '@/lib/files/file-upload';

export interface FilesPanelProps {
  /** The conversation on screen, for « Cette conversation » and the way back from the explorer. */
  readonly conversationId: string | undefined;
  /** The composer on screen; null when the screen has none (project home, skills). */
  readonly attachments: ComposerAttachmentsControls | null;
  readonly uploads: FileUploadManager;
  readonly onDeleted: (fileIds: readonly string[]) => void;
  readonly onUpdated: (file: StoredFile) => void;
}

/**
 * The « Fichiers » tab: the person's whole library, newest first. A click attaches a file to the
 * next message; importing, renaming, moving and deleting work from here, and the explorer opens
 * for folders, selections and previews.
 */
export function FilesPanel({
  attachments,
  conversationId,
  onDeleted,
  onUpdated,
  uploads,
}: FilesPanelProps) {
  const id = useId();
  const catalog = useFileCatalog(conversationId);
  const { files, filters, loadMore, query } = catalog;
  const quota = useFileQuota();
  const { folders } = useFileFolders();
  const actions = useFileActions({ onDeleted, onUpdated });
  const { hasNextPage, isFetching, isFetchNextPageError } = query;
  const sentinel = useInfiniteScroll(
    hasNextPage && !isFetching && !isFetchNextPageError && !query.isError,
    loadMore,
  );
  const attachedIds = new Set(attachments?.items.map((item) => item.fileId));
  const filterHandlers = {
    onClearSearch: () => catalog.setInput(''),
    onKind: catalog.setKind,
    onOnlyConversation: catalog.setOnlyConversation,
    onReadiness: catalog.setReadiness,
  };
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold" id={`${id}-title`}>
            Mes fichiers
          </h3>
          <Files aria-hidden="true" className="size-4 text-primary" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Vos PDF, DOCX et images. Un clic joint un fichier à votre prochain message.
        </p>
      </div>
      <QuotaMeter isError={quota.isError} quota={quota.data} />
      <div className="flex flex-wrap items-center gap-2">
        <FilePickerButton
          inputLabel="Fichiers à importer"
          onFiles={(picked) => uploads.add(picked, { owner: LIBRARY_UPLOADS })}
          size="sm"
          variant="outline"
        >
          <Upload aria-hidden="true" size={14} />
          Importer
        </FilePickerButton>
        <Link
          className={buttonVariants({ size: 'sm', variant: 'ghost' })}
          to={
            conversationId === undefined
              ? '/app/files'
              : `/app/files?${CONVERSATION_PARAM}=${encodeURIComponent(conversationId)}`
          }
        >
          Ouvrir mes fichiers
        </Link>
      </div>
      <UploadStatusList uploads={uploads} />
      <div className="flex items-center gap-2">
        <div className="relative min-w-0 flex-1">
          <label className="sr-only" htmlFor={`${id}-search`}>
            Rechercher un fichier
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            className="h-9 pl-8 text-xs md:text-xs"
            id={`${id}-search`}
            maxLength={FILE_SEARCH_MAX_LENGTH}
            onChange={(event) => catalog.setInput(event.target.value)}
            placeholder="Nom, tag, description…"
            type="search"
            value={catalog.input}
          />
        </div>
        <FileFilterMenu
          conversationAvailable={conversationId !== undefined}
          filters={filters}
          {...filterHandlers}
        />
      </div>
      <ActiveFileFilters filters={filters} {...filterHandlers} />
      <p className="text-2xs text-muted-foreground" role="status">
        {actions.notice ?? attachments?.notice ?? ''}
      </p>
      {actions.downloadError !== null ? (
        <p className="text-xs text-destructive" role="alert">
          {actions.downloadError}
        </p>
      ) : null}
      {query.isPending ? (
        <div aria-busy="true" className="space-y-1.5" role="status">
          <span className="sr-only">Chargement des fichiers…</span>
          <Skeleton className="h-11 rounded-lg" />
          <Skeleton className="h-11 rounded-lg" />
        </div>
      ) : query.isError && !isFetchNextPageError ? (
        <div className="space-y-2" role="alert">
          <p className="text-xs text-muted-foreground">Impossible de charger vos fichiers.</p>
          <Button onClick={() => void query.refetch()} size="sm" variant="outline">
            Réessayer
          </Button>
        </div>
      ) : files.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {hasActiveFilters(filters)
            ? 'Aucun fichier ne correspond à ces critères.'
            : 'Aucun fichier pour le moment. Importez un PDF, un DOCX ou une image.'}
        </p>
      ) : (
        <div aria-busy={isFetching}>
          <ul
            aria-label="Mes fichiers"
            className={cn(
              'space-y-1.5 transition-opacity motion-reduce:transition-none',
              query.isPlaceholderData && 'opacity-60',
            )}
          >
            {files.map((file) => (
              <FileRow
                file={file}
                isAttached={attachedIds.has(file.id)}
                key={file.id}
                onAttach={attachments === null ? undefined : attachments.attachStored}
                onDelete={(target) => actions.remove([target])}
                onDownload={(target) => void actions.download(target)}
                onMove={(target) => actions.move([target])}
                onRename={actions.rename}
              />
            ))}
          </ul>
          {query.isFetchingNextPage ? (
            <div className="mt-1.5" role="status">
              <span className="sr-only">Chargement d’autres fichiers…</span>
              <Skeleton className="h-11 rounded-lg" />
            </div>
          ) : null}
          {isFetchNextPageError ? (
            <div className="mt-2 space-y-2" role="alert">
              <p className="text-xs text-muted-foreground">
                Impossible de charger la suite des fichiers.
              </p>
              <Button onClick={loadMore} size="sm" variant="outline">
                Réessayer
              </Button>
            </div>
          ) : null}
          {hasNextPage ? <div aria-hidden="true" className="h-px" ref={sentinel} /> : null}
        </div>
      )}
      <FileActionDialogs {...actions.dialogs} folders={folders} />
    </section>
  );
}
