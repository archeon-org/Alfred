/** Local presentation models, independent of future agent and API contracts. */
export type WorkspaceToolTab = 'teams' | 'skills' | 'files';

export interface AgentView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly initials: string;
}

export interface TeamView {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly memberIds: readonly string[];
}

/** View model consumed by the workspace; independent of React and hook implementation. */
export interface WorkspaceToolsState {
  readonly activeTab: WorkspaceToolTab;
  readonly setActiveTab: (tab: WorkspaceToolTab) => void;
  readonly teams: readonly TeamView[];
  readonly selectedTeamId: string;
  readonly selectTeam: (id: string) => void;
  readonly createTeam: (name: string, memberIds: readonly string[]) => boolean;
  readonly selectedTeam: TeamView | undefined;
  readonly agents: readonly AgentView[];
}
