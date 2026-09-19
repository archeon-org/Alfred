import { FOLDER_MAX_DEPTH, type FileFolder } from '@alfred/contracts';

const byName = (left: FileFolder, right: FileFolder) =>
  left.name.localeCompare(right.name, 'fr', { numeric: true, sensitivity: 'base' });

/** Folders directly inside `parentId` (`null`: the top level), in alphabetical order. */
export function childFolders(
  folders: readonly FileFolder[],
  parentId: string | null,
): readonly FileFolder[] {
  return folders.filter((folder) => folder.parentId === parentId).sort(byName);
}

/** From the top level down to `folderId`; empty for the top level or an unknown folder. */
export function folderTrail(
  folders: readonly FileFolder[],
  folderId: string | null,
): readonly FileFolder[] {
  const trail: FileFolder[] = [];
  let current = folders.find((folder) => folder.id === folderId);
  // The depth bound also ends a malformed tree whose parents would loop.
  while (current !== undefined && trail.length < FOLDER_MAX_DEPTH) {
    trail.unshift(current);
    const parentId = current.parentId;
    current = parentId === null ? undefined : folders.find((folder) => folder.id === parentId);
  }
  return trail;
}

/** « Mes fichiers / Contrats / 2026 »: what the move dialog shows for each destination. */
export function folderPathLabel(folders: readonly FileFolder[], folderId: string | null): string {
  return ['Mes fichiers', ...folderTrail(folders, folderId).map((folder) => folder.name)].join(
    ' / ',
  );
}

/** `folderId` and everything below it: where a folder can never be moved. */
export function folderSubtree(folders: readonly FileFolder[], folderId: string): Set<string> {
  const subtree = new Set([folderId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const folder of folders) {
      if (folder.parentId !== null && subtree.has(folder.parentId) && !subtree.has(folder.id)) {
        subtree.add(folder.id);
        grew = true;
      }
    }
  }
  return subtree;
}

/** Every folder in reading order: each one directly followed by what it contains. */
export function flattenFolders(
  folders: readonly FileFolder[],
  parentId: string | null = null,
  guard = 0,
): readonly FileFolder[] {
  if (guard > FOLDER_MAX_DEPTH) return [];
  return childFolders(folders, parentId).flatMap((folder) => [
    folder,
    ...flattenFolders(folders, folder.id, guard + 1),
  ]);
}
