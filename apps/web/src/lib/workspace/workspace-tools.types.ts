export type WorkspaceToolTab = 'teams' | 'skills' | 'files';

/** View model consumed by the workspace; independent of React and hook implementation. */
export interface WorkspaceToolsState {
  readonly activeTab: WorkspaceToolTab;
  readonly setActiveTab: (tab: WorkspaceToolTab) => void;
}
