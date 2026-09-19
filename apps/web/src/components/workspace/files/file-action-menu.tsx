import type { StoredFile } from '@alfred/contracts';
import { Download, FolderInput, Pencil, Tags, Trash2 } from 'lucide-react';

import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu';

export interface FileRowActions {
  readonly onDownload: (file: StoredFile) => void;
  readonly onRename: (file: StoredFile) => void;
  readonly onMove: (file: StoredFile) => void;
  readonly onDelete: (file: StoredFile) => void;
  /** Tags and description; offered by the explorer only. */
  readonly onEditDetails?: (file: StoredFile) => void;
}

interface FileActionMenuProps extends FileRowActions {
  readonly file: StoredFile;
  readonly disabled?: boolean;
}

/** The "⋯" menu of one library file; deletion comes last, in the destructive tone. */
export function FileActionMenu({
  disabled = false,
  file,
  onDelete,
  onDownload,
  onEditDetails,
  onMove,
  onRename,
}: FileActionMenuProps) {
  const items: ActionMenuItem[] = [
    { id: 'download', icon: Download, label: 'Télécharger', onSelect: () => onDownload(file) },
    { id: 'rename', icon: Pencil, label: 'Renommer', onSelect: () => onRename(file) },
    { id: 'move', icon: FolderInput, label: 'Déplacer', onSelect: () => onMove(file) },
    ...(onEditDetails === undefined
      ? []
      : [
          {
            id: 'details',
            icon: Tags,
            label: 'Tags et description',
            onSelect: () => onEditDetails(file),
          },
        ]),
    {
      id: 'delete',
      icon: Trash2,
      label: 'Supprimer',
      destructive: true,
      separatorBefore: true,
      onSelect: () => onDelete(file),
    },
  ];
  return (
    <ActionMenu
      className="shrink-0"
      items={items.map((item) => ({ ...item, disabled }))}
      label={`Actions du fichier ${file.name}`}
    />
  );
}
