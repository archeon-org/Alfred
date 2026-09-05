import type { ReactNode, Ref } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';

import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useDesktopWorkspace } from '@/hooks/workspace/use-desktop-workspace';
import { cn } from '@/lib/cn';

interface WorkspaceLayoutProps {
  readonly sidebar: ReactNode;
  readonly header: ReactNode;
  readonly conversation: ReactNode;
  readonly context: ReactNode;
  readonly isSidebarOpen: boolean;
  readonly isContextOpen: boolean;
  readonly sidebarRef: Ref<PanelImperativeHandle | null>;
  readonly onSidebarOpenChange: (open: boolean) => void;
}

export function WorkspaceLayout({
  sidebar,
  header,
  conversation,
  context,
  isSidebarOpen,
  isContextOpen,
  sidebarRef,
  onSidebarOpenChange,
}: WorkspaceLayoutProps) {
  const isDesktop = useDesktopWorkspace();
  if (!isDesktop)
    return (
      <div
        className={cn(
          'flex min-h-dvh flex-col md:grid md:grid-cols-[228px_minmax(0,1fr)] md:grid-rows-[70px_minmax(680px,auto)_auto]',
          !isSidebarOpen && 'md:grid-cols-1',
        )}
      >
        <div className={cn('md:row-span-2', !isSidebarOpen && 'md:hidden')}>{sidebar}</div>
        <div>{header}</div>
        <div className="min-w-0 px-2.5 pb-4 md:px-5 md:pb-5">{conversation}</div>
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
          className="w-1 shrink-0 border-0 bg-transparent"
        />
        <ResizablePanel id="stage" minSize={isContextOpen ? 746 : 430}>
          <div className="flex h-full min-w-0 flex-col">
            {header}
            <ResizablePanelGroup
              id="conversation-columns"
              orientation="horizontal"
              className="min-h-0 flex-1"
              resizeTargetMinimumSize={{ coarse: 24, fine: 10 }}
            >
              <ResizablePanel id="chat" minSize={430}>
                <div className="h-full min-h-0 pb-5 pl-5 pr-2">{conversation}</div>
              </ResizablePanel>
              {isContextOpen ? (
                <>
                  <ResizableHandle
                    aria-label="Redimensionner le panneau de contexte"
                    className="w-2 shrink-0 border-0 bg-transparent"
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
