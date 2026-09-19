import { CircleHelp, PanelRightClose } from 'lucide-react';

import { IconButton } from '@/components/ui/icon-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContextResources } from '@/components/workspace/context/context-resources';
import { SkillsPanel } from '@/components/workspace/context/skills-panel';
import { TeamBuilder } from '@/components/workspace/context/team-builder';
import { ContextSkeleton } from '@/components/workspace/workspace-skeletons';
import { useShortcutHint } from '@/hooks/workspace/use-shortcut-preferences';
import type { WorkspaceToolsState } from '@/lib/workspace/workspace-tools.types';
import type { WorkspaceToolTab } from '@/lib/workspace/workspace-tools.types';

interface ContextPanelProps {
  readonly isLoading: boolean;
  readonly tools: WorkspaceToolsState;
  /** Folds the docked panel away or closes its sheet; the gutter or the bar brings it back. */
  readonly onClose?: () => void;
}

const toolTabs: readonly { readonly id: WorkspaceToolTab; readonly label: string }[] = [
  { id: 'teams', label: 'Équipes' },
  { id: 'skills', label: 'Skills' },
  { id: 'files', label: 'Fichiers' },
];

export function ContextPanel({ isLoading, tools, onClose }: ContextPanelProps) {
  const closeHint = useShortcutHint('toggleContext', 'Masquer le contexte');
  return (
    <aside
      aria-label="Contexte de la conversation"
      className="flex h-full min-h-0 min-w-0 flex-col overflow-y-auto overscroll-contain px-5 pt-4 pb-6 text-foreground [scrollbar-width:thin]"
      id="context-panel"
    >
      <div className="border-b border-border pt-0.5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="text-2xs font-semibold tracking-widest text-muted-foreground">
              À VOS CÔTÉS
            </span>
            <h2 className="mt-1.5 text-xl font-medium tracking-tight">Votre atelier</h2>
          </div>
          {onClose ? (
            <IconButton
              aria-controls="context-panel"
              aria-expanded
              className="-mt-1 -mr-2 shrink-0 text-muted-foreground"
              label="Masquer le contexte"
              onClick={onClose}
              size="icon-sm"
              {...closeHint}
            >
              <PanelRightClose aria-hidden="true" size={16} />
            </IconButton>
          ) : null}
        </div>
        <p className="mt-1.5 text-2xs text-muted-foreground">Le fil conducteur de votre travail.</p>
      </div>
      <div aria-busy={isLoading} className="pt-5">
        {isLoading ? (
          <ContextSkeleton />
        ) : (
          <Tabs
            value={tools.activeTab}
            onValueChange={(value) => {
              if (toolTabs.some((tab) => tab.id === value))
                tools.setActiveTab(value as WorkspaceToolTab);
            }}
          >
            <TabsList aria-label="Outils de la conversation" className="grid w-full grid-cols-3">
              {toolTabs.map((tab) => (
                <TabsTrigger className="min-w-0 px-1.5 text-2xs" key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="teams" className="pt-5">
              <TeamBuilder tools={tools} />
            </TabsContent>
            <TabsContent value="skills" className="pt-5">
              <SkillsPanel />
            </TabsContent>
            <TabsContent value="files" className="pt-5">
              <ContextResources resources={[]} />
              <p className="mt-4 text-2xs leading-relaxed text-muted-foreground">
                L’ajout et la lecture de documents seront disponibles ultérieurement.
              </p>
            </TabsContent>
          </Tabs>
        )}
      </div>
      <div className="mt-auto flex items-start gap-2 pt-7 text-muted-foreground">
        <CircleHelp aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <p className="text-2xs leading-relaxed">
          Votre espace prend forme.
          <br />
          <span className="text-2xs">
            Les équipes restent des aperçus locaux. Les fichiers arrivent bientôt.
          </span>
        </p>
      </div>
    </aside>
  );
}
