import { AlfredMark } from '@/components/ui/alfred-mark';
import { cn } from '@/lib/cn';
import type { MessageView } from '@/lib/workspace/workspace.types';

export function MessageList({ messages }: { readonly messages: readonly MessageView[] }) {
  return (
    <div
      className="mx-auto w-full max-w-3xl animate-workspace-appear px-5 py-6 motion-reduce:animate-none md:px-8 md:pt-6 md:pb-4"
      aria-label="Messages d’exemple"
      role="region"
    >
      <p className="mb-6 flex items-center justify-center gap-4 text-2xs text-muted-foreground">
        <span className="h-px w-8 bg-accent" />
        Conversation d’exemple
        <span className="h-px w-8 bg-accent" />
      </p>
      {messages.map((message) => (
        <article
          className={cn('mb-7', message.role === 'user' && 'ml-4 md:ml-12')}
          key={message.id}
          aria-label={
            message.role === 'user' ? 'Votre message d’exemple' : 'Réponse d’exemple d’Alfred'
          }
        >
          <div
            className={cn(
              'mb-3 flex items-center gap-2 text-2xs font-semibold',
              message.role === 'user' && 'justify-end',
            )}
          >
            {message.role === 'assistant' ? (
              <AlfredMark className="size-8 rounded-lg [&_svg]:w-6" />
            ) : (
              <span className="grid size-7 place-items-center rounded-full bg-accent text-2xs text-muted-foreground">
                V
              </span>
            )}
            <span>{message.role === 'assistant' ? 'Alfred' : 'Vous'}</span>
            {message.role === 'assistant' ? (
              <span className="rounded bg-accent px-1.5 py-0.5 text-2xs font-normal text-muted-foreground">
                Exemple
              </span>
            ) : null}
          </div>
          <div
            data-slot="message-body"
            className={cn(
              'text-sm leading-relaxed text-muted-foreground md:text-xs [&>p+p]:mt-3.5',
              message.role === 'user' &&
                'rounded-2xl rounded-tr-sm border border-border bg-accent px-5 py-4',
            )}
          >
            {message.paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
            {message.highlights ? (
              <ul className="mt-5 border-t border-border">
                {message.highlights.map((highlight, index) => (
                  <li
                    className="flex items-start gap-3.5 border-b border-border py-3.5"
                    key={highlight}
                  >
                    <span className="pt-1 text-2xs text-muted-foreground">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <p>{highlight}</p>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </article>
      ))}
      <p className="text-2xs text-muted-foreground">
        Contenu fictif, présenté uniquement pour illustrer l’interface.
      </p>
    </div>
  );
}
