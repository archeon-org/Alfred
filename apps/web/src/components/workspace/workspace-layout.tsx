import { PanelLeftOpen, PanelRight } from 'lucide-react';
import type { ReactNode, Ref } from 'react';
import type { PanelImperativeHandle } from 'react-resizable-panels';

import { IconButton } from '@/components/ui/icon-button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { ContextSheet } from '@/components/workspace/context/context-sheet';
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
  /**
   * Below the workspace breakpoint, the routed screen grows with its content and the stage cell
   * scrolls it like a page (project home, skill editor). Otherwise the screen fills the cell and
   * scrolls inside itself (conversation, skills catalogue, notices).
   */
  readonly conversationGrows?: boolean;
  readonly isSidebarOpen: boolean;
  /** Narrow screens: the bar's conversations list is open and takes the screen. */
  readonly isNavigationOpen: boolean;
  readonly isContextOpen: boolean;
  readonly sidebarRef: Ref<PanelImperativeHandle | null>;
  readonly onSidebarOpenChange: (open: boolean) => void;
  readonly onOpenSidebar: () => void;
  readonly onOpenContext: () => void;
  readonly onCloseContext: () => void;
}

interface PanelOpenersProps {
  readonly contextAvailable: boolean;
  readonly isSidebarOpen: boolean;
  readonly isContextOpen: boolean;
  /** Below the workspace breakpoint the context opener stays put while its sheet covers the chat. */
  readonly contextOverlay: boolean;
  readonly onOpenSidebar: () => void;
  readonly onOpenContext: () => void;
}

/**
 * The shell is exactly one viewport tall at every width and the document never scrolls: each
 * region scrolls inside itself. Only a viewport shorter than the layout's floor scrolls the shell,
 * never the document.
 */
const shell = 'h-dvh overflow-y-auto overscroll-contain';

/**
 * The layout inside the shell: at least its floor, and clipped. `overflow-clip` (unlike `hidden`)
 * cannot be scrolled by `scrollIntoView` or focus, and `relative` makes it the containing block of
 * visually hidden descendants, which would otherwise stretch the shell from their position deep
 * in a scrolled transcript.
 */
const frame = 'relative h-full overflow-clip';

/**
 * Re-opens a folded panel from the gutter beside the chat. Each control sits in the margin its
 * panel left behind, so the chat keeps its full height and nothing overlaps the transcript.
 */
function PanelOpeners({
  contextAvailable,
  isSidebarOpen,
  isContextOpen,
  contextOverlay,
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
      {contextAvailable && (contextOverlay || !isContextOpen) ? (
        <IconButton
          aria-controls="context-panel"
          aria-expanded={isContextOpen}
          aria-haspopup={contextOverlay ? 'dialog' : undefined}
          data-context-opener=""
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
  conversationGrows = false,
  isSidebarOpen,
  isNavigationOpen,
  isContextOpen,
  sidebarRef,
  onSidebarOpenChange,
  onOpenSidebar,
  onOpenContext,
  onCloseContext,
}: WorkspaceLayoutProps) {
  const isDesktop = useDesktopWorkspace();
  const isTablet = useTabletWorkspace();
  const openers = (
    <PanelOpeners
      contextAvailable={contextAvailable}
      isSidebarOpen={isSidebarOpen}
      isContextOpen={isContextOpen}
      contextOverlay={!isDesktop}
      onOpenSidebar={onOpenSidebar}
      onOpenContext={onOpenContext}
    />
  );
  if (!isDesktop) {
    // Below md one narrow bar tops the chat; the conversations list, once open, takes the chat's
    // place under it. From md the navigation is a column the gutter reopens.
    const drawerOpen = !isTablet && isNavigationOpen;
    return (
      <div data-workspace-shell className={shell}>
        <div
          className={cn(
            frame,
            'flex min-h-80 flex-col md:grid md:grid-rows-[minmax(0,1fr)]',
            isSidebarOpen ? 'md:grid-cols-[228px_minmax(0,1fr)]' : 'md:grid-cols-1',
          )}
        >
          {isTablet ? null : header}
          <div
            className={cn(
              // A screen too short for the whole navigation scrolls it rather than clipping it.
              'min-h-0 overflow-y-auto overscroll-contain',
              (isTablet ? !isSidebarOpen : !drawerOpen) && 'hidden',
              drawerOpen && 'flex-1',
            )}
          >
            {sidebar}
          </div>
          <div className={cn('relative min-h-0 min-w-0 flex-1', drawerOpen && 'hidden')}>
            {isTablet ? openers : null}
            {/* A bounded cell: the chat scrolls inside itself; a growing screen scrolls here. */}
            <div
              className={cn(
                'h-full overflow-y-auto overscroll-contain px-2.5 pb-4 md:px-5 md:pt-5 md:pb-5',
                !isSidebarOpen && 'md:pl-12',
                contextAvailable && 'md:pr-12',
                conversationGrows && '[&>main]:h-auto [&>main]:min-h-full',
              )}
            >
              {conversation}
            </div>
          </div>
          {contextAvailable ? (
            <ContextSheet open={isContextOpen} onClose={onCloseContext}>
              {context}
            </ContextSheet>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div data-workspace-shell className={shell}>
      <div className={cn(frame, 'min-h-[480px]')}>
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
    </div>
  );
}
