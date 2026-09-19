import { describe, expect, it } from 'vitest';

import {
  activeFileFilters,
  conversationFromParams,
  filtersFromParams,
  hasActiveFilters,
  toListFilters,
  withFilterParams,
  type FileFilterState,
} from '@/lib/files/file-filters';
import {
  childFolders,
  flattenFolders,
  folderPathLabel,
  folderSubtree,
  folderTrail,
} from '@/lib/files/folder-tree';
import { fileFolder } from '../../../support/files-api';

const CONVERSATION = '3f2e1d0c-9b8a-4765-8321-fedcba987654';
const none: FileFilterState = { search: '', kind: null, readiness: null, conversationId: null };

describe('file filters', () => {
  it('sends only the choices that are made', () => {
    expect(toListFilters(none)).toEqual({});
    expect(toListFilters(none, 'root')).toEqual({ folderId: 'root' });
    expect(
      toListFilters({
        search: '  bilan ',
        kind: 'pdf',
        readiness: 'ready',
        conversationId: CONVERSATION,
      }),
    ).toEqual({ search: 'bilan', kind: 'pdf', readiness: 'ready', conversationId: CONVERSATION });
  });

  it('names each active choice for its chip', () => {
    expect(hasActiveFilters(none)).toBe(false);
    expect(
      activeFileFilters({
        search: 'bilan',
        kind: 'image',
        readiness: 'processing',
        conversationId: CONVERSATION,
      }),
    ).toEqual([
      { id: 'search', label: 'Recherche : bilan' },
      { id: 'kind', label: 'Type : Image' },
      { id: 'readiness', label: 'État : en cours' },
      { id: 'conversation', label: 'Cette conversation' },
    ]);
  });

  it('reads filters from the address and ignores what is malformed', () => {
    expect(
      filtersFromParams(
        new URLSearchParams(`q=bilan&type=pdf&etat=failed&jointes=1&conversation=${CONVERSATION}`),
      ),
    ).toEqual({
      search: 'bilan',
      kind: 'pdf',
      readiness: 'failed',
      conversationId: CONVERSATION,
    });
    expect(filtersFromParams(new URLSearchParams('type=exe&etat=done&jointes=1'))).toEqual(none);
    expect(conversationFromParams(new URLSearchParams('conversation=../../etc'))).toBeNull();
    // Naming a conversation does not filter by it: that takes the explicit choice.
    expect(
      filtersFromParams(new URLSearchParams(`conversation=${CONVERSATION}`)).conversationId,
    ).toBeNull();
  });

  it('writes a change into the address and removes an emptied choice', () => {
    const base = new URLSearchParams(`conversation=${CONVERSATION}&type=pdf`);
    const next = withFilterParams(base, { search: ' bilan ', kind: null, onlyConversation: true });
    expect(next.get('q')).toBe('bilan');
    expect(next.has('type')).toBe(false);
    expect(next.get('jointes')).toBe('1');
    expect(next.get('conversation')).toBe(CONVERSATION);
    expect(base.get('type')).toBe('pdf');
    const cleared = withFilterParams(next, { search: '', onlyConversation: false });
    expect(cleared.has('q')).toBe(false);
    expect(cleared.has('jointes')).toBe(false);
  });
});

describe('folder tree', () => {
  const contracts = fileFolder({ id: 'a', name: 'Contrats' });
  const year = fileFolder({ id: 'b', name: '2026', parentId: 'a', depth: 2 });
  const archive = fileFolder({ id: 'c', name: 'Archives' });
  const folders = [contracts, year, archive];

  it('lists children alphabetically and builds the trail and its label', () => {
    expect(childFolders(folders, null).map((folder) => folder.name)).toEqual([
      'Archives',
      'Contrats',
    ]);
    expect(folderTrail(folders, 'b').map((folder) => folder.name)).toEqual(['Contrats', '2026']);
    expect(folderTrail(folders, null)).toEqual([]);
    expect(folderTrail(folders, 'missing')).toEqual([]);
    expect(folderPathLabel(folders, 'b')).toBe('Mes fichiers / Contrats / 2026');
    expect(folderPathLabel(folders, null)).toBe('Mes fichiers');
  });

  it('finds what a folder contains and flattens the tree in reading order', () => {
    expect([...folderSubtree(folders, 'a')].sort()).toEqual(['a', 'b']);
    expect(flattenFolders(folders).map((folder) => folder.id)).toEqual(['c', 'a', 'b']);
  });

  it('ends on a malformed tree whose parents loop', () => {
    const looped = [fileFolder({ id: 'x', parentId: 'y' }), fileFolder({ id: 'y', parentId: 'x' })];
    expect(folderTrail(looped, 'x').length).toBeLessThanOrEqual(8);
    expect(flattenFolders(looped)).toEqual([]);
  });
});
