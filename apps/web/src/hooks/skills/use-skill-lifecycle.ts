import { useCallback, useRef, useState } from 'react';
import type { SkillDetail } from '@alfred/contracts';
import { useSkillMutations } from '@/hooks/skills/use-skills';
import type { SkillEditorState } from '@/hooks/skills/use-skill-draft';
import { skillError } from '@/lib/skills/skill-errors';

type Action = { kind: 'restore'; sourceVersion: number } | { kind: 'disable' };

/** Keeps the draft's CAS token stable across background refreshes, advancing only after our writes. */
export function useSkillLifecycle(current: SkillDetail | undefined) {
  const [baseline, setBaseline] = useState(current);
  const [generation, setGeneration] = useState(0);
  const [action, setAction] = useState<Action | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editorState, setEditorState] = useState<SkillEditorState>({ dirty: false, busy: false });
  const locked = useRef(false);
  const mutations = useSkillMutations();
  const onEditorState = useCallback((state: SkillEditorState) => setEditorState(state), []);
  const execute = async (operation: Action | { kind: 'enable' } | { kind: 'publish' }) => {
    if (
      !baseline ||
      locked.current ||
      editorState.busy ||
      (operation.kind === 'publish' && editorState.dirty)
    )
      return;
    locked.current = true;
    setPending(true);
    setError(null);
    setNotice(null);
    try {
      const updated =
        operation.kind === 'restore'
          ? await mutations.restore({ ...baseline, sourceVersion: operation.sourceVersion })
          : operation.kind === 'publish'
            ? await mutations.publish(baseline)
            : await mutations.availability({ ...baseline, enabled: operation.kind === 'enable' });
      setBaseline(updated);
      if (operation.kind === 'restore') {
        setGeneration((value) => value + 1);
        setNotice(
          `Version ${operation.sourceVersion} restaurée. Aucune nouvelle version créée.${updated.currentVersion !== updated.publishedVersion ? ' Publiez-la pour l’utiliser.' : ''}`,
        );
      } else if (operation.kind === 'publish') {
        setNotice(`Version ${updated.currentVersion} publiée.`);
      } else {
        setNotice(updated.enabled ? 'Skill activé.' : 'Skill désactivé.');
      }
      setAction(null);
    } catch (reason) {
      setError(skillError(reason));
    } finally {
      locked.current = false;
      setPending(false);
    }
  };
  return {
    baseline,
    generation,
    action,
    setAction,
    pending,
    error,
    notice,
    editorState,
    onEditorState,
    execute,
    save: mutations.save,
  };
}
