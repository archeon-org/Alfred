import { useId, useState } from 'react';
import { ChevronDown, History, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useSkillVersions } from '@/hooks/skills/use-skill-versions';
import { skillError } from '@/lib/skills/skill-errors';

interface Props {
  readonly skillId: string;
  readonly currentVersion: number;
  readonly publishedVersion: number | null;
  readonly disabled: boolean;
  readonly onRestore: (version: number) => void;
}
export function SkillVersionHistory({
  skillId,
  currentVersion,
  publishedVersion,
  disabled,
  onRestore,
}: Props) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const query = useSkillVersions(skillId, open);
  return (
    <div className="contents">
      <Button
        size="sm"
        variant="ghost"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
      >
        <History size={14} aria-hidden="true" /> Historique des versions{' '}
        <ChevronDown size={14} aria-hidden="true" />
      </Button>
      {open && (
        <section
          id={id}
          aria-label="Historique des versions"
          className="w-full basis-full max-h-56 overflow-y-auto rounded-lg border border-border bg-background p-3"
        >
          {query.isPending ? (
            <p role="status">Chargement des versions…</p>
          ) : query.isError ? (
            <div role="alert">
              <p>{skillError(query.error)}</p>
              <Button size="sm" onClick={() => void query.refetch()}>
                Réessayer
              </Button>
            </div>
          ) : (
            <>
              <ul className="divide-y divide-border">
                {query.data.pages
                  .flatMap((page) => page.items)
                  .map((version) => (
                    <li
                      key={version.version}
                      className="flex flex-wrap items-center justify-between gap-2 py-2"
                    >
                      <div className="contents">
                        <p className="text-xs font-medium">
                          Version {version.version}
                          {version.version === currentVersion ? ' · Courante' : ''}
                          {version.version === publishedVersion ? ' · Publiée' : ''}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {version.name} ·{' '}
                          <time dateTime={version.createdAt}>
                            {new Date(version.createdAt).toLocaleString('fr-FR')}
                          </time>
                        </p>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={disabled || version.version === currentVersion}
                        aria-label={`Restaurer la version ${version.version}`}
                        onClick={() => onRestore(version.version)}
                      >
                        <RotateCcw size={14} aria-hidden="true" /> Restaurer
                      </Button>
                    </li>
                  ))}
              </ul>
              {query.hasNextPage && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={query.isFetchingNextPage}
                  onClick={() => void query.fetchNextPage()}
                >
                  Versions précédentes
                </Button>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
