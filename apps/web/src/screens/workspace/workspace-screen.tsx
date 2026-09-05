import { useRef, useState } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';

import { ConversationPanel } from '@/components/workspace/conversation/conversation-panel';
import { ContextPanel } from '@/components/workspace/context/context-panel';
import { WorkspaceHeader } from '@/components/workspace/header/workspace-header';
import { WorkspaceLayout } from '@/components/workspace/workspace-layout';
import { WorkspaceSidebar } from '@/components/workspace/navigation/workspace-sidebar';
import { WorkspaceCreateDialog } from '@/components/workspace/workspace-create-dialog';
import { useWorkspacePreferences } from '@/hooks/workspace/use-workspace-preferences';
import { useWorkspacePreview } from '@/hooks/workspace/use-workspace-preview';
import { useWorkspaceTools } from '@/hooks/workspace/use-workspace-tools';
import type { WorkspaceCreationKind } from '@/lib/workspace/workspace.types';

export function WorkspaceScreen() {
  const preview = useWorkspacePreview();
  const tools = useWorkspaceTools();
  const preferences = useWorkspacePreferences();
  const conversationRef = useRef<HTMLElement>(null);
  const creationTriggerRef = useRef<HTMLElement>(null);
  const sidebarRef = useRef<PanelImperativeHandle>(null);
  const [creationKind, setCreationKind] = useState<WorkspaceCreationKind | null>(null);

  function selectConversation(id: string) {
    preview.selectConversation(id);
    conversationRef.current?.focus();
  }

  function openCreation(kind: WorkspaceCreationKind, trigger: HTMLButtonElement) {
    creationTriggerRef.current = trigger;
    setCreationKind(kind);
  }

  function toggleSidebar() {
    if (preview.isSidebarOpen) sidebarRef.current?.collapse();
    else sidebarRef.current?.expand();
    preview.setIsSidebarOpen(!preview.isSidebarOpen);
  }

  return (
    <div
      className="group/workspace min-h-dvh bg-canvas text-sm text-foreground data-[reduced-motion=true]:[&_*]:animate-none data-[reduced-motion=true]:[&_*]:transition-none data-[reduced-motion=true]:[&_*]:scale-100 data-[text-size=comfortable]:[&_[data-slot=message-body]]:text-base data-[text-size=comfortable]:[&_[data-slot=welcome-description]]:text-sm data-[text-size=comfortable]:[&_textarea]:text-base"
      data-testid="workspace"
      data-density={preferences.density}
      data-text-size={preferences.textSize}
      data-reduced-motion={preferences.reducedMotion}
    >
      <a
        className="fixed top-3 left-3 z-50 -translate-y-24 rounded-lg bg-background p-3 font-medium outline-none focus:translate-y-0 focus-visible:ring-2 focus-visible:ring-ring"
        href="#main-content"
      >
        Aller au contenu principal
      </a>
      <WorkspaceLayout
        isSidebarOpen={preview.isSidebarOpen}
        isContextOpen={preview.isContextOpen}
        sidebarRef={sidebarRef}
        onSidebarOpenChange={preview.setIsSidebarOpen}
        sidebar={
          <WorkspaceSidebar
            projects={preview.projects}
            conversations={preview.conversations}
            selectedProjectId={preview.selectedProject?.id}
            selectedId={preview.conversation?.id}
            search={preview.search}
            isLoading={preview.isLoading}
            isNavigationOpen={preview.isNavigationOpen}
            onSearch={preview.setSearch}
            onSelect={selectConversation}
            onSelectProject={preview.selectProject}
            onCreate={openCreation}
          />
        }
        header={
          <WorkspaceHeader
            scopeName={preview.selectedProject?.name ?? 'Sandbox'}
            isLoading={preview.isLoading}
            isContextOpen={preview.isContextOpen}
            isSidebarOpen={preview.isSidebarOpen}
            isNavigationOpen={preview.isNavigationOpen}
            onToggleLoading={preview.toggleLoading}
            onToggleContext={preview.toggleContext}
            onToggleNavigation={preview.toggleNavigation}
            onToggleSidebar={toggleSidebar}
            preferences={preferences}
          />
        }
        conversation={
          <ConversationPanel
            ref={conversationRef}
            conversation={preview.conversation}
            prompts={preview.starterPrompts}
            isLoading={preview.isLoading}
            onSelect={selectConversation}
          />
        }
        context={
          <ContextPanel
            tools={tools}
            conversation={preview.conversation}
            isLoading={preview.isLoading}
          />
        }
      />
      {creationKind ? (
        <WorkspaceCreateDialog
          kind={creationKind}
          projectName={preview.selectedProject?.name}
          onClose={() => setCreationKind(null)}
          onCreate={preview.createItem}
          returnFocusRef={creationTriggerRef}
          conversationRef={conversationRef}
        />
      ) : null}
      {preview.isLoading ? (
        <p className="sr-only" role="status" aria-label="Chargement de l’espace de travail">
          Chargement de l’espace de travail
        </p>
      ) : null}
    </div>
  );
}
