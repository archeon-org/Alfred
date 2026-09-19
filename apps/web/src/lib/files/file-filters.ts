import {
  FILE_SEARCH_MAX_LENGTH,
  fileKindSchema,
  fileReadinessSchema,
  type FileKind,
  type FileListFilters,
  type FileReadiness,
} from '@alfred/contracts';

import { FILE_KIND_LABELS, FILE_READINESS_LABELS } from '@/lib/files/file-kinds';

/** What the person chose; `null` means « tous ». Folder scope is handled by the explorer itself. */
export interface FileFilterState {
  readonly search: string;
  readonly kind: FileKind | null;
  readonly readiness: FileReadiness | null;
  /** « Cette conversation »: only the files this conversation already carried. */
  readonly conversationId: string | null;
}

export const FILE_KIND_OPTIONS: readonly FileKind[] = ['pdf', 'docx', 'image'];
export const FILE_READINESS_OPTIONS: readonly FileReadiness[] = ['ready', 'processing', 'failed'];

/** The query the API receives: empty choices are left out. */
export function toListFilters(
  state: FileFilterState,
  folderId?: FileListFilters['folderId'],
): FileListFilters {
  const search = state.search.trim().slice(0, FILE_SEARCH_MAX_LENGTH);
  return {
    ...(search === '' ? {} : { search }),
    ...(state.kind === null ? {} : { kind: state.kind }),
    ...(state.readiness === null ? {} : { readiness: state.readiness }),
    ...(state.conversationId === null ? {} : { conversationId: state.conversationId }),
    ...(folderId === undefined ? {} : { folderId }),
  };
}

export interface ActiveFileFilter {
  readonly id: 'search' | 'kind' | 'readiness' | 'conversation';
  readonly label: string;
}

/** One removable chip per active choice, in a stable order. */
export function activeFileFilters(state: FileFilterState): readonly ActiveFileFilter[] {
  const search = state.search.trim();
  return [
    ...(search === '' ? [] : [{ id: 'search' as const, label: `Recherche : ${search}` }]),
    ...(state.kind === null
      ? []
      : [{ id: 'kind' as const, label: `Type : ${FILE_KIND_LABELS[state.kind]}` }]),
    ...(state.readiness === null
      ? []
      : [
          {
            id: 'readiness' as const,
            label: `État : ${FILE_READINESS_LABELS[state.readiness].toLowerCase()}`,
          },
        ]),
    ...(state.conversationId === null
      ? []
      : [{ id: 'conversation' as const, label: 'Cette conversation' }]),
  ];
}

const SEARCH_PARAM = 'q';
const KIND_PARAM = 'type';
const READINESS_PARAM = 'etat';
/** Carried by « Ouvrir mes fichiers »: the conversation the explorer can attach files to. */
export const CONVERSATION_PARAM = 'conversation';
const SCOPE_PARAM = 'jointes';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

/** The conversation named by the address, when it is a well-formed identifier. */
export function conversationFromParams(params: URLSearchParams): string | null {
  const value = params.get(CONVERSATION_PARAM);
  return value !== null && UUID.test(value) ? value.toLowerCase() : null;
}

/** Explorer filters live in the address, so a reload or a shared link shows the same list. */
export function filtersFromParams(params: URLSearchParams): FileFilterState {
  const kind = fileKindSchema.safeParse(params.get(KIND_PARAM));
  const readiness = fileReadinessSchema.safeParse(params.get(READINESS_PARAM));
  return {
    search: (params.get(SEARCH_PARAM) ?? '').slice(0, FILE_SEARCH_MAX_LENGTH),
    kind: kind.success ? kind.data : null,
    readiness: readiness.success ? readiness.data : null,
    conversationId: params.get(SCOPE_PARAM) === '1' ? conversationFromParams(params) : null,
  };
}

/** Writes `changes` into a copy of the address parameters; an empty choice removes its key. */
export function withFilterParams(
  params: URLSearchParams,
  changes: Partial<Omit<FileFilterState, 'conversationId'>> & {
    readonly onlyConversation?: boolean;
  },
): URLSearchParams {
  const next = new URLSearchParams(params);
  const write = (key: string, value: string | null | undefined) => {
    if (value === undefined) return;
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
  };
  write(SEARCH_PARAM, changes.search?.trim());
  write(KIND_PARAM, changes.kind);
  write(READINESS_PARAM, changes.readiness);
  if (changes.onlyConversation !== undefined)
    write(SCOPE_PARAM, changes.onlyConversation ? '1' : null);
  return next;
}

/** True when any choice narrows the list: the explorer then searches the whole library. */
export function hasActiveFilters(state: FileFilterState): boolean {
  return activeFileFilters(state).length > 0;
}
