import { AppearanceSettings } from '@/components/workspace/personalization/appearance-settings';
import { ContextDocuments } from '@/components/workspace/personalization/context-documents';
import { useWorkspaceOutlet } from '@/hooks/workspace/use-workspace-outlet';

export function SettingsScreen() {
  const { preferences, conversationRef } = useWorkspaceOutlet();
  return (
    <main
      id="main-content"
      ref={conversationRef}
      tabIndex={-1}
      className="min-w-0 space-y-8 overflow-y-auto rounded-xl border border-border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-6"
    >
      <header>
        <h1 className="text-xl font-semibold">Paramètres</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Personnalisez votre espace et la manière dont Alfred vous accompagne.
        </p>
      </header>
      <section aria-labelledby="appearance-title" className="space-y-4">
        <h2 id="appearance-title" className="text-lg font-semibold">
          Apparence
        </h2>
        <p className="text-sm text-muted-foreground">
          Ces réglages visuels sont temporaires et se réinitialisent au rechargement.
        </p>
        <AppearanceSettings preferences={preferences} />
      </section>
      <section aria-labelledby="personalization-title" className="space-y-4">
        <h2 id="personalization-title" className="text-lg font-semibold">
          Personnaliser Alfred
        </h2>
        <ContextDocuments scope={{ type: 'personal' }} />
      </section>
    </main>
  );
}
