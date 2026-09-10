import { useSkillsCatalogue } from '@/hooks/skills/use-skills-catalogue';
import { Button } from '@/components/ui/button';
import { SkillsCatalogueToolbar } from '@/components/workspace/skills/skills-catalogue-toolbar';
import { SkillCatalogueRow } from '@/components/workspace/skills/skill-catalogue-row';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FeatureGate } from '@/components/feature-flags/feature-gate';
import { useWorkspaceAccount } from '@/hooks/workspace/use-workspace-account';

export function SkillsScreen() {
  const { userId } = useWorkspaceAccount();
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="h-full min-h-0 min-w-0 overflow-y-auto rounded-xl border border-border bg-card p-4 outline-none focus-visible:ring-2 focus-visible:ring-ring md:p-6"
    >
      <FeatureGate feature="skills" fallback={<p>Le catalogue de skills est désactivé.</p>}>
        <SkillsCatalogue key={userId} />
      </FeatureGate>
    </main>
  );
}
function SkillsCatalogue() {
  const {
    input,
    search,
    setInput,
    query,
    skills,
    deleting,
    setDeleting,
    pending,
    error,
    notice,
    create,
    edit,
    importFile,
    exportFile,
    publishSkill,
    requestDelete,
    confirmDelete,
  } = useSkillsCatalogue();
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-lg font-semibold">Mes skills</h1>
        <p className="text-sm text-muted-foreground">
          Vos méthodes réutilisables, des instructions simples aux packages de fichiers.
        </p>
      </header>
      <SkillsCatalogueToolbar
        search={input}
        onSearch={setInput}
        pending={pending}
        onCreate={create}
        onImport={importFile}
      />
      {notice && (
        <p role="status" className="text-sm text-muted-foreground">
          {notice}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {query.isPending ? (
        <p role="status">Chargement des skills…</p>
      ) : query.isError ? (
        <div role="alert">
          <p>Impossible de charger vos skills.</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            Réessayer
          </Button>
        </div>
      ) : (
        <>
          {skills.length === 0 && (
            <p className="text-sm text-muted-foreground">
              {search ? 'Aucun skill trouvé.' : 'Aucun skill. Créez votre première méthode.'}
            </p>
          )}
          <ul aria-label="Mes skills" className="divide-y divide-border">
            {skills.map((skill) => (
              <SkillCatalogueRow
                key={skill.id}
                skill={skill}
                pending={pending}
                onEdit={() => edit(skill)}
                onExport={() => exportFile(skill)}
                onPublish={() => publishSkill(skill)}
                onDelete={() => requestDelete(skill)}
              />
            ))}
          </ul>
          {query.hasNextPage && (
            <Button
              disabled={query.isFetchingNextPage}
              variant="outline"
              onClick={() => void query.fetchNextPage()}
            >
              Charger plus de skills
            </Button>
          )}
        </>
      )}
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(open) => {
          if (!open) setDeleting(null);
        }}
        title="Supprimer ce skill ?"
        description={`« ${deleting?.name ?? ''} » et tout son historique seront définitivement supprimés.`}
        confirmLabel="Supprimer le skill"
        destructive
        isPending={pending}
        error={error ?? undefined}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
