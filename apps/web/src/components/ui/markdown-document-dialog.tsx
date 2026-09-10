import { useState, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MarkdownEditor, measureText, type TextLimit } from '@/components/ui/markdown-editor';
import { useReturnFocus } from '@/hooks/ui/use-return-focus';

interface MarkdownDocumentDialogProps {
  /** Controlled document forms can supply import, revision and draft controls. */
  readonly children?: ReactNode;
  readonly open: boolean;
  readonly title: string;
  readonly description?: ReactNode;
  readonly value: string;
  readonly placeholder?: string;
  readonly limit?: TextLimit;
  readonly saveLabel?: string;
  readonly isPending?: boolean;
  readonly error?: string | null;
  readonly onSave: (value: string) => void;
  readonly onOpenChange: (open: boolean) => void;
}

type DocumentFormProps = Pick<
  MarkdownDocumentDialogProps,
  'error' | 'isPending' | 'limit' | 'onSave' | 'placeholder' | 'saveLabel' | 'title' | 'value'
>;

function DocumentForm({
  error,
  isPending = false,
  limit,
  onSave,
  placeholder,
  saveLabel = 'Enregistrer',
  title,
  value,
}: DocumentFormProps) {
  const [draft, setDraft] = useState(value);
  const unchanged = draft === value;
  const overLimit = limit !== undefined && measureText(draft, limit.unit) > limit.max;
  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!unchanged && !overLimit && !isPending) onSave(draft);
      }}
    >
      <MarkdownEditor
        disabled={isPending}
        label={title}
        limit={limit}
        onChange={setDraft}
        placeholder={placeholder}
        value={draft}
      />
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <DialogFooter>
        <DialogClose asChild>
          <Button disabled={isPending} variant="ghost">
            Annuler
          </Button>
        </DialogClose>
        <Button aria-busy={isPending} disabled={unchanged || overLimit || isPending} type="submit">
          {saveLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Reusable "open a Markdown document, edit, preview, save" dialog. */
export function MarkdownDocumentDialog({
  children,
  description,
  onOpenChange,
  open,
  ...form
}: MarkdownDocumentDialogProps) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog
      data-slot="markdown-document-dialog"
      open={open}
      onOpenChange={(next) => {
        if (!form.isPending) onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-3xl" {...returnFocus} showCloseButton={!form.isPending}>
        <DialogHeader>
          <DialogTitle>{form.title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {open ? (children ?? <DocumentForm key={form.value} {...form} />) : null}
      </DialogContent>
    </Dialog>
  );
}
