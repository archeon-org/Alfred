import {
  FILE_DESCRIPTION_MAX_LENGTH,
  FILE_MAX_TAGS,
  FILE_TAG_MAX_LENGTH,
  type StoredFile,
  type UpdateFileInput,
} from '@alfred/contracts';
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
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { useReturnFocus } from '@/hooks/ui/use-return-focus';
import { parseTags } from '@/lib/files/file-format';

interface FileDetailsDialogProps {
  readonly open: boolean;
  readonly file: StoredFile | null;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (input: Pick<UpdateFileInput, 'tags' | 'description'>) => void;
}

type DetailsFormProps = Omit<FileDetailsDialogProps, 'open' | 'onClose' | 'file'> & {
  readonly file: StoredFile;
};

function DetailsForm({ error, file, isPending, onSubmit }: DetailsFormProps) {
  const id = useId();
  const [tags, setTags] = useState(file.tags.join(', '));
  const [description, setDescription] = useState(file.description ?? '');
  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (isPending) return;
        const text = description.trim();
        onSubmit({ description: text === '' ? null : text, tags: parseTags(tags) });
      }}
    >
      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor={`${id}-tags`}>
          Tags
        </label>
        <Input
          aria-describedby={`${id}-tags-help`}
          disabled={isPending}
          id={`${id}-tags`}
          maxLength={FILE_MAX_TAGS * (FILE_TAG_MAX_LENGTH + 2)}
          onChange={(event) => setTags(event.target.value)}
          placeholder="contrat, 2026, à relire"
          value={tags}
        />
        <p className="mt-1.5 text-2xs text-muted-foreground" id={`${id}-tags-help`}>
          Séparez les tags par des virgules, {FILE_MAX_TAGS} au plus.
        </p>
      </div>
      <div>
        <label className="mb-2 block text-sm font-medium" htmlFor={`${id}-description`}>
          Description
        </label>
        <Textarea
          disabled={isPending}
          id={`${id}-description`}
          maxLength={FILE_DESCRIPTION_MAX_LENGTH}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          value={description}
        />
      </div>
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
        <Button aria-busy={isPending} disabled={isPending} type="submit">
          Enregistrer
        </Button>
      </DialogFooter>
    </form>
  );
}

/** Tags and description of one file: what the person adds to find it again. */
export function FileDetailsDialog({ file, onClose, open, ...form }: FileDetailsDialogProps) {
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
          <DialogTitle>Tags et description</DialogTitle>
          <DialogDescription>
            {file === null ? '' : `« ${file.name} » : ces informations vous aident à le retrouver.`}
          </DialogDescription>
        </DialogHeader>
        {open && file !== null ? <DetailsForm {...form} file={file} key={file.id} /> : null}
      </DialogContent>
    </Dialog>
  );
}
