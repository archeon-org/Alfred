import { BookOpenText, FileText, Pencil } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { markdownToText } from '@/lib/markdown/parse-markdown';

export type ProjectDocumentKey = 'context' | 'description';

export interface ProjectSourcesProps {
  readonly description: string | null;
  readonly context: string | null;
  readonly onEdit: (document: ProjectDocumentKey) => void;
}

const documents: readonly {
  readonly key: ProjectDocumentKey;
  readonly title: string;
  readonly hint: string;
  readonly empty: string;
  readonly Icon: typeof FileText;
}[] = [
  {
    Icon: FileText,
    empty: 'Aucune description pour le moment.',
    hint: 'De quoi parle ce projet, en quelques lignes.',
    key: 'description',
    title: 'Description',
  },
  {
    Icon: BookOpenText,
    empty: 'Aucun contexte pour le moment.',
    hint: 'Ce qu’Alfred doit savoir pour travailler ici : fonctionnement, règles, vocabulaire.',
    key: 'context',
    title: 'Contexte',
  },
];

/** The two Markdown documents of a project; editing opens the shared document dialog. */
export function ProjectSources({ context, description, onEdit }: ProjectSourcesProps) {
  const values = { context, description };
  return (
    <ul aria-label="Sources du projet" className="grid gap-3 md:grid-cols-2">
      {documents.map(({ Icon, empty, hint, key, title }) => {
        const value = values[key];
        const summary = value === null ? '' : markdownToText(value, 220);
        return (
          <li key={key}>
            <Card className="flex h-full flex-col gap-3 rounded-xl p-4 shadow-none">
              <div className="flex items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg border border-border bg-muted text-muted-foreground">
                  <Icon aria-hidden="true" size={17} />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold">{title}</h3>
                  <p className="mt-0.5 text-2xs text-muted-foreground">{hint}</p>
                </div>
              </div>
              <p className="flex-1 text-xs leading-relaxed text-muted-foreground wrap-anywhere">
                {summary === '' ? <span className="italic">{empty}</span> : summary}
              </p>
              <Button
                aria-label={`Modifier ${title === 'Contexte' ? 'le contexte' : 'la description'}`}
                className="self-start"
                onClick={() => onEdit(key)}
                size="sm"
                variant="outline"
              >
                <Pencil aria-hidden="true" size={14} />
                {summary === '' ? 'Rédiger' : 'Modifier'}
              </Button>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
