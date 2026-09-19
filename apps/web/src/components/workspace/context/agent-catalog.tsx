import { useId } from 'react';

import type { AgentSummary } from '@alfred/contracts';
import { Bot } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentCatalog } from '@/hooks/agents/use-agent-catalog';
import { agentDisplayName } from '@/lib/agents/agent-display-name';

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
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
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
        <ul aria-label="Agents spécialistes" className="space-y-1.5">
          {agents.map((agent) => (
            <AgentRow agent={agent} key={agent.id} />
          ))}
        </ul>
      )}
    </section>
  );
}

function AgentRow({ agent }: { readonly agent: AgentSummary }) {
  const label = agentDisplayName(agent.name);
  return (
    <li className="flex min-h-9 items-center justify-between gap-2 rounded-lg border border-border bg-card/70 py-1 pr-1 pl-3">
      <h4 className="min-w-0 truncate text-xs font-medium" title={label}>
        {label}
      </h4>
      <Dialog>
        <DialogTrigger asChild>
          <Button
            aria-label={`Détails de ${label}`}
            className="h-7 shrink-0 px-2 text-2xs"
            size="sm"
            variant="ghost"
          >
            Détails
          </Button>
        </DialogTrigger>
        <AgentDetailsDialog agent={agent} label={label} />
      </Dialog>
    </li>
  );
}

function AgentDetailsDialog({
  agent,
  label,
}: {
  readonly agent: AgentSummary;
  readonly label: string;
}) {
  const summary = agent.shortDescription ?? agent.description;
  const description = agent.description !== summary ? agent.description : null;
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 break-words">
          <Bot aria-hidden="true" className="size-4 shrink-0 text-primary" />
          {label}
        </DialogTitle>
        <DialogDescription>{summary ?? 'Aucune description fournie.'}</DialogDescription>
      </DialogHeader>
      {description !== null ? (
        <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
          {description}
        </p>
      ) : null}
      {agent.tags.length > 0 ? (
        <ul aria-label={`Thèmes de ${label}`} className="flex flex-wrap gap-1.5">
          {agent.tags.map((tag) => (
            <li key={tag}>
              <Badge className="min-h-6 px-2 text-xs font-medium">{tag}</Badge>
            </li>
          ))}
        </ul>
      ) : null}
      <p className="text-2xs text-muted-foreground">
        Identifiant : <code className="font-mono break-all">{agent.name}</code>
      </p>
    </DialogContent>
  );
}
