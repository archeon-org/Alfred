import { useId } from 'react';

import { UsersRound } from 'lucide-react';

import { NativeSelect } from '@/components/ui/native-select';
import { CreateTeamDialog } from '@/components/workspace/context/create-team-dialog';
import type { WorkspaceToolsState } from '@/lib/workspace/workspace-tools.types';

export function TeamBuilder({
  tools,
}: {
  readonly tools: Pick<
    WorkspaceToolsState,
    'agents' | 'teams' | 'selectedTeam' | 'selectedTeamId' | 'selectTeam' | 'createTeam'
  >;
}) {
  const id = useId();
  const members = tools.agents.filter((agent) => tools.selectedTeam?.memberIds.includes(agent.id));
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold" id={`${id}-title`}>
            Team builder
          </h3>
          <UsersRound aria-hidden="true" className="size-4 text-primary" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Les bons regards, autour de votre conversation.
        </p>
      </div>
      <div className="space-y-2">
        <label className="text-xs font-medium" htmlFor={`${id}-team`}>
          Équipe de la conversation
        </label>
        <NativeSelect
          id={`${id}-team`}
          value={tools.selectedTeamId}
          onChange={(event) => tools.selectTeam(event.target.value)}
        >
          {tools.teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </NativeSelect>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {tools.selectedTeam?.description}
        </p>
      </div>
      <ul aria-label="Membres de l’équipe" className="space-y-3">
        {members.map((agent) => (
          <li
            key={agent.id}
            className="flex gap-3 rounded-xl border border-border bg-card/70 p-3 shadow-sm"
          >
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-2xs font-semibold text-primary"
            >
              {agent.initials}
            </span>
            <div className="min-w-0">
              <h4 className="text-xs font-semibold">{agent.name}</h4>
              <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">
                {agent.description}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <CreateTeamDialog agents={tools.agents} onCreate={tools.createTeam} />
      <p className="text-2xs leading-relaxed text-muted-foreground">
        Aperçu local : cette sélection ne lance aucun agent.
      </p>
    </section>
  );
}
