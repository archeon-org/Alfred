import { useId, useState } from 'react';

import { Radio } from '@/components/ui/radio';
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
import { Skeleton } from '@/components/ui/skeleton';
import type { ConversationMoveTargets } from '@/hooks/conversations/use-conversation-move-targets';
import { useReturnFocus } from '@/hooks/ui/use-return-focus';

interface ConversationMoveDialogProps {
  readonly open: boolean;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly targets: ConversationMoveTargets;
  readonly onClose: () => void;
  readonly onMove: (projectId: string) => void;
}

function MoveForm({
  isPending,
  error,
  targets,
  onMove,
}: Omit<ConversationMoveDialogProps, 'open' | 'onClose'>) {
  const [selectedId, setSelectedId] = useState('');
  const name = useId();
  const selected = targets.projects.some((project) => project.id === selectedId);
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (selected && !isPending) onMove(selectedId);
      }}
    >
      <fieldset disabled={isPending} className="min-w-0">
        <legend className="mb-3 text-sm font-medium">Projet de destination</legend>
        <div className="max-h-64 space-y-2 overflow-y-auto">
          {targets.projects.map((project) => (
            <label
              key={project.id}
              className="flex cursor-pointer items-center gap-3 rounded-lg border border-border p-3 text-sm has-[:checked]:bg-accent has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
            >
              <Radio
                name={name}
                value={project.id}
                checked={selectedId === project.id}
                onChange={() => setSelectedId(project.id)}
              />
              <span className="min-w-0 wrap-anywhere">{project.name}</span>
            </label>
          ))}
          {targets.isLoading || targets.isLoadingMore ? (
            <div role="status" aria-label="Chargement des projets" className="space-y-2">
              {[0, 1, 2].map((index) => (
                <Skeleton key={index} className="h-12 w-full rounded-lg" />
              ))}
            </div>
          ) : null}
          {!targets.isLoading && !targets.error && targets.projects.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Créez un projet pour y ajouter cette conversation.
            </p>
          ) : null}
        </div>
        {targets.error ? (
          <div className="mt-3 text-sm" role="alert">
            <p>{targets.error}</p>
            <Button type="button" variant="outline" onClick={targets.onRetry}>
              Réessayer
            </Button>
          </div>
        ) : targets.hasMore ? (
          <Button
            className="mt-3"
            type="button"
            variant="outline"
            onClick={targets.onLoadMore}
            disabled={targets.isLoadingMore}
          >
            Charger plus de projets
          </Button>
        ) : null}
      </fieldset>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <DialogFooter className="mt-6">
        <DialogClose asChild>
          <Button type="button" variant="ghost" disabled={isPending}>
            Annuler
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!selected || isPending} aria-busy={isPending}>
          Ajouter au projet
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ConversationMoveDialog({ open, onClose, ...form }: ConversationMoveDialogProps) {
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
          <DialogTitle>Ajouter la conversation à un projet</DialogTitle>
          <DialogDescription>
            La conversation quitte les chats libres et rejoint le projet choisi. Son titre et son
            épinglage sont conservés.
          </DialogDescription>
        </DialogHeader>
        {open ? <MoveForm {...form} /> : null}
      </DialogContent>
    </Dialog>
  );
}
