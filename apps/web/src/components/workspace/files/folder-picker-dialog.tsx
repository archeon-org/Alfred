import type { FileFolder } from '@alfred/contracts';
import { useId, useState } from 'react';

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
import { Radio } from '@/components/ui/radio';
import { useReturnFocus } from '@/hooks/ui/use-return-focus';
import { flattenFolders, folderPathLabel } from '@/lib/files/folder-tree';

/** The top level of the library, as a destination. */
const ROOT = 'root';

interface FolderPickerDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly folders: readonly FileFolder[];
  /** Destinations that make no sense: a folder itself and what it contains. */
  readonly excludedIds?: ReadonlySet<string>;
  /** Where the items are now; offered but marked, since choosing it changes nothing. */
  readonly currentId?: string | null | undefined;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  /** `null` is the top level. */
  readonly onSubmit: (folderId: string | null) => void;
}

type PickerFormProps = Omit<FolderPickerDialogProps, 'open' | 'title' | 'description' | 'onClose'>;

function PickerForm({
  currentId,
  error,
  excludedIds,
  folders,
  isPending,
  onSubmit,
}: PickerFormProps) {
  const name = useId();
  const [selected, setSelected] = useState<string | null>(null);
  const destinations = [
    { id: ROOT, label: folderPathLabel(folders, null) },
    ...flattenFolders(folders)
      .filter((folder) => excludedIds?.has(folder.id) !== true)
      .map((folder) => ({ id: folder.id, label: folderPathLabel(folders, folder.id) })),
  ];
  const current = currentId === undefined ? undefined : (currentId ?? ROOT);
  const unchanged = selected === null || selected === current;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!unchanged && !isPending) onSubmit(selected === ROOT ? null : selected);
      }}
    >
      <fieldset className="min-w-0" disabled={isPending}>
        <legend className="mb-3 text-sm font-medium">Dossier de destination</legend>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {destinations.map((destination) => (
            <label
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
              key={destination.id}
            >
              <Radio
                checked={selected === destination.id}
                name={name}
                onChange={() => setSelected(destination.id)}
                value={destination.id}
              />
              <span className="min-w-0 wrap-anywhere">
                {destination.label}
                {destination.id === current ? (
                  <span className="text-muted-foreground"> (emplacement actuel)</span>
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {error ? (
        <p className="mt-3 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <DialogFooter className="mt-6">
        <DialogClose asChild>
          <Button disabled={isPending} variant="ghost">
            Annuler
          </Button>
        </DialogClose>
        <Button aria-busy={isPending} disabled={unchanged || isPending} type="submit">
          Déplacer ici
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Choose a destination among the folders, each shown with its whole path. */
export function FolderPickerDialog({
  description,
  onClose,
  open,
  title,
  ...form
}: FolderPickerDialogProps) {
  const returnFocus = useReturnFocus();
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !form.isPending) onClose();
      }}
    >
      <DialogContent {...returnFocus} showCloseButton={!form.isPending}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {open ? <PickerForm {...form} /> : null}
      </DialogContent>
    </Dialog>
  );
}
