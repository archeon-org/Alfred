import { cva } from 'class-variance-authority';
import { ArrowUpRight, Compass, ListChecks, ScanText } from 'lucide-react';

import { AlfredMark } from '@/components/ui/alfred-mark';
import { Button } from '@/components/ui/button';
import type { StarterPrompt } from '@/lib/workspace/workspace.types';

const promptIcons = { synthesize: ScanText, explore: Compass, plan: ListChecks };
const starterCard = cva(
  'relative flex h-full min-h-18 w-full flex-col items-start justify-center gap-0 rounded-xl border py-3.5 pr-9 pl-13 text-left shadow-xs hover:shadow-md md:min-h-36 md:justify-start md:px-3 md:py-4 wide:px-3.5',
  {
    variants: {
      kind: {
        synthesize: 'border-border bg-accent/50 text-accent-foreground hover:bg-accent',
        explore: 'border-border bg-warning/60 text-warning-foreground hover:bg-warning',
        plan: 'border-border bg-info/60 text-info-foreground hover:bg-info',
      },
    },
  },
);

interface ConversationWelcomeProps {
  readonly prompts: readonly StarterPrompt[];
  readonly onSelect: (id: string) => void;
}

export function ConversationWelcome({ prompts, onSelect }: ConversationWelcomeProps) {
  return (
    <div className="m-auto w-full max-w-conversation animate-workspace-appear px-5 pt-8 pb-5 text-center motion-reduce:animate-none md:px-6 md:pt-9 md:pb-8 wide:px-9">
      <div className="relative mx-auto mb-6 grid size-18 place-items-center md:size-22">
        <span className="absolute inset-0 rounded-full border border-border before:absolute before:-inset-2 before:rounded-full before:border before:border-border/50 after:absolute after:top-5 after:right-px after:size-1.5 after:rounded-full after:bg-primary/50 after:ring-4 after:ring-background" />
        <AlfredMark className="size-12 -rotate-6 rounded-2xl shadow-emblem md:size-14 md:rounded-3xl [&_svg]:size-10 [&_svg]:rotate-6" />
      </div>
      <p className="mb-4 text-2xs font-semibold tracking-label text-muted-foreground">
        L’ESPACE DES POSSIBLES
      </p>
      <h2 className="text-3xl leading-tight font-medium tracking-tight md:text-4xl">
        Vos idées,{' '}
        <span className="block font-editorial font-normal tracking-tight text-primary italic">
          un peu plus loin.
        </span>
      </h2>
      <p
        data-slot="welcome-description"
        className="mt-5 text-xs leading-relaxed text-muted-foreground"
      >
        Une question à explorer, des idées à structurer,
        <br className="hidden sm:block" /> une prochaine étape à dessiner. Commençons ici.
      </p>
      <div className="mt-7 mb-3 flex justify-between gap-2.5 text-left text-2xs text-muted-foreground md:mt-8">
        <span>Un point de départ</span>
        <span>3 exemples à explorer</span>
      </div>
      <ul
        className="grid grid-cols-1 gap-2 md:grid-cols-3 md:gap-2.5"
        aria-label="Exemples de demandes"
      >
        {prompts.map(({ id, kind, title, description, conversationId }) => {
          const Icon = promptIcons[kind];
          return (
            <li key={id}>
              <Button
                className={starterCard({ kind })}
                onClick={() => onSelect(conversationId)}
                variant="ghost"
              >
                <span className="absolute top-6 left-4 md:static md:mb-5" data-slot="prompt-icon">
                  <Icon aria-hidden="true" size={21} />
                </span>
                <ArrowUpRight
                  className="absolute top-7 right-3 md:top-4"
                  aria-hidden="true"
                  size={16}
                />
                <strong className="text-xs leading-normal font-semibold">{title}</strong>
                <span className="mt-1 text-2xs leading-relaxed font-normal">{description}</span>
              </Button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
