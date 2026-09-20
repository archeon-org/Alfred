import { CircleHelp, PanelRightClose } from 'lucide-react';

import { IconButton } from '@/components/ui/icon-button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AgentCatalog } from '@/components/workspace/context/agent-catalog';
import { SkillsPanel } from '@/components/workspace/context/skills-panel';
import { FilesPanel, type FilesPanelProps } from '@/components/workspace/files/files-panel';
import { ContextSkeleton } from '@/components/workspace/workspace-skeletons';
import { useFeatureFlagsQuery } from '@/hooks/feature-flags/use-feature-flags-query';
import { useShortcutHint } from '@/hooks/workspace/use-shortcut-preferences';
import { cn } from '@/lib/cn';
import type { WorkspaceToolsState } from '@/lib/workspace/workspace-tools.types';
import type { WorkspaceToolTab } from '@/lib/workspace/workspace-tools.types';

interface ContextPanelProps {
  readonly isLoading: boolean;
  readonly tools: WorkspaceToolsState;
  /** Folds the docked panel away or closes its sheet; the gutter or the bar brings it back. */
  readonly onClose?: () => void;
  /** What the « Fichiers » tab needs from the workspace frame; the tab needs the capability too. */
  readonly files?: FilesPanelProps;
}

const toolTabs: readonly { readonly id: WorkspaceToolTab; readonly label: string }[] = [
  { id: 'teams', label: 'Équipes' },
  { id: 'skills', label: 'Skills' },
  { id: 'files', label: 'Fichiers' },
];

/** The tab list is a grid: one column per tab that actually exists. */
const TAB_COLUMNS = ['grid-cols-1', 'grid-cols-1', 'grid-cols-2', 'grid-cols-3'] as const;

export function ContextPanel({ isLoading, tools, onClose, files }: ContextPanelProps) {
  const closeHint = useShortcutHint('toggleContext', 'Masquer le contexte');
  const { flags, status } = useFeatureFlagsQuery();
  // Équipes and Fichiers exist only while the API serves `teams` and `fileUploads`: a capability
  // that is off leaves no tab, no placeholder and no request behind.
  const available = {
    teams: status === 'ready' && flags.teams,
    skills: true,
    files: status === 'ready' && flags.fileUploads && files !== undefined,
  };
  const tabs = toolTabs.filter((tab) => available[tab.id]);
  const activeTab = tabs.some((tab) => tab.id === tools.activeTab)
    ? tools.activeTab
    : (tabs[0]?.id ?? 'skills');
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
            value={activeTab}
            onValueChange={(value) => {
              if (tabs.some((tab) => tab.id === value))
                tools.setActiveTab(value as WorkspaceToolTab);
            }}
          >
            <TabsList
              aria-label="Outils de la conversation"
              className={cn('grid w-full', TAB_COLUMNS[tabs.length])}
            >
              {tabs.map((tab) => (
                <TabsTrigger className="min-w-0 px-1.5 text-2xs" key={tab.id} value={tab.id}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {tabs.some((tab) => tab.id === 'teams') ? (
              <TabsContent value="teams" className="pt-5">
                <AgentCatalog />
              </TabsContent>
            ) : null}
            <TabsContent value="skills" className="pt-5">
              <SkillsPanel />
            </TabsContent>
            {available.files && files !== undefined ? (
              <TabsContent value="files" className="pt-5">
                <FilesPanel {...files} />
              </TabsContent>
            ) : null}
          </Tabs>
        )}
      </div>
      <div className="mt-auto flex items-start gap-2 pt-7 text-muted-foreground">
        <CircleHelp aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
        <p className="text-2xs leading-relaxed">Votre espace prend forme.</p>
      </div>
    </aside>
  );
}
