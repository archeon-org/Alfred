import { EXECUTION_MESSAGE_MAX_LENGTH, FILE_MAX_BYTES } from '@alfred/contracts';
import { ArrowUp, Paperclip, Sparkles, Square } from 'lucide-react';
import { useId, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ComposerAttachments } from '@/components/workspace/conversation/composer-attachments';
import { FilePickerButton } from '@/components/workspace/files/file-picker-button';
import { useFileDrop } from '@/hooks/ui/use-file-drop';
import { cn } from '@/lib/cn';
import {
  attachmentsBlockReason,
  sendableAttachments,
  type AttachmentView,
  type ComposerAttachmentsControls,
} from '@/lib/files/composer-attachments';
import { formatFileSize } from '@/lib/files/file-format';

const NO_FILES: readonly AttachmentView[] = [];

interface MessageComposerProps {
  /** Draft carried from a project input; kept in memory only until it is sent. */
  readonly defaultValue?: string;
  /**
   * Absent while the agent bridge is unavailable: the composer stays read-only. Resolves true
   * when the message was accepted; the draft and its files are kept otherwise.
   */
  readonly onSend?: (
    message: string,
    attachments: readonly AttachmentView[],
  ) => boolean | Promise<boolean>;
  /**
   * The files of the next message. Absent while the `fileUploads` capability is off: no
   * paperclip, no drop or paste handling and no mention of files.
   */
  readonly attachments?: ComposerAttachmentsControls | undefined;
  /** Sending is paused (the chat is being created); typing stays possible. */
  readonly isBusy?: boolean;
  /** Why sending is refused right now (for example, state discovery); typing stays possible. */
  readonly blockedReason?: string | null;
  readonly isStreaming?: boolean;
  readonly onStop?: () => void;
  readonly isStopping?: boolean | undefined;
}

export function MessageComposer({
  defaultValue,
  onSend,
  attachments,
  isBusy = false,
  blockedReason = null,
  isStreaming = false,
  onStop,
  isStopping = false,
}: MessageComposerProps) {
  const messageId = useId();
  const helpId = useId();
  // Drafts can always be typed; only sending depends on the agent bridge being available.
  const [value, setValue] = useState(defaultValue ?? '');
  const canSend = onSend !== undefined;
  const trimmed = value.trim();
  const drop = useFileDrop(attachments?.addFiles);
  // A file still travelling or being analysed, or one in failure, holds the message back.
  const filesBlock = attachments === undefined ? null : attachmentsBlockReason(attachments.items);
  const files = attachments === undefined ? NO_FILES : sendableAttachments(attachments.items);
  const ready =
    canSend &&
    !isStreaming &&
    !isBusy &&
    blockedReason === null &&
    filesBlock === null &&
    // A message may be its files alone.
    (trimmed.length > 0 || files.length > 0);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ready) return;
    const sent = trimmed;
    const sentFiles = sendableAttachments(attachments?.items ?? []);
    // Only an accepted message leaves the composer; a refused or failed send keeps the draft
    // and its files.
    const clear = (accepted: boolean) => {
      if (!accepted) return;
      setValue((current) => (current.trim() === sent ? '' : current));
      attachments?.clear(sentFiles.map((file) => file.localId));
    };
    const result = onSend(
      sent,
      sentFiles.map(({ fileId, kind, name }) => ({ fileId, kind, name })),
    );
    if (typeof result === 'boolean') clear(result);
    else void result.then(clear);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!canSend || event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing)
      return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  };
  const onPaste =
    attachments === undefined
      ? undefined
      : (event: ClipboardEvent<HTMLTextAreaElement>) => {
          const pasted = Array.from(event.clipboardData.files);
          if (pasted.length === 0) return;
          // A pasted screenshot joins the message; pasted text keeps its normal path.
          event.preventDefault();
          attachments.addFiles(pasted);
        };

  return (
    // No padding, background or spread ring above the box: the transcript scrolls right up to its
    // border instead of disappearing behind a band.
    <div className="mx-auto w-full max-w-conversation shrink-0 px-4 pb-4 md:px-6 md:pb-5 wide:px-8">
      <form
        className={cn(
          'rounded-2xl border border-border bg-background px-3 pt-3 pb-2 shadow-composer transition-shadow focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30 motion-reduce:transition-none',
          drop.isOver && 'border-ring ring-2 ring-ring/30',
        )}
        data-drop-target={drop.isOver ? '' : undefined}
        onSubmit={submit}
        {...drop.handlers}
      >
        {attachments !== undefined ? <ComposerAttachments attachments={attachments} /> : null}
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
          onPaste={onPaste}
          placeholder="Une idée, une question…"
          rows={2}
          value={value}
        />
        <div className="flex items-center gap-2">
          {attachments !== undefined ? (
            <FilePickerButton
              aria-label="Joindre des fichiers"
              inputLabel="Fichiers à joindre"
              onFiles={attachments.addFiles}
              size="icon-sm"
              title="Joindre des fichiers (PDF, DOCX, image)"
              variant="ghost"
            >
              <Paperclip aria-hidden="true" size={18} />
            </FilePickerButton>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-2xs text-muted-foreground">
            <Sparkles aria-hidden="true" size={14} />
            Alfred
            <span className="mx-0.5 inline-block size-1 rounded-full bg-muted-foreground" />
            Assistant
          </span>
          {isStreaming ? (
            <Button
              className="ml-auto"
              aria-label={isStopping ? 'Réessayer l’arrêt de la réponse' : 'Arrêter la réponse'}
              onClick={onStop}
              size="icon-sm"
              title={
                isStopping ? 'Arrêt demandé, en attente de confirmation' : 'Arrêter la réponse'
              }
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
          filesBlock ??
          (canSend
            ? `Entrée pour envoyer, Maj+Entrée pour un retour à la ligne.${
                attachments === undefined
                  ? ''
                  : ` Joignez des PDF, des DOCX ou des images, ${formatFileSize(FILE_MAX_BYTES)} au plus par fichier.`
              }`
            : 'L’envoi des messages arrive avec le raccordement de l’agent.')}
      </p>
    </div>
  );
}
