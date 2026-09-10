import { Link } from 'react-router-dom';
import { FeatureGate } from '@/components/feature-flags/feature-gate';
import { Button, buttonVariants } from '@/components/ui/button';
import { useSkills } from '@/hooks/skills/use-skills';

export function SkillsPanel() {
  return (
    <FeatureGate
      feature="skills"
      fallback={
        <p className="text-sm text-muted-foreground">Le catalogue de skills est désactivé.</p>
      }
    >
      <GlobalSkillsPanel />
    </FeatureGate>
  );
}
function GlobalSkillsPanel() {
  const { skills, query } = useSkills();
  const published = skills.filter((skill) => skill.enabled && skill.publishedVersion !== null);
  const loading = query.isPending;
  const failed = query.isError;
  return (
    <section className="space-y-4" aria-label="Catalogue global de skills">
      <h3 className="text-sm font-semibold">Les skills</h3>
      <Link to="/app/skills" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
        Gérer mes skills
      </Link>
      <p className="text-xs text-muted-foreground">
        Vos skills actifs et publiés, disponibles dans tout votre espace.
      </p>
      {loading ? (
        <p role="status">Chargement…</p>
      ) : failed ? (
        <div role="alert">
          <p>Impossible de charger les skills.</p>
          <Button
            size="sm"
            onClick={() => {
              void query.refetch();
            }}
          >
            Réessayer
          </Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {published.map((skill) => (
            <li
              className="flex items-start gap-3 rounded-xl border border-border p-3"
              key={skill.id}
            >
              <div className="min-w-0 flex-1">
                <Link
                  to={`/app/skills/${skill.id}/edit`}
                  className="text-sm font-semibold break-all underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {skill.name}
                </Link>
                <p className="text-xs text-muted-foreground">
                  Version publiée {skill.publishedVersion}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
      {!loading && !failed && published.length === 0 && (
        <p className="text-xs text-muted-foreground">
          {query.hasNextPage
            ? 'Aucun skill actif et publié dans les résultats chargés.'
            : 'Aucun skill actif et publié.'}
        </p>
      )}
      {query.hasNextPage && (
        <Button
          variant="outline"
          size="sm"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          Charger plus de skills
        </Button>
      )}
    </section>
  );
}
