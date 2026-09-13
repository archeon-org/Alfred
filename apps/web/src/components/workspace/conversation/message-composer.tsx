import { EXECUTION_MESSAGE_MAX_LENGTH } from '@alfred/contracts';
import { ArrowUp, Paperclip, Sparkles, Square } from 'lucide-react';
import { useId, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Textarea } from '@/components/ui/textarea';

import { Button } from '@/components/ui/button';

interface MessageComposerProps {
  /** Draft carried from a project input; kept in memory only until it is sent. */
  readonly defaultValue?: string;
  /**
   * Absent while the agent bridge is unavailable: the composer stays read-only. Resolves true
   * when the message was accepted; the draft is kept otherwise.
   */
  readonly onSend?: (message: string) => boolean | Promise<boolean>;
  /** Sending is paused (the chat is being created); typing stays possible. */
  readonly isBusy?: boolean;
  /** Why sending is refused right now (another chat is answering); typing stays possible. */
  readonly blockedReason?: string | null;
  readonly isStreaming?: boolean;
  readonly onStop?: () => void;
}

export function MessageComposer({
  defaultValue,
  onSend,
  isBusy = false,
  blockedReason = null,
  isStreaming = false,
  onStop,
}: MessageComposerProps) {
  const messageId = useId();
  const helpId = useId();
  // Drafts can always be typed; only sending depends on the agent bridge being available.
  const [value, setValue] = useState(defaultValue ?? '');
  const canSend = onSend !== undefined;
  const trimmed = value.trim();
  const ready = canSend && !isStreaming && !isBusy && blockedReason === null && trimmed.length > 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    const sent = trimmed;
    // Only an accepted message leaves the composer; a refused or failed send keeps the draft.
    const clear = (accepted: boolean) => {
      if (accepted) setValue((current) => (current.trim() === sent ? '' : current));
    };
    const result = onSend(sent);
    if (typeof result === 'boolean') clear(result);
    else void result.then(clear);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!canSend || event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing)
      return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };

  return (
    <div className="mx-auto w-full max-w-conversation shrink-0 px-4 py-4 md:px-6 md:pt-4 md:pb-5 wide:px-8">
      <form
        className="rounded-2xl border border-border bg-background px-3 pt-3 pb-2 shadow-composer transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 motion-reduce:transition-none"
        onSubmit={submit}
      >
        <label className="sr-only" htmlFor={messageId}>
          Message
        </label>
        <Textarea
          aria-describedby={helpId}
          className="max-h-40 min-h-16 resize-y border-0 bg-transparent px-2 py-1 text-base leading-relaxed shadow-none focus-visible:ring-0 md:text-sm"
          id={messageId}
          maxLength={EXECUTION_MESSAGE_MAX_LENGTH}
          name="message"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Une idée, une question…"
          rows={2}
          value={value}
        />
        <div className="flex items-center gap-2">
          <Button
            aria-label="Joindre un fichier"
            disabled
            size="icon-sm"
            title="Disponible prochainement"
            type="button"
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
          {isStreaming ? (
            <Button
              className="ml-auto"
              aria-label="Arrêter la réponse"
              onClick={onStop}
              size="icon-sm"
              title="Arrêter la réponse"
              type="button"
              variant="outline"
            >
              <Square aria-hidden="true" size={16} />
            </Button>
          ) : (
            <Button
              className="ml-auto"
              aria-label="Envoyer le message"
              disabled={!ready}
              size="icon-sm"
              title={canSend ? 'Envoyer (Entrée)' : 'Envoi indisponible pour le moment'}
              type="submit"
            >
              <ArrowUp aria-hidden="true" size={18} />
            </Button>
          )}
        </div>
      </form>
      <p id={helpId} className="mt-3.5 text-center text-2xs leading-relaxed text-muted-foreground">
        {blockedReason ??
          (canSend
            ? 'Entrée pour envoyer, Maj+Entrée pour un retour à la ligne. Les pièces jointes arrivent plus tard.'
            : 'L’envoi des messages et les pièces jointes arrivent avec le raccordement de l’agent.')}
      </p>
    </div>
  );
}
