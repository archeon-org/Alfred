import { RotateCcw } from 'lucide-react';
import { useEffect, useId, useState } from 'react';

import { Button } from '@/components/ui/button';
import { IconButton } from '@/components/ui/icon-button';
import type { ShortcutPreferencesState } from '@/hooks/workspace/use-shortcut-preferences';
import {
  checkBinding,
  formatBinding,
  isDefaultBinding,
  isModifierKey,
  WORKSPACE_SHORTCUTS,
  type ShortcutAction,
} from '@/lib/workspace/keyboard-shortcuts';

interface ShortcutSettingsProps {
  readonly preferences: ShortcutPreferencesState;
}

/**
 * Every workspace shortcut with its current key, editable in place: press "Modifier", then the
 * new combination. The recorder enforces the same rules as the defaults, so a personal binding
 * never fights the browser or another action.
 */
export function ShortcutSettings({ preferences }: ShortcutSettingsProps) {
  const id = useId();
  const { apple, bindings, overrides, storageAvailable, setBinding } = preferences;
  const [recording, setRecording] = useState<ShortcutAction | null>(null);
  const [problem, setProblem] = useState<{ action: ShortcutAction; message: string } | null>(null);
  const customized = Object.keys(overrides).length > 0;

  useEffect(() => {
    if (recording === null) return;
    const action = recording;
    const capture = (event: KeyboardEvent) => {
      // While recording, no key reaches the page: neither the browser nor the workspace acts.
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        setRecording(null);
        setProblem(null);
        return;
      }
      if (isModifierKey(event.code)) return;
      const check = checkBinding(event, apple, action, bindings);
      if (!check.ok) {
        setProblem({ action, message: check.reason });
        return;
      }
      setBinding(action, check.binding);
      setRecording(null);
      setProblem(null);
    };
    window.addEventListener('keydown', capture, true);
    return () => window.removeEventListener('keydown', capture, true);
  }, [recording, apple, bindings, setBinding]);

  return (
    <div className="space-y-8">
      <p role="status" className="text-sm text-muted-foreground">
        {storageAvailable
          ? 'Vos raccourcis sont appliqués immédiatement et enregistrés dans ce navigateur.'
          : 'Le stockage de ce navigateur est indisponible. Vos raccourcis restent actifs pour cette session uniquement.'}
      </p>
      <section aria-labelledby={`${id}-title`} className="space-y-4">
        <div>
          <h2 id={`${id}-title`} className="text-base font-semibold">
            Vos raccourcis
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Chaque raccourci commence par {apple ? '⌘' : 'Ctrl'}, jamais par{' '}
            {apple ? 'Option' : 'Alt'}. Les touches que le navigateur ou le système utilisent déjà
            sont refusées, pour qu’un raccourci ne se batte jamais avec eux.
          </p>
        </div>
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card px-5 shadow-xs">
          {WORKSPACE_SHORTCUTS.map((definition) => {
            const binding = bindings[definition.action];
            const isRecording = recording === definition.action;
            const isDefault = isDefaultBinding(definition.action, binding);
            const rowProblem = problem?.action === definition.action ? problem.message : null;
            return (
              <li key={definition.action} className="py-5">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
                  <div className="min-w-0 flex-1 basis-48 space-y-1">
                    <p className="text-sm font-medium" id={`${id}-${definition.action}`}>
                      {definition.label}
                    </p>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      Par défaut : {formatBinding(definition.defaultBinding, apple)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <kbd
                      aria-label={`Raccourci actuel : ${formatBinding(binding, apple)}`}
                      className="rounded-md border border-border bg-muted px-2 py-1 font-sans text-xs text-foreground"
                    >
                      {formatBinding(binding, apple)}
                    </kbd>
                    <Button
                      aria-describedby={`${id}-${definition.action}`}
                      aria-pressed={isRecording}
                      onClick={() => {
                        setProblem(null);
                        setRecording(isRecording ? null : definition.action);
                      }}
                      size="sm"
                      variant="outline"
                    >
                      {isRecording ? 'Appuyez sur la combinaison…' : 'Modifier'}
                    </Button>
                    {isDefault ? null : (
                      <IconButton
                        label={`Rétablir le raccourci par défaut de « ${definition.label} »`}
                        onClick={() => {
                          setProblem(null);
                          preferences.resetBinding(definition.action);
                        }}
                        size="icon-sm"
                      >
                        <RotateCcw aria-hidden="true" size={15} />
                      </IconButton>
                    )}
                  </div>
                </div>
                {isRecording ? (
                  <p className="mt-2 text-xs text-muted-foreground" role="status">
                    Maintenez {apple ? '⌘' : 'Ctrl'} et appuyez sur une touche. Échap pour annuler.
                  </p>
                ) : null}
                {rowProblem ? (
                  <p className="mt-2 text-xs text-destructive" role="alert">
                    {rowProblem}
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      </section>
      <Button
        disabled={!customized}
        onClick={() => {
          setRecording(null);
          setProblem(null);
          preferences.resetAll();
        }}
        variant="outline"
      >
        <RotateCcw aria-hidden="true" size={16} />
        Restaurer les raccourcis par défaut
      </Button>
    </div>
  );
}
