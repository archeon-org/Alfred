import type { ReactNode } from 'react';

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
import { useReturnFocus } from '@/hooks/ui/use-return-focus';

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: ReactNode;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
  /** Renders the confirmation as a destructive action (deletion, revocation). */
  readonly destructive?: boolean;
  readonly isPending?: boolean;
  readonly error?: string | null;
  readonly onConfirm: () => void;
  readonly onOpenChange: (open: boolean) => void;
}

/** The single confirmation dialog of the application; every risky action goes through it. */
export function ConfirmDialog({
  cancelLabel = 'Annuler',
  confirmLabel,
  description,
  destructive = false,
  error,
  isPending = false,
  onConfirm,
  onOpenChange,
  open,
  title,
}: ConfirmDialogProps) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog
      data-slot="confirm-dialog"
      open={open}
      onOpenChange={(next) => {
        if (!isPending) onOpenChange(next);
      }}
    >
      <DialogContent {...returnFocus} role="alertdialog" showCloseButton={!isPending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <DialogClose asChild>
            <Button disabled={isPending} variant="ghost">
              {cancelLabel}
            </Button>
          </DialogClose>
          <Button
            aria-busy={isPending}
            disabled={isPending}
            onClick={onConfirm}
            variant={destructive ? 'destructive' : 'default'}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
