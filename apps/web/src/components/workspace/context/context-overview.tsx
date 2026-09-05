import { useId } from 'react';

import { Sparkles } from 'lucide-react';

import { AlfredMark } from '@/components/ui/alfred-mark';
import { ContextResources } from '@/components/workspace/context/context-resources';
import type { ConversationView } from '@/lib/workspace/workspace.types';

export function ContextOverview({
  conversation,
}: {
  readonly conversation: ConversationView | undefined;
}) {
  const id = useId();
  return (
    <>
      <section
        aria-label="Assistant"
        className="flex flex-wrap items-center gap-x-3 border-b border-border pb-5"
      >
        <AlfredMark className="shadow-sm" />
        <div>
          <h3 className="text-sm font-semibold">Alfred</h3>
          <p className="mt-1 text-2xs text-muted-foreground">Votre partenaire de réflexion</p>
        </div>
        <span className="mt-3 ml-12 rounded border border-primary/15 px-2 py-0.5 text-2xs text-primary">
          Assistant
        </span>
      </section>
      <section aria-labelledby={`${id}-overview`} className="border-b border-border py-5">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold" id={`${id}-overview`}>
            En un regard
          </h3>
          <Sparkles aria-hidden="true" className="size-3.5 text-primary/60" />
        </div>
        <dl className="mt-4 grid gap-3 text-2xs">
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Espace</dt>
            <dd className="font-medium">Personnel</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Conversation</dt>
            <dd className="font-medium">{conversation?.category ?? 'À explorer'}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-muted-foreground">Contenu</dt>
            <dd className="font-medium text-warning-foreground">Démonstration</dd>
          </div>
        </dl>
      </section>
      <div className="border-b border-border py-5">
        <ContextResources resources={conversation?.resources ?? []} />
      </div>
      <section aria-labelledby={`${id}-direction`} className="py-5">
        <h3 className="text-xs font-semibold" id={`${id}-direction`}>
          Le bon point de départ
        </h3>
        <p className="mt-3 text-2xs leading-loose text-muted-foreground">
          Donnez un peu de contexte : votre objectif, votre audience et le résultat attendu.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['Objectif', 'Contexte', 'Format'].map((tag) => (
            <span
              className="rounded border border-border bg-card px-1.5 py-1 text-2xs text-muted-foreground"
              key={tag}
            >
              {tag}
            </span>
          ))}
        </div>
      </section>
    </>
  );
}
