import { Plus } from 'lucide-react';
import { useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import type { AgentView } from '@/lib/workspace/workspace-tools.types';

interface CreateTeamDialogProps {
  readonly agents: readonly AgentView[];
  readonly onCreate: (name: string, memberIds: readonly string[]) => boolean;
}

export function CreateTeamDialog({ agents, onCreate }: CreateTeamDialogProps) {
  const nameId = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [memberIds, setMemberIds] = useState<readonly string[]>([]);
  const canCreate = name.trim().length > 0 && name.trim().length <= 60 && memberIds.length > 0;

  function changeOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setName('');
      setMemberIds([]);
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button className="w-full" variant="outline" size="sm">
          <Plus aria-hidden="true" className="size-3.5" />
          Créer une équipe
        </Button>
      </DialogTrigger>
      <DialogContent>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (canCreate && onCreate(name, memberIds)) changeOpen(false);
          }}
        >
          <DialogHeader>
            <DialogTitle>Composer une équipe</DialogTitle>
            <DialogDescription>
              Aperçu local — aucune exécution ni sauvegarde sur le serveur. Votre équipe reste
              disponible jusqu’au rechargement.
            </DialogDescription>
          </DialogHeader>
          <div className="my-6 space-y-5">
            <div className="space-y-2">
              <label className="text-sm font-medium" htmlFor={nameId}>
                Nom de l’équipe
              </label>
              <Input
                autoComplete="off"
                id={nameId}
                maxLength={60}
                onChange={(event) => setName(event.target.value)}
                placeholder="Ex. Mon atelier"
                required
                value={name}
              />
              <p className="text-xs text-muted-foreground">60 caractères maximum.</p>
            </div>
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Membres de l’équipe</legend>
              {agents.map((agent) => (
                <label
                  className="flex cursor-pointer items-start gap-3 rounded-xl border border-border p-3 hover:bg-background"
                  key={agent.id}
                >
                  <Checkbox
                    className="mt-1"
                    checked={memberIds.includes(agent.id)}
                    onChange={() =>
                      setMemberIds((previous) =>
                        previous.includes(agent.id)
                          ? previous.filter((id) => id !== agent.id)
                          : [...previous, agent.id],
                      )
                    }
                  />
                  <span className="text-sm font-medium">
                    {agent.name}
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {agent.description}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => changeOpen(false)}>
              Annuler
            </Button>
            <Button disabled={!canCreate} type="submit">
              Ajouter à l’aperçu
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
