import { useCallback, useState } from 'react';
import { Link, useBeforeUnload, useBlocker } from 'react-router-dom';
import type { ContextDocument } from '@alfred/contracts';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { ContextDocumentEditor } from '@/components/workspace/personalization/context-document-editor';
import { useSession } from '@/hooks/auth/use-session';
import { contextPath } from '@/services/context/context.service';
import { useContextDocuments } from '@/hooks/context/use-context-documents';
import type { ContextScope } from '@/services/context/context.service';

export function ContextDocuments({ scope }: { readonly scope: ContextScope }) {
  const { user } = useSession();
  return <ContextDocumentScope key={`${user?.id ?? ''}:${contextPath(scope)}`} scope={scope} />;
}

function ContextDocumentScope({ scope }: { readonly scope: ContextScope }) {
  const { query, save } = useContextDocuments(scope);
  const [dirty, setDirty] = useState<Readonly<Record<string, boolean>>>({});
  const hasChanges = Object.values(dirty).some(Boolean);
  const blocker = useBlocker(hasChanges);
  useBeforeUnload(
    useCallback(
      (event: BeforeUnloadEvent) => {
        if (hasChanges) {
          event.preventDefault();
          event.returnValue = '';
        }
      },
      [hasChanges],
    ),
  );
  function markDirty(kind: ContextDocument['kind'], value: boolean) {
    setDirty((previous) => ({ ...previous, [kind]: value }));
  }
  if (query.isPending)
    return (
      <div role="status" aria-label="Chargement des contenus" className="space-y-4">
        <Skeleton className="h-44 w-full" />
        <Skeleton className="h-44 w-full" />
      </div>
    );
  if (query.data === undefined)
    return (
      <div role="alert" className="space-y-3">
        <p>Impossible de charger vos contenus.</p>
        <Button variant="outline" onClick={() => void query.refetch()}>
          Réessayer
        </Button>
      </div>
    );
  const personal = scope.type === 'personal';
  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground">
        {personal
          ? 'Ces réglages personnels concernent tous vos chats et projets.'
          : 'Ces contenus complètent vos instructions générales et vos préférences personnelles pour ce projet.'}{' '}
        Ils seront utilisés lors du raccordement aux agents.{' '}
        {!personal ? (
          <Link to="/app/settings" className="font-medium underline underline-offset-4">
            Voir mes réglages personnels
          </Link>
        ) : null}
      </p>
      <div className="grid gap-4 xl:grid-cols-2">
        {query.data.documents.map((document) => {
          const title =
            document.kind === 'instructions'
              ? 'Instructions générales'
              : document.kind === 'context'
                ? 'Contexte du projet'
                : personal
                  ? 'Préférences de réponse'
                  : 'Préférences du projet';
          const description =
            document.kind === 'instructions'
              ? 'Les consignes générales que vous souhaitez donner à Alfred.'
              : document.kind === 'context'
                ? 'Les informations utiles pour comprendre ce projet : objectifs, fonctionnement et vocabulaire.'
                : 'Vos choix de langue, de ton, de format et de niveau de détail.';
          return (
            <ContextDocumentEditor
              key={document.kind}
              document={document}
              title={title}
              description={description}
              maxBytes={query.data.maxBytes}
              onDirtyChange={markDirty}
              onSave={(content, revision) =>
                save({ kind: document.kind, input: { content, expectedRevision: revision } })
              }
              onReload={async () => {
                const result = await query.refetch();
                const latest = result.data?.documents.find((item) => item.kind === document.kind);
                if (result.isError || latest === undefined) throw new Error('Reload failed');
                return latest;
              }}
            />
          );
        })}
      </div>
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Quitter sans enregistrer ?"
        description="Vos modifications non enregistrées seront perdues."
        confirmLabel="Quitter sans enregistrer"
        cancelLabel="Continuer à modifier"
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
        onConfirm={() => {
          if (blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </div>
  );
}
