import { Settings } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppearanceSettings } from '@/components/workspace/personalization/appearance-settings';

import { buttonVariants } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { IconButton } from '@/components/ui/icon-button';
import type { WorkspacePreferences } from '@/lib/workspace/workspace-preferences.types';

interface WorkspaceSettingsProps {
  readonly preferences: WorkspacePreferences;
}

export function WorkspaceSettings({ preferences }: WorkspaceSettingsProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <IconButton
          label="Paramètres"
          className="text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <Settings aria-hidden="true" size={18} />
        </IconButton>
      </DialogTrigger>
      <DialogContent
        data-reduced-motion={preferences.reducedMotion}
        className="border-border bg-card text-foreground data-[reduced-motion=true]:[&_*]:animate-none data-[reduced-motion=true]:[&_*]:transition-none data-[reduced-motion=true]:[&_*]:scale-100"
      >
        <DialogHeader>
          <DialogTitle>Paramètres</DialogTitle>
          <DialogDescription className="text-muted-foreground">
            Personnalisez votre espace. Ces préférences restent temporaires et sont réinitialisées
            au rechargement.
          </DialogDescription>
        </DialogHeader>
        <AppearanceSettings preferences={preferences} />
        <DialogFooter>
          <DialogClose asChild>
            <Link className={buttonVariants({ variant: 'outline' })} to="/app/settings">
              Tous les paramètres
            </Link>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
