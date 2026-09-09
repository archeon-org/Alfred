import { useState } from 'react';

import {
  useDeleteProject,
  useSetProjectPinned,
  useUpdateProject,
} from '@/hooks/projects/use-project-mutations';
import { describeApiError } from '@/lib/workspace/api-error-message';
import type { Project } from '@/lib/workspace/workspace.types';

export interface PendingProjectAction {
  readonly type: 'delete' | 'rename';
  readonly project: Project;
}

/** State handed to `ProjectActionDialogs`; the dialogs themselves stay presentational. */
export interface ProjectActionDialogsState {
  readonly pending: PendingProjectAction | null;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onRename: (name: string) => void;
  readonly onConfirmDelete: () => void;
}

interface UseProjectActionsOptions {
  /** Called after a successful deletion, for example to leave the deleted project's pages. */
  readonly onDeleted?: (project: Project) => void;
}

/** Rename, pin/unpin and delete a project from anywhere (sidebar menu, project page). */
export function useProjectActions({ onDeleted }: UseProjectActionsOptions = {}) {
  const update = useUpdateProject();
  const remove = useDeleteProject();
  const setPinned = useSetProjectPinned();
  const [pending, setPending] = useState<PendingProjectAction | null>(null);

  const close = () => {
    setPending(null);
    update.reset();
    remove.reset();
  };

  const dialogs: ProjectActionDialogsState = {
    error:
      pending?.type === 'rename' && update.isError
        ? describeApiError(update.error, 'Impossible de renommer le projet.')
        : pending?.type === 'delete' && remove.isError
          ? describeApiError(remove.error, 'Impossible de supprimer le projet.')
          : null,
    isPending: update.isPending || remove.isPending,
    onClose: close,
    onConfirmDelete: () => {
      if (pending?.type !== 'delete') return;
      const { project } = pending;
      remove.mutate(project.id, {
        onSuccess: () => {
          close();
          onDeleted?.(project);
        },
      });
    },
    onRename: (name) => {
      if (pending?.type !== 'rename') return;
      update.mutate({ id: pending.project.id, input: { name } }, { onSuccess: close });
    },
    pending,
  };

  return {
    dialogs,
    pinError: setPinned.isError
      ? describeApiError(setPinned.error, 'Impossible de modifier l’épinglage du projet.')
      : null,
    remove: (project: Project) => setPending({ project, type: 'delete' }),
    rename: (project: Project) => setPending({ project, type: 'rename' }),
    togglePin: (project: Project) =>
      setPinned.mutate({ id: project.id, pinned: project.pinnedAt === null }),
  };
}
