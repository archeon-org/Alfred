import { CircleHelp, Layers } from 'lucide-react';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ContextResources } from '@/components/workspace/context/context-resources';
import { ContextOverview } from '@/components/workspace/context/context-overview';
import { SkillsPanel } from '@/components/workspace/context/skills-panel';
import { TeamBuilder } from '@/components/workspace/context/team-builder';
import { ContextSkeleton } from '@/components/workspace/workspace-skeletons';
import type { WorkspaceToolsState } from '@/lib/workspace/workspace-tools.types';
import type { WorkspaceToolTab } from '@/lib/workspace/workspace-tools.types';
import type { WorkspaceScope } from '@/lib/workspace/workspace.types';

interface ContextPanelProps {
  readonly scope: WorkspaceScope;
  readonly isLoading: boolean;
  readonly tools: WorkspaceToolsState;
}

const toolTabs: readonly { readonly id: WorkspaceToolTab; readonly label: string }[] = [
  { id: 'context', label: 'Contexte' },
  { id: 'teams', label: 'Équipes' },
  { id: 'skills', label: 'Skills' },
  { id: 'files', label: 'Fichiers' },
];

export function ContextPanel({ scope, isLoading, tools }: ContextPanelProps) {
  return (
    <aside
      aria-label="Contexte de la conversation"
      className="flex min-h-0 min-w-0 workspace:h-full flex-col overflow-y-auto px-5 pt-4 pb-6 text-foreground [scrollbar-width:thin]"
      id="context-panel"
    >
      <div className="border-b border-border pt-0.5 pb-5">
        <span className="text-2xs font-semibold tracking-widest text-muted-foreground">
          À VOS CÔTÉS
        </span>
        <h2 className="mt-2 flex items-center justify-between text-xl font-medium tracking-tight">
          Votre atelier
          <Layers aria-hidden="true" className="size-4.5 text-primary/60" />
        </h2>
        <p className="mt-2 text-2xs text-muted-foreground">Le fil conducteur de votre travail.</p>
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
            <TabsList aria-label="Outils de la conversation" className="grid w-full grid-cols-4">
              {toolTabs.map((tab) => (
                <TabsTrigger className="min-w-0 px-1.5 text-2xs" key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent value="context" className="pt-5">
              <ContextOverview scope={scope} />
            </TabsContent>
            <TabsContent value="teams" className="pt-5">
              <TeamBuilder tools={tools} />
            </TabsContent>
            <TabsContent value="skills" className="pt-5">
              <SkillsPanel tools={tools} />
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
          <span className="text-2xs">Équipes, skills et fichiers restent des aperçus locaux.</span>
        </p>
      </div>
    </aside>
  );
}
