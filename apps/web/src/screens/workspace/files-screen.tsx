import { Link, useNavigate } from 'react-router-dom';

import { FeatureGate } from '@/components/feature-flags/feature-gate';
import { Button, buttonVariants } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileActionDialogs } from '@/components/workspace/files/file-action-dialogs';
import { FileDropZone } from '@/components/workspace/files/file-drop-zone';
import { FileExplorerHeader } from '@/components/workspace/files/file-explorer-header';
import {
  ExplorerFileList,
  ExplorerFolderList,
} from '@/components/workspace/files/file-explorer-list';
import { FileExplorerToolbar } from '@/components/workspace/files/file-explorer-toolbar';
import { FolderActionDialogs } from '@/components/workspace/files/folder-action-dialogs';
import { UploadStatusList } from '@/components/workspace/files/upload-status-list';
import { useConversationQuery } from '@/hooks/conversations/use-conversations-query';
import { useFileActions } from '@/hooks/files/use-file-actions';
import { explorerPath, useFileExplorer } from '@/hooks/files/use-file-explorer';
import { useFileQuota } from '@/hooks/files/use-file-quota';
import { useFolderActions } from '@/hooks/files/use-folder-actions';
import { useInfiniteScroll } from '@/hooks/ui/use-infinite-scroll';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { useWorkspaceOutlet } from '@/hooks/workspace/use-workspace-outlet';
import { LIBRARY_UPLOADS } from '@/lib/files/file-upload';

/**
 * `/app/files` and `/app/files/:folderId`: the whole library as a page. A page rather than a
 * dialog: below the workspace breakpoint the context panel is already one, and its « Ouvrir mes
 * fichiers » would stack a second dialog, then the rename or delete dialog as a third.
 */
export function FilesScreen() {
  const { userId } = useWorkspaceAccount();
  const { conversationRef } = useWorkspaceOutlet();
  return (
    <main
      className="h-full min-h-0 min-w-0 overflow-y-auto rounded-xl border border-border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-6"
      data-conversation-scroll-root
      id="main-content"
      ref={conversationRef}
      tabIndex={-1}
    >
      <FeatureGate feature="fileUploads" fallback={<p>Les fichiers sont désactivés.</p>}>
        <FileLibrary key={userId} />
      </FeatureGate>
    </main>
  );
}

function FileLibrary() {
  const navigate = useNavigate();
  const { files: workspaceFiles } = useWorkspaceOutlet();
  const explorer = useFileExplorer();
  const { conversationId, files, filters, folderId, folders, loadMore, query, trail } = explorer;
  const quota = useFileQuota();
  // Attaching needs a conversation that exists: its title also labels the way back.
  const conversation = useConversationQuery(conversationId ?? undefined);
  const attachments =
    conversationId !== null && conversation.conversation !== undefined
      ? workspaceFiles.attachments.forScope(conversationId)
      : null;
  const fileActions = useFileActions({
    onDeleted: (fileIds) => {
      workspaceFiles.attachments.forget(fileIds);
      explorer.clearSelection();
    },
    onUpdated: workspaceFiles.attachments.settle,
  });
  const folderActions = useFolderActions({
    onDeleted: (folder) => {
      if (folder.id === folderId)
        void navigate(explorerPath(folder.parentId, conversationId), { replace: true });
    },
  });
  const { hasNextPage, isFetching, isFetchNextPageError } = query;
  const sentinel = useInfiniteScroll(
    hasNextPage && !isFetching && !isFetchNextPageError && !query.isError,
    loadMore,
  );
  const destination = trail.at(-1)?.name ?? 'Mes fichiers';
  const importFiles = (picked: File[]) =>
    workspaceFiles.uploads.add(picked, { folderId, owner: LIBRARY_UPLOADS });
  const filterHandlers = {
    onClearSearch: explorer.clearSearch,
    onKind: explorer.setKind,
    onOnlyConversation: explorer.setOnlyConversation,
    onReadiness: explorer.setReadiness,
  };
  const folderHandlers = {
    onDelete: folderActions.remove,
    onMove: folderActions.move,
    onRename: folderActions.rename,
  };
  const notice = fileActions.notice ?? folderActions.notice ?? attachments?.notice ?? '';

  if (explorer.folderMissing)
    return (
      <div className="space-y-4" role="alert">
        <h1 className="text-lg font-semibold">Dossier introuvable</h1>
        <p className="text-sm text-muted-foreground">Ce dossier n’existe plus.</p>
        <Link
          className={buttonVariants({ variant: 'outline' })}
          to={explorerPath(null, conversationId)}
        >
          Retour à mes fichiers
        </Link>
      </div>
    );

  return (
    <FileDropZone className="min-h-full space-y-6" destination={destination} onFiles={importFiles}>
      <FileExplorerHeader
        conversation={
          conversationId === null
            ? null
            : { id: conversationId, title: conversation.conversation?.title }
        }
        folderActions={folderHandlers}
        quota={quota.data}
        quotaFailed={quota.isError}
        trail={trail}
      />
      <FileExplorerToolbar
        conversationAvailable={conversationId !== null}
        filters={filters}
        onCreateFolder={() => folderActions.create(folderId)}
        onImport={importFiles}
        onSearch={explorer.setInput}
        search={explorer.input}
        {...filterHandlers}
      />
      <UploadStatusList uploads={workspaceFiles.uploads} />
      <p className="text-sm text-muted-foreground" role="status">
        {notice}
      </p>
      {fileActions.downloadError !== null ? (
        <p className="text-sm text-destructive" role="alert">
          {fileActions.downloadError}
        </p>
      ) : null}
      {explorer.searching ? (
        <p className="text-xs text-muted-foreground">Résultats dans tous vos dossiers.</p>
      ) : (
        <ExplorerFolderList
          folders={explorer.subfolders}
          pathOf={(folder) => explorerPath(folder.id, conversationId)}
          {...folderHandlers}
        />
      )}
      {query.isPending ? (
        <div aria-busy="true" className="space-y-1.5" role="status">
          <span className="sr-only">Chargement des fichiers…</span>
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
          <Skeleton className="h-14 rounded-lg" />
        </div>
      ) : query.isError && !isFetchNextPageError ? (
        <div className="space-y-2" role="alert">
          <p className="text-sm">Impossible de charger vos fichiers.</p>
          <Button onClick={() => void query.refetch()} variant="outline">
            Réessayer
          </Button>
        </div>
      ) : files.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">
          {explorer.searching
            ? 'Aucun fichier ne correspond à ces critères.'
            : folderId === null && explorer.subfolders.length === 0
              ? 'Votre bibliothèque est vide. Importez un PDF, un DOCX ou une image, ou déposez-les ici.'
              : 'Aucun fichier dans ce dossier. Importez-en, ou déposez-les ici.'}
        </p>
      ) : (
        <ExplorerFileList
          attachedIds={new Set(attachments?.items.map((item) => item.fileId))}
          files={files}
          hasNextPage={hasNextPage}
          isFetching={isFetching}
          isFetchingNextPage={query.isFetchingNextPage}
          isStale={query.isPlaceholderData}
          nextPageFailed={isFetchNextPageError}
          onAttach={attachments === null ? undefined : attachments.attachStored}
          onClearSelection={explorer.clearSelection}
          onDelete={(file) => fileActions.remove([file])}
          onDeleteSelection={fileActions.remove}
          onDownload={(file) => void fileActions.download(file)}
          onEditDetails={fileActions.editDetails}
          onMove={(file) => fileActions.move([file])}
          onMoveSelection={fileActions.move}
          onRename={fileActions.rename}
          onRetryNextPage={loadMore}
          onSelectAll={explorer.selectAll}
          onToggleSelected={explorer.toggleSelected}
          selectedIds={explorer.selectedIds}
          sentinel={sentinel}
        />
      )}
      <FileActionDialogs {...fileActions.dialogs} folders={folders} />
      <FolderActionDialogs {...folderActions.dialogs} folders={folders} />
    </FileDropZone>
  );
}
