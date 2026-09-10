import type { ContextDocument } from '@alfred/contracts';
import { useId, useRef, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { MarkdownEditor, measureText } from '@/components/ui/markdown-editor';
import { normalizeContextText, readContextFile } from '@/lib/context/import-text';
import { ApiRequestError } from '@/services/http/api-json';

interface Props {
  readonly document: ContextDocument;
  readonly title: string;
  readonly description: string;
  readonly maxBytes: number;
  readonly onSave: (content: string, revision: number) => Promise<ContextDocument>;
  readonly onReload: () => Promise<ContextDocument>;
  readonly onDirtyChange: (kind: ContextDocument['kind'], dirty: boolean) => void;
}

/** Draft and observed revision stay together: a refetch never silently replaces local edits. */
export function ContextDocumentEditor({
  document,
  title,
  description,
  maxBytes,
  onSave,
  onDirtyChange,
  onReload,
}: Props) {
  const [baseline, setBaseline] = useState(document);
  const [draft, setDraft] = useState(document.content);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [replacement, setReplacement] = useState<string | null>(null);
  const [reload, setReload] = useState(false);
  const [discard, setDiscard] = useState(false);
  const generation = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const dirty = draft !== baseline.content;
  const invalid =
    measureText(draft, 'bytes') > maxBytes ||
    draft.includes('\0') ||
    /[\uD800-\uDFFF]/u.test(draft);
  function change(value: string) {
    generation.current += 1;
    setDraft(value);
    onDirtyChange(document.kind, value !== baseline.content);
  }
  async function save() {
    setPending(true);
    setError(null);
    try {
      const saved = await onSave(normalizeContextText(draft), baseline.revision);
      setBaseline(saved);
      setDraft(saved.content);
      onDirtyChange(document.kind, false);
    } catch (reason) {
      setError(
        reason instanceof ApiRequestError && reason.code === 'context_revision_conflict'
          ? 'Ce contenu a été modifié ailleurs. Votre brouillon est conservé. Copiez-le avant de recharger la version enregistrée.'
          : 'Impossible d’enregistrer ce contenu. Votre brouillon est conservé. Réessayez.',
      );
    } finally {
      setPending(false);
    }
  }
  async function importFile(file: File) {
    const started = generation.current;
    setReading(true);
    setError(null);
    try {
      const content = await readContextFile(file, maxBytes);
      if (dirty || generation.current !== started) setReplacement(content);
      else change(content);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Impossible de lire ce fichier.');
    } finally {
      setReading(false);
    }
  }
  return (
    <section
      aria-labelledby={`${id}-title`}
      className="space-y-4 rounded-xl border border-border bg-card p-4 md:p-5"
    >
      <div>
        <h3 id={`${id}-title`} className="font-semibold">
          {title}
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      </div>
      <MarkdownEditor
        label={title}
        value={draft}
        onChange={change}
        disabled={pending}
        limit={{ max: maxBytes, unit: 'bytes' }}
      />
      <div className="flex flex-wrap items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          disabled={pending || reading}
          onClick={() => fileInput.current?.click()}
        >
          Importer un fichier
        </Button>
        <Input
          ref={fileInput}
          hidden
          id={`${id}-import`}
          aria-label={`Importer · ${title}`}
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          disabled={pending || reading}
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            event.currentTarget.value = '';
            if (file !== undefined) void importFile(file);
          }}
        />
        <Button
          size="sm"
          disabled={!dirty || invalid || pending || reading}
          onClick={() => void save()}
          aria-label={`Enregistrer · ${title}`}
        >
          {pending ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={!dirty || pending || reading}
          onClick={() => setDiscard(true)}
        >
          Annuler les modifications
        </Button>
        <p role="status" className="text-xs text-muted-foreground">
          {reading ? 'Lecture du fichier…' : dirty ? 'Modifications non enregistrées' : 'À jour'}
        </p>
      </div>
      <p className="text-xs text-muted-foreground">
        Texte ou Markdown en UTF-8. Seul le contenu est enregistré lorsque vous cliquez sur
        Enregistrer.
      </p>
      {error !== null ? (
        <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
          <Button variant="outline" size="sm" disabled={pending} onClick={() => setReload(true)}>
            Recharger la version enregistrée
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={reload}
        title="Recharger ce document ?"
        description="Copiez votre brouillon si vous souhaitez le conserver. Il sera remplacé par la version enregistrée sur le serveur."
        confirmLabel="Recharger et remplacer"
        isPending={pending}
        onOpenChange={setReload}
        onConfirm={() => {
          setPending(true);
          void onReload()
            .then((latest) => {
              setBaseline(latest);
              setDraft(latest.content);
              onDirtyChange(document.kind, false);
              setError(null);
              setReload(false);
            })
            .catch(() => {
              setReload(false);
              setError('Impossible de recharger le contenu. Votre brouillon est conservé.');
            })
            .finally(() => setPending(false));
        }}
      />
      {invalid ? (
        <p role="alert" className="text-sm text-destructive">
          Le contenu dépasse la limite ou contient un caractère interdit.
        </p>
      ) : null}
      <ConfirmDialog
        open={replacement !== null}
        title="Remplacer le brouillon ?"
        description="Le contenu importé remplacera les modifications non enregistrées de ce document."
        confirmLabel="Remplacer le brouillon"
        onOpenChange={(open) => {
          if (!open) setReplacement(null);
        }}
        onConfirm={() => {
          if (replacement !== null) change(replacement);
          setReplacement(null);
        }}
      />
      <ConfirmDialog
        open={discard}
        title="Abandonner les modifications ?"
        description="Le brouillon sera remplacé par la dernière version chargée."
        confirmLabel="Abandonner les modifications"
        onOpenChange={setDiscard}
        onConfirm={() => {
          setBaseline(document);
          setDraft(document.content);
          onDirtyChange(document.kind, false);
          setError(null);
          setDiscard(false);
        }}
      />
    </section>
  );
}
