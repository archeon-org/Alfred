import { useState } from 'react';

import type {
  TeamView,
  WorkspaceToolTab,
  WorkspaceToolsState,
} from '@/lib/workspace/workspace-tools.types';
import { previewAgents, previewSkills, previewTeams } from '@/mock/workspace-tools';

/** Mount at screen level so collapsing a panel never discards this in-memory preview. */
export function useWorkspaceTools(): WorkspaceToolsState {
  const [activeTab, setActiveTab] = useState<WorkspaceToolTab>('context');
  const [teams, setTeams] = useState<readonly TeamView[]>(previewTeams);
  const [selectedTeamId, setSelectedTeamId] = useState('editorial');
  const [enabledSkillIds, setEnabledSkillIds] = useState<readonly string[]>(['synthesis']);

  function selectTeam(id: string) {
    if (teams.some((team) => team.id === id)) setSelectedTeamId(id);
  }

  function toggleSkill(id: string) {
    if (!previewSkills.some((skill) => skill.id === id)) return;
    setEnabledSkillIds((previous) =>
      previous.includes(id) ? previous.filter((skillId) => skillId !== id) : [...previous, id],
    );
  }

  function createTeam(name: string, memberIds: readonly string[]) {
    const cleanName = name.trim();
    const validMembers = [...new Set(memberIds)].filter((id) =>
      previewAgents.some((agent) => agent.id === id),
    );
    if (
      !cleanName ||
      cleanName.length > 60 ||
      validMembers.length === 0 ||
      validMembers.length !== memberIds.length
    )
      return false;
    const id = `local-team-${crypto.randomUUID()}`;
    setTeams((previous) => [
      ...previous,
      {
        id,
        name: cleanName,
        description: 'Votre équipe dans cet aperçu local.',
        memberIds: validMembers,
      },
    ]);
    setSelectedTeamId(id);
    return true;
  }

  return {
    activeTab,
    setActiveTab,
    teams,
    selectedTeamId,
    selectTeam,
    createTeam,
    selectedTeam: teams.find((team) => team.id === selectedTeamId),
    agents: previewAgents,
    skills: previewSkills,
    enabledSkillIds,
    toggleSkill,
  };
}
