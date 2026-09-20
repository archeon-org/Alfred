import { useCallback, useId } from 'react';

import { AGENT_SEARCH_MAX_LENGTH, agentDisplayName, type AgentSummary } from '@alfred/contracts';
import { Bot, Search } from 'lucide-react';

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
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgentCatalog } from '@/hooks/agents/use-agent-catalog';
import { useInfiniteScroll } from '@/hooks/ui/use-infinite-scroll';
import { cn } from '@/lib/cn';

/** The specialists the runtime declares as sub-agents. Listing one grants no access to it. */
export function AgentCatalog() {
  const id = useId();
  const { agents, input, query, search, setInput } = useAgentCatalog();
  const { fetchNextPage, hasNextPage, isFetching, isFetchNextPageError } = query;
  // Any request in flight (a refresh, a new search, a page) blocks the next one: fetching a page
  // during a refresh would discard the refreshed result.
  const loadMore = useCallback(() => {
    if (!isFetching) void fetchNextPage({ cancelRefetch: false });
  }, [fetchNextPage, isFetching]);
  const sentinel = useInfiniteScroll(
    hasNextPage && !isFetching && !isFetchNextPageError && !query.isError,
    loadMore,
  );
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
      <div className="relative">
        <label className="sr-only" htmlFor={`${id}-search`}>
          Rechercher un agent
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          className="h-8 pl-8 text-xs md:text-xs"
          id={`${id}-search`}
          maxLength={AGENT_SEARCH_MAX_LENGTH}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Nom, description, thème…"
          type="search"
          value={input}
        />
      </div>
      {query.isPending ? (
        <div aria-busy="true" className="space-y-1.5" role="status">
          <span className="sr-only">Chargement des agents…</span>
          <Skeleton className="h-9 rounded-lg" />
          <Skeleton className="h-9 rounded-lg" />
        </div>
      ) : query.isError && !isFetchNextPageError ? (
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
        <p className="text-xs text-muted-foreground" role="status">
          {search === ''
            ? 'Aucun agent spécialiste n’est déclaré.'
            : `Aucun agent ne correspond à « ${search} ».`}
        </p>
      ) : (
        <div aria-busy={isFetching}>
          <ul
            aria-label="Agents spécialistes"
            className={cn(
              'space-y-1.5 transition-opacity motion-reduce:transition-none',
              query.isPlaceholderData && 'opacity-60',
            )}
          >
            {agents.map((agent) => (
              <AgentRow agent={agent} key={agent.id} />
            ))}
          </ul>
          {query.isFetchingNextPage ? (
            <div className="mt-1.5" role="status">
              <span className="sr-only">Chargement d’autres agents…</span>
              <Skeleton className="h-9 rounded-lg" />
            </div>
          ) : null}
          {isFetchNextPageError ? (
            <div className="mt-2 space-y-2" role="alert">
              <p className="text-xs text-muted-foreground">
                Impossible de charger la suite des agents.
              </p>
              <Button size="sm" variant="outline" onClick={loadMore}>
                Réessayer
              </Button>
            </div>
          ) : null}
          {hasNextPage ? <div aria-hidden="true" className="h-px" ref={sentinel} /> : null}
        </div>
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
