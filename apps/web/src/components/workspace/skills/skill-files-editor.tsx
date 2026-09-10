import type { SkillFileInput } from '@alfred/contracts';
import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { MarkdownEditor } from '@/components/ui/markdown-editor';
import { SourceEditor } from '@/components/ui/source-editor';
import { useSkillFiles } from '@/hooks/skills/use-skill-files';
import { SkillFileExplorer } from './skill-file-explorer';
import { SkillFileToolbar } from './skill-file-toolbar';

interface Props {
  readonly files: SkillFileInput[];
  readonly onChange: (files: SkillFileInput[]) => void;
  readonly disabled: boolean;
  readonly onBusy: (busy: boolean) => void;
}
export function SkillFilesEditor({ files, onChange, disabled, onBusy }: Props) {
  const { current, text, select, path, setPath, error, busy, add, update, remove } = useSkillFiles({
    files,
    onChange,
    disabled,
    onBusy,
  });
  const locked = disabled || busy;
  return (
    <section
      aria-label="Fichiers du skill"
      aria-busy={busy}
      className="grid min-w-0 overflow-hidden rounded-xl border border-border bg-background shadow-sm lg:grid-cols-[17rem_minmax(0,1fr)]"
    >
      <aside className="min-w-0 border-b border-border bg-muted/30 lg:border-r lg:border-b-0">
        <div className="p-3">
          <SkillFileExplorer files={files} selected={current?.path} onSelect={select} />
        </div>
        <SkillFileToolbar
          path={path}
          onPathChange={setPath}
          disabled={locked}
          error={error}
          onAdd={add}
        />
      </aside>
      <div className="min-w-0">
        {current ? (
          <>
            <header className="flex min-w-0 flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <FileText className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <span className="break-all">{current.path}</span>
              </div>
              {current.path !== 'SKILL.md' && (
                <Button
                  variant="outline"
                  size="sm"
                  disabled={locked}
                  onClick={remove}
                  className="h-auto whitespace-normal py-2 text-left"
                >
                  Retirer ce fichier du brouillon
                </Button>
              )}
            </header>
            <div className="min-w-0 p-4 lg:p-6">
              {text === null ? (
                <p className="flex min-h-64 items-center justify-center rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
                  Fichier binaire conservé dans le package.
                </p>
              ) : /\.md$/iu.test(current.path) ? (
                <MarkdownEditor
                  variant="source"
                  key={current.path}
                  label={`Contenu de ${current.path}`}
                  value={text}
                  disabled={locked}
                  onChange={update}
                  className="min-w-0 [&_[role=region]]:min-h-[28rem]"
                />
              ) : (
                <SourceEditor
                  label={`Contenu de ${current.path}`}
                  disabled={locked}
                  value={text}
                  onChange={update}
                />
              )}
            </div>
          </>
        ) : (
          <p className="p-6 text-sm text-muted-foreground">Ajoutez un fichier pour commencer.</p>
        )}
      </div>
    </section>
  );
}
