import { useEffect, useRef, useState } from 'react';
import { skillWriteInputSchema, type SkillWriteInput } from '@alfred/contracts';
import {
  decodeSkillFile,
  encodeSkillFile,
  exportSkillPackage,
  normalizeSkillMarkdown,
} from '@/lib/skills/skill-package';
import { downloadSkill, skillError } from '@/lib/skills/skill-errors';

export interface SkillEditorState {
  readonly dirty: boolean;
  readonly busy: boolean;
}
interface Options {
  readonly externalBusy?: boolean;
  readonly initial?: SkillWriteInput;
  readonly initialUnsaved?: boolean;
  readonly onSave: (input: SkillWriteInput) => Promise<unknown>;
  readonly onClose: () => void;
  readonly onStateChange?: (state: SkillEditorState) => void;
}
const emptySkill = (): SkillWriteInput => ({
  name: '',
  description: '',
  files: [encodeSkillFile('SKILL.md', '', 'text/markdown')],
});
export function useSkillDraft({
  initial,
  externalBusy = false,
  initialUnsaved = false,
  onSave,
  onClose,
  onStateChange,
}: Options) {
  const [baseline] = useState(() =>
    initial
      ? { name: initial.name, description: initial.description, files: initial.files }
      : emptySkill(),
  );
  const [draft, setDraft] = useState(baseline);
  const [pending, setPending] = useState(false);
  const [reading, setReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discard, setDiscard] = useState(false);
  const busy = pending || reading || externalBusy;
  const dirty = initialUnsaved || JSON.stringify(draft) !== JSON.stringify(baseline);
  useEffect(() => onStateChange?.({ dirty, busy }), [dirty, busy, onStateChange]);
  const saving = useRef(false);
  useEffect(() => {
    if (!dirty && !busy) return;
    const leave = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', leave);
    return () => window.removeEventListener('beforeunload', leave);
  }, [dirty, busy]);
  const close = () => {
    if (busy) return;
    if (dirty) setDiscard(true);
    else onClose();
  };
  const normalized = (): SkillWriteInput => ({
    ...draft,
    name: draft.name.trim(),
    description: draft.description.trim(),
    files: draft.files.map((file) => {
      if (file.path !== 'SKILL.md') return file;
      const original = decodeSkillFile(file);
      const markdown = normalizeSkillMarkdown(
        original,
        draft.name.trim(),
        draft.description.trim(),
      );
      // Decoding strips the UTF-8 BOM. Keep the original bytes when no metadata changed.
      return markdown === original ? file : encodeSkillFile('SKILL.md', markdown, 'text/markdown');
    }),
  });
  async function save() {
    if (saving.current || busy) return;
    saving.current = true;
    setPending(true);
    setError(null);
    try {
      const input = normalized();
      if (!skillWriteInputSchema.safeParse(input).success) {
        setError('Renseignez un nom en minuscules avec tirets et une description.');
        return;
      }
      await onSave(input);
      onClose();
    } catch (reason) {
      setError(skillError(reason));
    } finally {
      saving.current = false;
      setPending(false);
    }
  }
  async function exportDraft() {
    setError(null);
    try {
      downloadSkill(await exportSkillPackage(normalized()), draft.name);
    } catch {
      setError('Impossible d’exporter le brouillon. Vérifiez ses métadonnées.');
    }
  }
  return {
    draft,
    setDraft,
    pending,
    busy,
    dirty,
    error,
    discard,
    setDiscard,
    setReading,
    close,
    save,
    exportDraft,
  };
}
