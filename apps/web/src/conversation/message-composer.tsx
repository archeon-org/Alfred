import { ArrowUp, Paperclip } from 'lucide-react';

import { Button } from '../components/ui/button';

export function MessageComposer() {
  return (
    <form
      className="rounded-2xl border border-line bg-panel p-2 shadow-soft focus-within:border-brand-700 focus-within:ring-3 focus-within:ring-brand-700/30"
      id="composer"
      onSubmit={(event) => event.preventDefault()}
    >
      <label className="sr-only" htmlFor="message">
        Message
      </label>
      <textarea
        aria-describedby="composer-help"
        className="min-h-24 w-full resize-none rounded-xl bg-transparent px-3 py-3 text-sm leading-6 text-ink outline-none placeholder:text-muted"
        id="message"
        name="message"
        placeholder="Demandez à Alfred de préparer, analyser ou coordonner…"
        rows={3}
      />
      <div className="flex items-center justify-between gap-3 border-t border-line px-1 pt-2">
        <Button
          aria-label="Joindre un fichier"
          disabled
          size="icon"
          title="Bientôt disponible"
          variant="ghost"
        >
          <Paperclip aria-hidden="true" size={18} />
        </Button>
        <p className="hidden text-xs text-muted sm:block" id="composer-help">
          L’envoi sera activé avec le contrat de conversation.
        </p>
        <Button aria-label="Envoyer le message" disabled size="icon" title="Bientôt disponible">
          <ArrowUp aria-hidden="true" size={18} />
        </Button>
      </div>
    </form>
  );
}
