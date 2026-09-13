import { ArrowUp } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

export interface ProjectChatComposerProps {
  readonly projectName: string;
  readonly isPending: boolean;
  readonly error: string | null;
  /**
   * Opens a chat in the project with the text as its first message. The field is never cleared
   * here: success navigates away and a failure keeps the draft next to its error.
   */
  readonly onSubmit: (text: string) => void | Promise<unknown>;
}

export function ProjectChatComposer({
  error,
  isPending,
  onSubmit,
  projectName,
}: ProjectChatComposerProps) {
  const fieldId = useId();
  const helpId = useId();
  const [text, setText] = useState('');
  const ready = text.trim().length > 0 && !isPending;
  const submit = () => {
    if (ready) void onSubmit(text.trim());
  };
  return (
    <form
      className="rounded-2xl border border-border bg-background px-3 pt-3 pb-2 shadow-composer transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 motion-reduce:transition-none"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <label className="sr-only" htmlFor={fieldId}>
        Nouveau chat dans {projectName}
      </label>
      <Textarea
        aria-describedby={helpId}
        aria-invalid={error ? true : undefined}
        className="max-h-40 min-h-14 resize-y border-0 bg-transparent px-2 py-1 text-base leading-relaxed shadow-none focus-visible:ring-0 md:text-sm"
        disabled={isPending}
        id={fieldId}
        name="message"
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            submit();
          }
        }}
        placeholder={`Nouveau chat dans ${projectName}…`}
        rows={2}
        value={text}
      />
      <div className="flex items-center gap-2">
        <p className="text-2xs text-muted-foreground" id={helpId}>
          {error ?? 'Votre message ouvre un chat dans ce projet. Entrée pour valider.'}
        </p>
        <Button
          aria-busy={isPending}
          aria-label="Ouvrir un nouveau chat"
          className="ml-auto"
          disabled={!ready}
          size="icon-sm"
          type="submit"
        >
          <ArrowUp aria-hidden="true" size={18} />
        </Button>
      </div>
      {error ? (
        <p className="sr-only" role="alert">
          {error}
        </p>
      ) : null}
    </form>
  );
}
