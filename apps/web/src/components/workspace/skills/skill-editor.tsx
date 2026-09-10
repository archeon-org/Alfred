import type { ReactNode } from 'react';
import type { SkillWriteInput } from '@alfred/contracts';
import { ArrowLeft, Download, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SkillFilesEditor } from '@/components/workspace/skills/skill-files-editor';
import { SkillMetadataFields } from '@/components/workspace/skills/skill-metadata-fields';
import { useSkillDraft, type SkillEditorState } from '@/hooks/skills/use-skill-draft';

interface Props {
  readonly headerContent?: ReactNode;
  readonly externalBusy?: boolean;
  readonly initial?: SkillWriteInput;
  readonly initialUnsaved?: boolean;
  readonly mode?: 'create' | 'edit';
  readonly onSave: (input: SkillWriteInput) => Promise<unknown>;
  readonly onClose: () => void;
  readonly onStateChange?: (state: SkillEditorState) => void;
}

/** Composes the editor; draft lifecycle and package operations live in hooks. */
export function SkillEditor(props: Props) {
  const editor = useSkillDraft(props);
  return (
    <>
      <form
        className="flex min-h-0 min-w-0 flex-1 flex-col"
        onSubmit={(event) => {
          event.preventDefault();
          void editor.save();
        }}
      >
        <div
          data-slot="skill-editor-header"
          className="sticky top-0 z-10 shrink-0 rounded-t-xl bg-card workspace:static"
        >
          {props.headerContent}
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-2 md:px-6">
            <div className="flex min-w-0 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <h1 className="truncate text-base font-semibold">
                {(props.mode ?? (props.initial ? 'edit' : 'create')) === 'edit'
                  ? 'Modifier le skill'
                  : 'Créer un skill'}
              </h1>
              <p role="status" className="text-xs text-muted-foreground">
                {editor.dirty ? 'Modifications non enregistrées' : 'Brouillon prêt à modifier'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="ghost" disabled={editor.busy} onClick={editor.close}>
                <ArrowLeft size={16} aria-hidden="true" /> Annuler
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={editor.busy}
                aria-label="Exporter le brouillon"
                onClick={() => void editor.exportDraft()}
              >
                <Download size={16} aria-hidden="true" /> Exporter
              </Button>
              <Button
                size="sm"
                type="submit"
                disabled={editor.busy}
                aria-label={editor.pending ? 'Enregistrement…' : 'Enregistrer le brouillon'}
              >
                <Save size={16} aria-hidden="true" />
                {editor.pending ? 'Enregistrement…' : 'Enregistrer'}
              </Button>
            </div>
          </header>
        </div>
        <div data-slot="skill-editor-body" className="min-h-0 flex-1 workspace:overflow-y-auto">
          <SkillMetadataFields
            name={editor.draft.name}
            description={editor.draft.description}
            disabled={editor.busy}
            onChange={(fields) => editor.setDraft({ ...editor.draft, ...fields })}
          />
          {editor.error && (
            <p role="alert" className="px-4 py-2 text-sm text-destructive">
              {editor.error}
            </p>
          )}
          <SkillFilesEditor
            files={editor.draft.files}
            onChange={(files) => editor.setDraft({ ...editor.draft, files })}
            disabled={editor.busy}
            onBusy={editor.setReading}
          />
        </div>
      </form>
      <ConfirmDialog
        open={editor.discard}
        onOpenChange={editor.setDiscard}
        title="Abandonner le brouillon ?"
        description="Les modifications non enregistrées seront perdues."
        confirmLabel="Abandonner"
        onConfirm={() => {
          editor.setDiscard(false);
          props.onClose();
        }}
      />
    </>
  );
}
