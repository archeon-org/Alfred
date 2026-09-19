import { FILE_SEARCH_MAX_LENGTH } from '@alfred/contracts';
import { FolderPlus, Search, Upload } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ActiveFileFilters,
  FileFilterMenu,
  type FileFilterHandlers,
} from '@/components/workspace/files/file-filters';
import { FilePickerButton } from '@/components/workspace/files/file-picker-button';
import type { FileFilterState } from '@/lib/files/file-filters';

interface FileExplorerToolbarProps extends FileFilterHandlers {
  readonly search: string;
  readonly onSearch: (value: string) => void;
  readonly filters: FileFilterState;
  readonly conversationAvailable: boolean;
  readonly onImport: (files: File[]) => void;
  readonly onCreateFolder: () => void;
}

/** Search, filters, import and folder creation of the explorer. */
export function FileExplorerToolbar({
  conversationAvailable,
  filters,
  onCreateFolder,
  onImport,
  onSearch,
  search,
  ...handlers
}: FileExplorerToolbarProps) {
  const id = useId();
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 basis-full sm:flex-1 sm:basis-auto">
          <label className="sr-only" htmlFor={id}>
            Rechercher un fichier
          </label>
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            size={16}
          />
          <Input
            className="pl-9"
            id={id}
            maxLength={FILE_SEARCH_MAX_LENGTH}
            onChange={(event) => onSearch(event.target.value)}
            placeholder="Rechercher dans tous vos fichiers…"
            type="search"
            value={search}
          />
        </div>
        <FileFilterMenu
          conversationAvailable={conversationAvailable}
          filters={filters}
          {...handlers}
        />
        <Button onClick={onCreateFolder} size="sm" variant="outline">
          <FolderPlus aria-hidden="true" size={16} />
          Nouveau dossier
        </Button>
        <FilePickerButton inputLabel="Fichiers à importer" onFiles={onImport} size="sm">
          <Upload aria-hidden="true" size={16} />
          Importer
        </FilePickerButton>
      </div>
      <ActiveFileFilters filters={filters} {...handlers} />
    </div>
  );
}
