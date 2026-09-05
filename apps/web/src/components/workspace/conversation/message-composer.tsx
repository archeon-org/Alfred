import { ArrowUp, Paperclip, Sparkles } from 'lucide-react';
import { useId } from 'react';
import { Textarea } from '@/components/ui/textarea';

import { Button } from '@/components/ui/button';

export function MessageComposer() {
  const messageId = useId();
  const helpId = useId();
  return (
    <div className="mx-auto w-full max-w-conversation shrink-0 px-4 py-4 md:px-6 md:pt-4 md:pb-5 wide:px-8">
      <form
        className="rounded-2xl border border-border bg-background px-3 pt-3 pb-2 shadow-composer transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 motion-reduce:transition-none"
        onSubmit={(event) => event.preventDefault()}
      >
        <label className="sr-only" htmlFor={messageId}>
          Message
        </label>
        <Textarea
          aria-describedby={helpId}
          className="max-h-40 min-h-16 resize-y border-0 bg-transparent px-2 py-1 text-base leading-relaxed shadow-none focus-visible:ring-0 md:text-sm"
          id={messageId}
          name="message"
          placeholder="Une idée, une question…"
          rows={2}
        />
        <div className="flex items-center gap-2">
          <Button
            aria-label="Joindre un fichier"
            disabled
            size="icon-sm"
            title="Disponible prochainement"
            variant="ghost"
          >
            <Paperclip aria-hidden="true" size={18} />
          </Button>
          <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
            <Sparkles aria-hidden="true" size={14} />
            Alfred
            <span className="mx-0.5 inline-block size-1 rounded-full bg-muted-foreground" />
            Assistant
          </span>
          <Button
            className="ml-auto"
            aria-label="Envoyer le message"
            disabled
            size="icon-sm"
            title="Envoi indisponible dans cet aperçu"
          >
            <ArrowUp aria-hidden="true" size={18} />
          </Button>
        </div>
      </form>
      <p id={helpId} className="mt-3.5 text-center text-2xs leading-relaxed text-muted-foreground">
        Aperçu de l’interface · L’envoi et les pièces jointes seront disponibles prochainement.
      </p>
    </div>
  );
}
