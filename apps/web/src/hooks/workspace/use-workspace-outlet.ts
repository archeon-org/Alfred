import type { WorkspacePreferences } from '@/lib/workspace/workspace-preferences.types';
import type { RefObject } from 'react';
import { useOutletContext } from 'react-router-dom';

import type { ComposerAttachmentStore } from '@/hooks/files/use-composer-attachments';
import type { FileUploadManager } from '@/lib/files/file-upload';
import type { Project } from '@/lib/workspace/workspace.types';

/**
 * Uploads and composer chips live with the workspace frame, so the context panel, the file
 * explorer and the composer reach the same ones, and a change of screen interrupts none.
 */
export interface WorkspaceFiles {
  readonly uploads: FileUploadManager;
  readonly attachments: ComposerAttachmentStore;
}

/** What the workspace frame shares with the screen rendered in its main column. */
export interface WorkspaceOutletContext {
  readonly preferences: WorkspacePreferences;
  readonly conversationRef: RefObject<HTMLElement | null>;
  /** True while the frame previews skeletons or loads the navigation data. */
  readonly isLoading: boolean;
  readonly selectedProject: Project | undefined;
  readonly files: WorkspaceFiles;
}

export function useWorkspaceOutlet(): WorkspaceOutletContext {
  return useOutletContext<WorkspaceOutletContext>();
}
