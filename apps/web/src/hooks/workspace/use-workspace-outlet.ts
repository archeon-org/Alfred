import type { WorkspacePreferences } from '@/lib/workspace/workspace-preferences.types';
import type { RefObject } from 'react';
import { useOutletContext } from 'react-router-dom';

import type { Project } from '@/lib/workspace/workspace.types';

/** What the workspace frame shares with the screen rendered in its main column. */
export interface WorkspaceOutletContext {
  readonly preferences: WorkspacePreferences;
  readonly conversationRef: RefObject<HTMLElement | null>;
  /** True while the frame previews skeletons or loads the navigation data. */
  readonly isLoading: boolean;
  readonly selectedProject: Project | undefined;
}

export function useWorkspaceOutlet(): WorkspaceOutletContext {
  return useOutletContext<WorkspaceOutletContext>();
}
