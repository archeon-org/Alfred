import { FolderOpen, Pencil, Pin, PinOff, Trash2 } from 'lucide-react';

import { ActionMenu, type ActionMenuItem } from '@/components/ui/action-menu';
import type { Project } from '@/lib/workspace/workspace.types';

export interface ProjectActionHandlers {
  readonly onRename: (project: Project) => void;
  readonly onTogglePin: (project: Project) => void;
  readonly onDelete: (project: Project) => void;
}

interface ProjectActionMenuProps extends ProjectActionHandlers {
  readonly project: Project;
  /** Offered when the menu is shown away from the project page. */
  readonly onHome?: (project: Project) => void;
  readonly className?: string;
  readonly size?: 'icon' | 'icon-sm';
}

/** Builds the items of a project's "⋯" menu; shared by the sidebar and the project page. */
export function projectActionItems({
  onDelete,
  onHome,
  onRename,
  onTogglePin,
  project,
}: Omit<ProjectActionMenuProps, 'className' | 'size'>): readonly ActionMenuItem[] {
  const pinned = project.pinnedAt !== null;
  return [
    ...(onHome
      ? [
          {
            icon: FolderOpen,
            id: 'home',
            label: 'Accueil du projet',
            onSelect: () => onHome(project),
          },
        ]
      : []),
    { icon: Pencil, id: 'rename', label: 'Renommer le projet', onSelect: () => onRename(project) },
    {
      icon: pinned ? PinOff : Pin,
      id: 'pin',
      label: pinned ? 'Désépingler le projet' : 'Épingler le projet',
      onSelect: () => onTogglePin(project),
    },
    {
      destructive: true,
      icon: Trash2,
      id: 'delete',
      label: 'Supprimer le projet',
      onSelect: () => onDelete(project),
      separatorBefore: true,
    },
  ];
}

export function ProjectActionMenu({ className, size, ...handlers }: ProjectActionMenuProps) {
  const name = handlers.project.name ?? 'Projet';
  return (
    <ActionMenu
      className={className}
      items={projectActionItems(handlers)}
      label={`Actions du projet ${name}`}
      size={size}
    />
  );
}
