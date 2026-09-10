import type { SkillDetail, SkillWriteInput } from '@alfred/contracts';
import { useCallback, useRef, useState, type ReactNode } from 'react';
import { Link, useBlocker, useNavigate, useParams } from 'react-router-dom';
import { FeatureGate } from '@/components/feature-flags/feature-gate';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SkillEditor } from '@/components/workspace/skills/skill-editor';
import type { SkillEditorState } from '@/hooks/skills/use-skill-draft';
import { useSkillDetails } from '@/hooks/skills/use-skill-details';
import { useSkillImport } from '@/hooks/skills/use-skill-import';
import { useSkillLifecycle } from '@/hooks/skills/use-skill-lifecycle';
import { SkillLifecycleControls } from '@/components/workspace/skills/skill-lifecycle-controls';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';
import { skillError } from '@/lib/skills/skill-errors';

export function SkillEditorScreen() {
  const { skillId } = useParams();
  const { userId } = useWorkspaceAccount();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="flex h-full min-h-0 min-w-0 flex-col overflow-visible workspace:overflow-hidden rounded-xl border border-border bg-card outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <FeatureGate
        feature="skills"
        fallback={<p className="p-6">Le catalogue de skills est désactivé.</p>}
      >
        <SkillEditorPage key={`${userId}:${skillId ?? 'new'}`} />
      </FeatureGate>
    </main>
  );
}
function SkillEditorPage() {
  const { skillId } = useParams();
  const navigate = useNavigate();
  const detail = useSkillDetails(skillId);
  const { importedSkill } = useSkillImport();
  const editorState = useRef<SkillEditorState>({ dirty: false, busy: false });
  const [busy, setBusy] = useState(false);
  const onStateChange = useCallback((state: SkillEditorState) => {
    editorState.current = state;
    setBusy(state.busy);
  }, []);
  const blocker = useBlocker(() => editorState.current.dirty || editorState.current.busy);
  const close = () => {
    editorState.current = { dirty: false, busy: false };
    void navigate('/app/skills');
  };
  const navigation = (
    <nav
      aria-label="Fil d’Ariane"
      className="shrink-0 border-b border-border px-4 py-1.5 text-xs md:px-6"
    >
      <Link
        className="rounded text-muted-foreground underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
        to="/app/skills"
      >
        Mes skills
      </Link>
      <span aria-hidden="true" className="mx-2 text-muted-foreground">
        /
      </span>
      <span>{detail.data?.name ?? (skillId ? 'Éditeur' : 'Nouveau skill')}</span>
    </nav>
  );
  return (
    <>
      {skillId && !detail.data && navigation}
      {detail.isError && detail.data && (
        <p role="alert" className="px-4 py-2 text-xs text-destructive">
          Actualisation impossible. Votre brouillon reste ouvert.{' '}
          <Button size="sm" variant="ghost" onClick={() => void detail.refetch()}>
            Réessayer
          </Button>
        </p>
      )}
      {skillId && detail.isPending ? (
        <p role="status" className="p-6">
          Chargement du skill…
        </p>
      ) : skillId && detail.isError && !detail.data ? (
        <div role="alert" className="space-y-4 p-6">
          <p>{skillError(detail.error)}</p>
          <Button onClick={() => void detail.refetch()}>Réessayer</Button>
        </div>
      ) : (
        <SkillEditorSession
          navigation={navigation}
          initial={skillId ? detail.data : importedSkill}
          current={detail.data}
          onStateChange={onStateChange}
          onClose={close}
        />
      )}
      <ConfirmDialog
        open={blocker.state === 'blocked'}
        title="Quitter sans enregistrer ?"
        description="Les modifications non enregistrées seront perdues."
        confirmLabel="Quitter sans enregistrer"
        isPending={busy}
        onOpenChange={(open) => {
          if (!open && blocker.state === 'blocked') blocker.reset();
        }}
        onConfirm={() => {
          if (!busy && blocker.state === 'blocked') blocker.proceed();
        }}
      />
    </>
  );
}

/** Freeze the optimistic version with the draft, even if the server cache refreshes. */
function SkillEditorSession({
  navigation,
  initial,
  current,
  onStateChange,
  onClose,
}: {
  readonly navigation: ReactNode;
  readonly initial?: SkillWriteInput;
  readonly current?: SkillDetail;
  readonly onStateChange: (state: SkillEditorState) => void;
  readonly onClose: () => void;
}) {
  const lifecycle = useSkillLifecycle(current);
  const { onEditorState: updateEditorState } = lifecycle;
  const onEditorState = useCallback(
    (state: SkillEditorState) => {
      updateEditorState(state);
      onStateChange(state);
    },
    [updateEditorState, onStateChange],
  );
  const { baseline } = lifecycle;
  return (
    <>
      <SkillEditor
        headerContent={
          <>
            {navigation}
            {baseline && (
              <SkillLifecycleControls
                skill={baseline}
                publishDisabled={lifecycle.editorState.dirty}
                onPublish={() => void lifecycle.execute({ kind: 'publish' })}
                disabled={lifecycle.pending || lifecycle.editorState.busy}
                onRestore={(sourceVersion) =>
                  lifecycle.setAction({ kind: 'restore', sourceVersion })
                }
                onAvailability={() =>
                  baseline.enabled
                    ? lifecycle.setAction({ kind: 'disable' })
                    : void lifecycle.execute({ kind: 'enable' })
                }
              />
            )}
            {lifecycle.notice && (
              <p role="status" className="px-4 py-2 text-xs text-primary">
                {lifecycle.notice}
              </p>
            )}
            {!lifecycle.action && lifecycle.error && (
              <p role="alert" className="px-4 py-2 text-xs text-destructive">
                {lifecycle.error}
              </p>
            )}
          </>
        }
        key={lifecycle.generation}
        externalBusy={lifecycle.pending}
        mode={current ? 'edit' : 'create'}
        initialUnsaved={!current && initial !== undefined}
        initial={baseline ?? initial}
        onStateChange={onEditorState}
        onClose={onClose}
        onSave={(input) => lifecycle.save({ input, current: baseline })}
      />
      <ConfirmDialog
        open={lifecycle.action !== null}
        title={
          lifecycle.action?.kind === 'restore' ? 'Restaurer une version ?' : 'Désactiver ce skill ?'
        }
        description={
          lifecycle.action?.kind === 'restore'
            ? `Vous revenez à cette version existante, sans créer de nouvelle version. L’historique est conservé. La publication reste inchangée jusqu’à votre prochaine publication.${lifecycle.editorState.dirty ? ' Vos modifications non enregistrées seront remplacées.' : ''}`
            : 'Le skill sera désactivé dans votre espace. Ses fichiers et son historique seront conservés.'
        }
        confirmLabel={
          lifecycle.action?.kind === 'restore' ? 'Restaurer cette version' : 'Désactiver'
        }
        isPending={lifecycle.pending}
        error={lifecycle.error}
        onOpenChange={(open) => {
          if (!open) lifecycle.setAction(null);
        }}
        onConfirm={() => {
          if (lifecycle.action) void lifecycle.execute(lifecycle.action);
        }}
      />
    </>
  );
}
