import { FILE_ROOT_FOLDER, type FileKind, type FileReadiness } from '@alfred/contracts';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import { useFileList } from '@/hooks/files/use-file-catalog';
import { useFileFolders } from '@/hooks/files/use-file-folders';
import { SEARCH_DEBOUNCE_MS } from '@/hooks/ui/use-debounced-search';
import {
  CONVERSATION_PARAM,
  conversationFromParams,
  filtersFromParams,
  hasActiveFilters,
  toListFilters,
  withFilterParams,
} from '@/lib/files/file-filters';
import { childFolders, folderTrail } from '@/lib/files/folder-tree';

/** The address of a folder of the explorer; the conversation to attach to travels with it. */
export function explorerPath(folderId: string | null, conversationId: string | null): string {
  const path = folderId === null ? '/app/files' : `/app/files/${encodeURIComponent(folderId)}`;
  return conversationId === null
    ? path
    : `${path}?${CONVERSATION_PARAM}=${encodeURIComponent(conversationId)}`;
}

/**
 * State of `/app/files[/:folderId]`. The folder comes from the path, search and filters from the
 * address parameters, so a reload, the back button or a copied link show the same list. While a
 * search or a filter is active the whole library is searched; otherwise one folder is listed.
 */
export function useFileExplorer() {
  const { folderId: folderParam } = useParams();
  const folderId = folderParam?.toLowerCase() ?? null;
  const [params, setParams] = useSearchParams();
  const filters = filtersFromParams(params);
  const conversationId = conversationFromParams(params);
  const searching = hasActiveFilters(filters);
  const { folders, query: foldersQuery } = useFileFolders();
  const list = useFileList(
    toListFilters(filters, searching ? undefined : (folderId ?? FILE_ROOT_FOLDER)),
  );

  // The field answers at once; the address, and with it the request, follows settled typing.
  const [input, setInput] = useState(filters.search);
  const [seenSearch, setSeenSearch] = useState(filters.search);
  if (seenSearch !== filters.search) {
    setSeenSearch(filters.search);
    // Back, forward or a removed chip changed the address: the field follows, except for the
    // echo of its own text, which must not eat a trailing space being typed.
    if (filters.search !== input.trim()) setInput(filters.search);
  }
  const typed = input.trim();
  const committed = filters.search;
  useEffect(() => {
    if (typed === committed) return;
    const timer = setTimeout(
      () => setParams((current) => withFilterParams(current, { search: typed }), { replace: true }),
      SEARCH_DEBOUNCE_MS,
    );
    return () => clearTimeout(timer);
  }, [committed, setParams, typed]);

  // A selection belongs to the list it was made in.
  const view = `${folderId ?? ''}|${params.toString()}`;
  const [selection, setSelection] = useState<{
    readonly view: string;
    readonly ids: ReadonlySet<string>;
  }>({ ids: new Set(), view });
  const selectedIds = selection.view === view ? selection.ids : new Set<string>();
  const select = (ids: ReadonlySet<string>) => setSelection({ ids, view });

  const change = (changes: Parameters<typeof withFilterParams>[1]) =>
    setParams((current) => withFilterParams(current, changes), { replace: true });

  return {
    ...list,
    conversationId,
    filters,
    folderId,
    folders,
    foldersQuery,
    /** Unknown once the tree loaded: deleted elsewhere, or a mistyped address. */
    folderMissing:
      folderId !== null &&
      foldersQuery.isSuccess &&
      !folders.some((folder) => folder.id === folderId),
    input,
    searching,
    selectedIds,
    subfolders: searching ? [] : childFolders(folders, folderId),
    trail: folderTrail(folders, folderId),
    setInput,
    setKind: (kind: FileKind | null) => change({ kind }),
    setReadiness: (readiness: FileReadiness | null) => change({ readiness }),
    setOnlyConversation: (onlyConversation: boolean) => change({ onlyConversation }),
    clearSearch: () => {
      setInput('');
      change({ search: '' });
    },
    toggleSelected: (fileId: string) => {
      const next = new Set(selectedIds);
      if (!next.delete(fileId)) next.add(fileId);
      select(next);
    },
    selectAll: (fileIds: readonly string[]) => select(new Set(fileIds)),
    clearSelection: () => select(new Set()),
  };
}
