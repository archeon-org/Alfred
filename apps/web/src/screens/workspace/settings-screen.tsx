import { SidebarFrame } from '@/components/workspace/navigation/sidebar-frame';
import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Keyboard, MessagesSquare, Palette, SlidersHorizontal } from 'lucide-react';
import { AppearanceSettings } from '@/components/workspace/personalization/appearance-settings';
import { ChatSettings } from '@/components/workspace/personalization/chat-settings';
import { ContextDocuments } from '@/components/workspace/personalization/context-documents';
import { ShortcutSettings } from '@/components/workspace/personalization/shortcut-settings';
import { useChatPreferences } from '@/hooks/workspace/use-chat-preferences';
import { useShortcutPreferences } from '@/hooks/workspace/use-shortcut-preferences';
import { useWorkspaceOutlet } from '@/hooks/workspace/use-workspace-outlet';
import { cn } from '@/lib/cn';

const sections = [
  { key: 'appearance', label: 'Apparence', icon: Palette, to: '/app/settings' },
  { key: 'chat', label: 'Chat', icon: MessagesSquare, to: '/app/settings?section=chat' },
  {
    key: 'personalization',
    label: 'Personnaliser Alfred',
    icon: SlidersHorizontal,
    to: '/app/settings?section=personalization',
  },
  {
    key: 'shortcuts',
    label: 'Raccourcis clavier',
    icon: Keyboard,
    to: '/app/settings?section=shortcuts',
  },
] as const;

type SectionKey = (typeof sections)[number]['key'];

const copy: Record<SectionKey, { readonly title: string; readonly description: string }> = {
  appearance: {
    title: 'Apparence',
    description: 'Un espace à votre image. Ajustez les couleurs et le confort de votre interface.',
  },
  chat: {
    title: 'Chat',
    description:
      'Ce que la conversation montre du travail d’Alfred : un aperçu simple ou tout le détail, et les éléments à masquer.',
  },
  personalization: {
    title: 'Personnaliser Alfred',
    description:
      'Vos instructions et préférences pour un accompagnement adapté à votre façon de travailler.',
  },
  shortcuts: {
    title: 'Raccourcis clavier',
    description:
      'Les gestes qui ouvrent un chat ou replient les panneaux. Changez-les pour qu’ils tombent sous vos doigts.',
  },
};

export function SettingsScreen() {
  const { preferences, conversationRef } = useWorkspaceOutlet();
  const shortcuts = useShortcutPreferences();
  const chat = useChatPreferences();
  const [searchParams] = useSearchParams();
  const requested = searchParams.get('section');
  const section: SectionKey =
    requested === 'chat' || requested === 'personalization' || requested === 'shortcuts'
      ? requested
      : 'appearance';
  useEffect(() => {
    conversationRef.current?.focus({ preventScroll: true });
    if (conversationRef.current) conversationRef.current.scrollTop = 0;
  }, [section, conversationRef]);
  return (
    <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-y-auto bg-background text-foreground md:flex-row md:overflow-hidden">
      <div className="shrink-0 md:w-57 workspace:w-62.5">
        <SidebarFrame>
          <div className="min-h-0 flex-1 overflow-y-auto pb-3">
            <Link
              to="/app"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg px-3 text-sm font-medium text-sidebar-muted transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-4" aria-hidden="true" />
              Retour à Alfred
            </Link>
            <p className="mt-5 px-3 text-xs font-semibold tracking-wider text-sidebar-muted uppercase">
              Paramètres
            </p>
            <nav aria-label="Paramètres" className="mt-3 flex flex-wrap gap-1 md:flex-col">
              {sections.map(({ key, label, icon: Icon, to }) => (
                <Link
                  key={key}
                  to={to}
                  aria-current={section === key ? 'page' : undefined}
                  className={cn(
                    'flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    section === key
                      ? 'bg-sidebar-accent text-sidebar-accent-foreground shadow-xs'
                      : 'text-sidebar-muted hover:bg-sidebar-accent hover:text-sidebar-foreground',
                  )}
                >
                  <Icon className="size-4 shrink-0" aria-hidden="true" />
                  {label}
                </Link>
              ))}
            </nav>
          </div>
        </SidebarFrame>
      </div>
      <main
        id="main-content"
        ref={conversationRef}
        tabIndex={-1}
        className="min-w-0 flex-1 px-5 py-8 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring md:overflow-y-auto md:px-10 md:py-12 lg:px-16"
      >
        <div className="mx-auto w-full max-w-5xl space-y-8">
          <header className="space-y-3">
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">
              {copy[section].title}
            </h1>
            <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">
              {copy[section].description}
            </p>
          </header>
          {section === 'chat' ? (
            <ChatSettings preferences={chat} />
          ) : section === 'personalization' ? (
            <ContextDocuments scope={{ type: 'personal' }} />
          ) : section === 'shortcuts' ? (
            <ShortcutSettings preferences={shortcuts} />
          ) : (
            <AppearanceSettings preferences={preferences} />
          )}
        </div>
      </main>
    </div>
  );
}
