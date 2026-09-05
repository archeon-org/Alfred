import { Sparkles } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { MessageComposer } from '@/components/conversation/message-composer';

const suggestions = [
  'Préparer une note de synthèse',
  'Analyser un incident',
  'Composer une équipe d’agents',
] as const;

export function ConversationPanel() {
  return (
    <main
      className="flex min-h-[calc(100dvh-5rem)] min-w-0 flex-col px-4 py-6 sm:px-6 lg:px-8"
      id="main-content"
      tabIndex={-1}
    >
      <section className="mx-auto flex w-full max-w-4xl flex-1 flex-col" id="conversation">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <Badge className="gap-2">
              <Sparkles aria-hidden="true" size={14} />
              Prêt à collaborer
            </Badge>
            <h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] text-ink sm:text-4xl">
              Nouvelle conversation
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted sm:text-base">
              Décrivez votre objectif. Alfred préparera le travail et vous garderez la main sur les
              décisions sensibles.
            </p>
          </div>
        </div>

        <div className="grid flex-1 place-items-center py-10 sm:py-16">
          <div className="w-full max-w-2xl text-center">
            <span className="mx-auto grid size-14 place-items-center rounded-2xl bg-brand-100 text-brand-800">
              <Sparkles aria-hidden="true" size={26} />
            </span>
            <h2 className="mt-5 text-lg font-semibold text-ink">Que souhaitez-vous accomplir ?</h2>
            <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted">
              Commencez avec une demande libre ou utilisez l’un de ces exemples comme point de
              départ.
            </p>
            <ul
              className="mt-6 grid gap-3 text-left sm:grid-cols-3"
              aria-label="Exemples de demandes"
            >
              {suggestions.map((suggestion) => (
                <li key={suggestion}>
                  <Card className="h-full border-dashed p-3 text-sm leading-5 text-muted shadow-none">
                    {suggestion}
                  </Card>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <MessageComposer />
      </section>
    </main>
  );
}
