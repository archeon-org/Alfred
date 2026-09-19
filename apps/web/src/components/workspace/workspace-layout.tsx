import { PanelLeftOpen, PanelRight } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';

import { IconButton } from '@/components/ui/icon-button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useDesktopWorkspace } from '@/hooks/workspace/use-desktop-workspace';
import { useShortcutHint } from '@/hooks/workspace/use-shortcut-preferences';
import { useTabletWorkspace } from '@/hooks/workspace/use-tablet-workspace';
import { cn } from '@/lib/cn';

interface WorkspaceLayoutProps {
  readonly sidebar: ReactNode;
  /** Narrow-screen bar only; wider layouts keep their controls inside the panels. */
  readonly header: ReactNode;
  readonly conversation: ReactNode;
  readonly context: ReactNode;
  readonly contextAvailable: boolean;
  readonly isSidebarOpen: boolean;
  readonly isContextOpen: boolean;
  readonly sidebarRef: Ref<PanelImperativeHandle | null>;
  readonly onSidebarOpenChange: (open: boolean) => void;
  readonly onOpenSidebar: () => void;
  readonly onOpenContext: () => void;
}

interface PanelOpenersProps {
  readonly contextAvailable: boolean;
  readonly isSidebarOpen: boolean;
  readonly isContextOpen: boolean;
  readonly onOpenSidebar: () => void;
  readonly onOpenContext: () => void;
}

/**
 * Re-opens a folded panel from the gutter beside the chat. Each control sits in the margin its
 * panel left behind, so the chat keeps its full height and nothing overlaps the transcript.
 */
function PanelOpeners({
  contextAvailable,
  isSidebarOpen,
  isContextOpen,
  onOpenSidebar,
  onOpenContext,
}: PanelOpenersProps) {
  const floating =
    'bg-card/90 text-muted-foreground shadow-soft backdrop-blur-sm hover:bg-card hover:text-foreground';
  const navigationHint = useShortcutHint('toggleNavigation', 'Afficher la navigation');
  const contextHint = useShortcutHint('toggleContext', 'Afficher le contexte');
  return (
    <>
      {!isSidebarOpen ? (
        <IconButton
          aria-controls="workspace-navigation"
          aria-expanded={false}
          className={cn('absolute top-5 left-2 z-10', floating)}
          label="Afficher la navigation"
          onClick={onOpenSidebar}
          size="icon-sm"
          {...navigationHint}
        >
          <PanelLeftOpen aria-hidden="true" size={16} />
        </IconButton>
      ) : null}
      {contextAvailable && !isContextOpen ? (
        <IconButton
          aria-controls="context-panel"
          aria-expanded={false}
          className={cn('absolute top-5 right-2 z-10', floating)}
          label="Afficher le contexte"
          onClick={onOpenContext}
          size="icon-sm"
          {...contextHint}
        >
          <PanelRight aria-hidden="true" size={16} />
        </IconButton>
      ) : null}
    </>
  );
}

export function WorkspaceLayout({
  sidebar,
  header,
  conversation,
  context,
  contextAvailable,
  isSidebarOpen,
  isContextOpen,
  sidebarRef,
  onSidebarOpenChange,
  onOpenSidebar,
  onOpenContext,
}: WorkspaceLayoutProps) {
  const isDesktop = useDesktopWorkspace();
  const isTablet = useTabletWorkspace();
  const openers = (
    <PanelOpeners
      contextAvailable={contextAvailable}
      isSidebarOpen={isSidebarOpen}
      isContextOpen={isContextOpen}
      onOpenSidebar={onOpenSidebar}
      onOpenContext={onOpenContext}
    />
  );
  if (!isDesktop)
    return (
      <div
        className={cn(
          'flex min-h-dvh flex-col md:grid md:grid-cols-[228px_minmax(0,1fr)] md:grid-rows-[minmax(680px,auto)_auto]',
          !isSidebarOpen && 'md:grid-cols-1',
        )}
      >
        <div className={cn('md:row-span-2', !isSidebarOpen && 'md:hidden')}>{sidebar}</div>
        {/* Narrow screens keep one bar; from md the panels fold themselves and the gutter reopens them. */}
        {isTablet ? null : header}
        <div
          className={cn(
            'relative min-w-0 px-2.5 pb-4 md:px-5 md:pt-5 md:pb-5',
            !isSidebarOpen && 'md:pl-12',
            contextAvailable && !isContextOpen && 'md:pr-12',
          )}
        >
          {isTablet ? openers : null}
          {conversation}
        </div>
        {isContextOpen ? (
          <div className="border-t border-border md:col-span-full">{context}</div>
        ) : null}
      </div>
    );

  return (
    <div className="h-dvh min-h-[480px]">
      <ResizablePanelGroup
        id="workspace-columns"
        orientation="horizontal"
        className="h-full"
        resizeTargetMinimumSize={{ coarse: 24, fine: 10 }}
      >
        <ResizablePanel
          id="navigation"
          defaultSize={isSidebarOpen ? 250 : 0}
          minSize={220}
          maxSize={360}
          collapsedSize={0}
          collapsible
          panelRef={sidebarRef}
          onResize={(size) => {
            const open = size.inPixels > 0;
            if (open !== isSidebarOpen) onSidebarOpenChange(open);
          }}
        >
          <div className="h-full" hidden={!isSidebarOpen}>
            {sidebar}
          </div>
        </ResizablePanel>
        <ResizableHandle
          aria-label="Redimensionner la navigation"
          className="my-5 w-1 shrink-0 border-0 bg-transparent hover:bg-border focus-visible:bg-ring"
        />
        <ResizablePanel id="stage" minSize={isContextOpen ? 746 : 430}>
          <div className="relative flex h-full min-w-0 flex-col">
            {openers}
            <ResizablePanelGroup
              id="conversation-columns"
              orientation="horizontal"
              className="min-h-0 flex-1"
              resizeTargetMinimumSize={{ coarse: 24, fine: 10 }}
            >
              <ResizablePanel id="chat" minSize={430}>
                <div
                  className={cn(
                    'h-full min-h-0 pt-5 pb-5',
                    isSidebarOpen ? 'pl-4' : 'pl-12',
                    isContextOpen ? 'pr-0' : contextAvailable ? 'pr-12' : 'pr-5',
                  )}
                >
                  {conversation}
                </div>
              </ResizablePanel>
              {isContextOpen ? (
                <>
                  <ResizableHandle
                    aria-label="Redimensionner le panneau de contexte"
                    className="my-5 w-2 shrink-0 border-0 bg-transparent hover:bg-border focus-visible:bg-ring"
                  />
                  <ResizablePanel id="context" defaultSize={330} minSize={304} maxSize={560}>
                    <div className="h-full min-h-0">{context}</div>
                  </ResizablePanel>
                </>
              ) : null}
            </ResizablePanelGroup>
          </div>
        </ResizablePanel>
      </ResizablePanelGroup>
    </div>
  );
}
