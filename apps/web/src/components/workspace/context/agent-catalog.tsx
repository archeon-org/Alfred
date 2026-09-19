import { useId } from 'react';

import type { AgentSummary } from '@alfred/contracts';
import { Bot } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentCatalog } from '@/hooks/agents/use-agent-catalog';

/** The specialists the runtime declares as sub-agents. Listing one grants no access to it. */
export function AgentCatalog() {
  const id = useId();
  const { agents, query } = useAgentCatalog();
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-4">
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-semibold" id={`${id}-title`}>
            Agents spécialistes
          </h3>
          <Bot aria-hidden="true" className="size-4 text-primary" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Les spécialistes auxquels Alfred peut confier une partie du travail.
        </p>
      </div>
      {query.isPending ? (
        <div aria-busy="true" className="space-y-3" role="status">
          <span className="sr-only">Chargement des agents…</span>
          <Skeleton className="h-16 rounded-xl" />
          <Skeleton className="h-16 rounded-xl" />
        </div>
      ) : query.isError ? (
        <div className="space-y-2" role="alert">
          <p className="text-xs text-muted-foreground">Impossible de charger les agents.</p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void query.refetch();
            }}
          >
            Réessayer
          </Button>
        </div>
      ) : agents.length === 0 ? (
        <p className="text-xs text-muted-foreground">Aucun agent spécialiste n’est déclaré.</p>
      ) : (
        <ul aria-label="Agents spécialistes" className="space-y-3">
          {agents.map((agent) => (
            <AgentCard agent={agent} key={agent.id} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AgentCard({ agent }: { readonly agent: AgentSummary }) {
  const summary = agent.shortDescription ?? agent.description;
  const details = agent.description !== null && agent.description !== summary;
  return (
    <li className="rounded-xl border border-border bg-card/70 p-3 shadow-sm">
      <h4 className="text-xs font-semibold break-words">{agent.name}</h4>
      {summary !== null ? (
        <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{summary}</p>
      ) : null}
      {agent.tags.length > 0 ? (
        <ul aria-label={`Thèmes de ${agent.name}`} className="mt-2 flex flex-wrap gap-1">
          {agent.tags.map((tag) => (
            <li key={tag}>
              <Badge className="min-h-5 px-2 text-2xs font-medium">{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {details ? (
        <details className="mt-2">
          <summary className="cursor-pointer rounded-sm text-2xs font-medium text-primary focus-visible:outline-2 focus-visible:outline-ring">
            Détails
          </summary>
          <p className="mt-1 text-2xs leading-relaxed text-muted-foreground">{agent.description}</p>
        </details>
      ) : null}
    </li>
  );
}
