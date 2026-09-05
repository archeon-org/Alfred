import { useId, useRef, useState, type RefObject } from 'react';

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
import type { WorkspaceCreationKind } from '@/lib/workspace/workspace.types';

const creationLabels = {
  project: {
    title: 'Nouveau projet',
    field: 'Nom du projet',
    submit: 'Créer le projet',
    placeholder: 'Ex. Préparation du comité',
    maxLength: 80,
  },
  conversation: {
    title: 'Nouvelle conversation',
    field: 'Titre de la conversation',
    submit: 'Créer la conversation',
    placeholder: 'Ex. Définir les prochaines étapes',
    maxLength: 120,
  },
  sandbox: {
    title: 'Nouvelle sandbox',
    field: 'Titre de la conversation',
    submit: 'Créer la sandbox',
    placeholder: 'Ex. Une idée à explorer',
    maxLength: 120,
  },
};

interface WorkspaceCreateDialogProps {
  readonly kind: WorkspaceCreationKind;
  readonly projectName: string | undefined;
  readonly onClose: () => void;
  readonly onCreate: (kind: WorkspaceCreationKind, title: string) => boolean;
  readonly returnFocusRef: RefObject<HTMLElement | null>;
  readonly conversationRef: RefObject<HTMLElement | null>;
}

export function WorkspaceCreateDialog({
  kind,
  projectName,
  onClose,
  onCreate,
  returnFocusRef,
  conversationRef,
}: WorkspaceCreateDialogProps) {
  const titleId = useId();
  const [title, setTitle] = useState('');
  const created = useRef(false);
  const labels = creationLabels[kind];
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          (created.current ? conversationRef : returnFocusRef).current?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>
            {kind === 'conversation' && projectName
              ? `Dans le projet « ${projectName} ».`
              : kind === 'sandbox'
                ? 'Un espace libre, en dehors de vos projets.'
                : 'Regroupez les conversations autour d’un même objectif.'}{' '}
            Aperçu local : rien n’est enregistré sur le serveur.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (onCreate(kind, title)) {
              created.current = true;
              onClose();
            }
          }}
        >
          <label className="mb-2 block text-sm font-medium" htmlFor={titleId}>
            {labels.field}
          </label>
          <Input
            id={titleId}
            maxLength={labels.maxLength}
            placeholder={labels.placeholder}
            required
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <DialogFooter className="mt-6">
            <DialogClose asChild>
              <Button variant="ghost">Annuler</Button>
            </DialogClose>
            <Button type="submit" disabled={!title.trim()}>
              {labels.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
