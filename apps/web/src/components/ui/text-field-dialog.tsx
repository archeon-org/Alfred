import { useId, useState, type ReactNode } from 'react';

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
import { Input } from '@/components/ui/input';
import { useReturnFocus } from '@/hooks/ui/use-return-focus';

interface TextFieldDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description?: ReactNode;
  readonly label: string;
  readonly placeholder?: string;
  readonly initialValue?: string;
  readonly maxLength: number;
  readonly submitLabel: string;
  readonly cancelLabel?: string;
  readonly isPending?: boolean;
  readonly error?: string | null;
  readonly onSubmit: (value: string) => void;
  readonly onOpenChange: (open: boolean) => void;
}

type TextFieldFormProps = Pick<
  TextFieldDialogProps,
  | 'cancelLabel'
  | 'error'
  | 'initialValue'
  | 'isPending'
  | 'label'
  | 'maxLength'
  | 'onSubmit'
  | 'placeholder'
  | 'submitLabel'
>;

function TextFieldForm({
  cancelLabel = 'Annuler',
  error,
  initialValue = '',
  isPending = false,
  label,
  maxLength,
  onSubmit,
  placeholder,
  submitLabel,
}: TextFieldFormProps) {
  const fieldId = useId();
  const [value, setValue] = useState(initialValue);
  const trimmed = value.trim();
  const unchanged = trimmed === initialValue.trim();
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (trimmed.length > 0 && !unchanged && !isPending) onSubmit(trimmed);
      }}
    >
      <label className="mb-2 block text-sm font-medium" htmlFor={fieldId}>
        {label}
      </label>
      <Input
        aria-invalid={error ? true : undefined}
        disabled={isPending}
        id={fieldId}
        maxLength={maxLength}
        onChange={(event) => setValue(event.target.value)}
        placeholder={placeholder}
        required
        value={value}
      />
      {error ? (
        <p className="mt-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <DialogFooter className="mt-6">
        <DialogClose asChild>
          <Button disabled={isPending} variant="ghost">
            {cancelLabel}
          </Button>
        </DialogClose>
        <Button
          aria-busy={isPending}
          disabled={trimmed.length === 0 || unchanged || isPending}
          type="submit"
        >
          {submitLabel}
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Reusable single-field dialog: create or rename anything that has a name or a title. */
export function TextFieldDialog({
  description,
  onOpenChange,
  open,
  title,
  ...form
}: TextFieldDialogProps) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog
      data-slot="text-field-dialog"
      open={open}
      onOpenChange={(next) => {
        if (!form.isPending) onOpenChange(next);
      }}
    >
      <DialogContent {...returnFocus} showCloseButton={!form.isPending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        {open ? <TextFieldForm key={form.initialValue ?? ''} {...form} /> : null}
      </DialogContent>
    </Dialog>
  );
}
