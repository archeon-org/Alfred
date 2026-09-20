import type { FileFolder, FileQuota } from '@alfred/contracts';
import { ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';

import { BreadcrumbItem, Breadcrumbs, breadcrumbLinkClassName } from '@/components/ui/breadcrumbs';
import { buttonVariants } from '@/components/ui/button';
import { FolderActionMenu, type FolderActions } from '@/components/workspace/files/explorer-rows';
import { QuotaMeter } from '@/components/workspace/files/quota-meter';
import { explorerPath } from '@/hooks/files/use-file-explorer';

interface FileExplorerHeaderProps {
  /** From the top level down to the open folder; empty at the top level. */
  readonly trail: readonly FileFolder[];
  /** The conversation the explorer was opened from, and its title once known. */
  readonly conversation: { readonly id: string; readonly title: string | undefined } | null;
  readonly quota: FileQuota | undefined;
  readonly quotaFailed: boolean;
  /** Rename, move or delete the open folder itself. */
  readonly folderActions: FolderActions;
}

/** Title, way back to the conversation, quota and the trail of folders. */
export function FileExplorerHeader({
  conversation,
  folderActions,
  quota,
  quotaFailed,
  trail,
}: FileExplorerHeaderProps) {
  const conversationId = conversation?.id ?? null;
  const current = trail.at(-1);
  return (
    <header className="space-y-4">
      {conversation !== null ? (
        <Link
          className={buttonVariants({ size: 'sm', variant: 'outline' })}
          to={`/app/conversations/${encodeURIComponent(conversation.id)}`}
        >
          <ArrowLeft aria-hidden="true" size={14} />
          Retour à la conversation
          {conversation.title === undefined ? null : (
            <span className="max-w-48 truncate font-normal text-muted-foreground">
              {conversation.title}
            </span>
          )}
        </Link>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-2">
          <h1 className="text-lg font-semibold">Mes fichiers</h1>
          <p className="text-sm text-muted-foreground">
            Vos PDF, DOCX et images, rangés comme vous l’entendez. Alfred lit ceux que vous joignez
            à un message.
          </p>
        </div>
        <QuotaMeter className="w-full sm:w-64" isError={quotaFailed} quota={quota} />
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Breadcrumbs className="min-w-0 flex-1">
          {current === undefined ? (
            <BreadcrumbItem current>Mes fichiers</BreadcrumbItem>
          ) : (
            <>
              <BreadcrumbItem>
                <Link className={breadcrumbLinkClassName} to={explorerPath(null, conversationId)}>
                  Mes fichiers
                </Link>
              </BreadcrumbItem>
              {trail.slice(0, -1).map((folder) => (
                <BreadcrumbItem key={folder.id}>
                  <Link
                    className={breadcrumbLinkClassName}
                    to={explorerPath(folder.id, conversationId)}
                  >
                    {folder.name}
                  </Link>
                </BreadcrumbItem>
              ))}
              <BreadcrumbItem current>{current.name}</BreadcrumbItem>
            </>
          )}
        </Breadcrumbs>
        {current === undefined ? null : <FolderActionMenu folder={current} {...folderActions} />}
      </div>
    </header>
  );
}
