import { ConversationPanel } from '../conversation/conversation-panel';
import { ContextPanel } from './context-panel';
import { WorkspaceHeader } from './workspace-header';
import { WorkspaceSidebar } from './workspace-sidebar';

export function AppLayout() {
  return (
    <div className="min-h-dvh bg-canvas text-ink lg:grid lg:grid-cols-[17rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_19rem]">
      <a
        className="fixed left-4 top-3 z-50 -translate-y-20 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white outline-none transition-transform focus:translate-y-0 motion-reduce:transition-none"
        href="#main-content"
      >
        Aller au contenu principal
      </a>
      <WorkspaceSidebar />
      <div className="min-w-0">
        <WorkspaceHeader />
        <ConversationPanel />
      </div>
      <ContextPanel />
    </div>
  );
}
