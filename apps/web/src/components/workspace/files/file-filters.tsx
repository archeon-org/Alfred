import type { FileKind, FileReadiness } from '@alfred/contracts';
import { ListFilter } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Chip, ChipList } from '@/components/ui/chip';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  activeFileFilters,
  FILE_KIND_OPTIONS,
  FILE_READINESS_OPTIONS,
  type ActiveFileFilter,
  type FileFilterState,
} from '@/lib/files/file-filters';
import { FILE_KIND_LABELS, FILE_READINESS_LABELS } from '@/lib/files/file-kinds';

export interface FileFilterHandlers {
  readonly onKind: (kind: FileKind | null) => void;
  readonly onReadiness: (readiness: FileReadiness | null) => void;
  readonly onOnlyConversation: (only: boolean) => void;
  readonly onClearSearch: () => void;
}

interface FileFilterMenuProps extends FileFilterHandlers {
  readonly filters: FileFilterState;
  /** « Cette conversation » exists only while a conversation is in view. */
  readonly conversationAvailable: boolean;
}

/** One menu for the three filters; choosing the checked entry again removes that filter. */
export function FileFilterMenu({
  conversationAvailable,
  filters,
  onKind,
  onOnlyConversation,
  onReadiness,
}: FileFilterMenuProps) {
  const count = activeFileFilters({ ...filters, search: '' }).length;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button
          aria-label={count > 0 ? `Filtrer les fichiers (${count} actifs)` : 'Filtrer les fichiers'}
          className="shrink-0"
          size="sm"
          variant="outline"
        >
          <ListFilter aria-hidden="true" size={14} />
          Filtrer
          {count > 0 ? <span aria-hidden="true">· {count}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" aria-label="Filtrer les fichiers">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Type</DropdownMenuLabel>
          {FILE_KIND_OPTIONS.map((kind) => (
            <DropdownMenuCheckboxItem
              checked={filters.kind === kind}
              key={kind}
              onCheckedChange={(checked) => onKind(checked ? kind : null)}
            >
              {FILE_KIND_LABELS[kind]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>État</DropdownMenuLabel>
          {FILE_READINESS_OPTIONS.map((readiness) => (
            <DropdownMenuCheckboxItem
              checked={filters.readiness === readiness}
              key={readiness}
              onCheckedChange={(checked) => onReadiness(checked ? readiness : null)}
            >
              {FILE_READINESS_LABELS[readiness]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        {conversationAvailable ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem
              checked={filters.conversationId !== null}
              onCheckedChange={(checked) => onOnlyConversation(checked)}
            >
              Cette conversation
            </DropdownMenuCheckboxItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

interface ActiveFileFiltersProps extends FileFilterHandlers {
  readonly filters: FileFilterState;
}

/** The choices that narrow the list, each removable on its own. */
export function ActiveFileFilters({
  filters,
  onClearSearch,
  onKind,
  onOnlyConversation,
  onReadiness,
}: ActiveFileFiltersProps) {
  const active = activeFileFilters(filters);
  if (active.length === 0) return null;
  const remove = (id: ActiveFileFilter['id']) => {
    if (id === 'search') onClearSearch();
    else if (id === 'kind') onKind(null);
    else if (id === 'readiness') onReadiness(null);
    else onOnlyConversation(false);
  };
  return (
    <ChipList aria-label="Filtres actifs">
      {active.map((filter) => (
        <Chip
          key={filter.id}
          label={filter.label}
          onRemove={() => remove(filter.id)}
          removeLabel={`Retirer le filtre « ${filter.label} »`}
        />
      ))}
    </ChipList>
  );
}
