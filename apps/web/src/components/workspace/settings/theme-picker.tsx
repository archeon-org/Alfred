import { RadioInput } from '@/components/ui/radio-input';
import { useId } from 'react';
import { Check, Monitor, Moon, Sun } from 'lucide-react';
import type { WorkspacePreferences } from '@/lib/workspace/workspace-preferences.types';

const themes = [
  { value: 'light', label: 'Clair', icon: Sun, description: 'Lumineux et épuré' },
  { value: 'dark', label: 'Sombre', icon: Moon, description: 'Une ambiance plus douce' },
  { value: 'system', label: 'Système', icon: Monitor, description: 'Suit votre appareil' },
] as const;

export function ThemePicker({
  value,
  onChange,
}: {
  readonly value: WorkspacePreferences['theme'];
  readonly onChange: WorkspacePreferences['setTheme'];
}) {
  const id = useId();
  return (
    <fieldset>
      <legend className="text-base font-semibold">Thème</legend>
      <p className="mt-1 text-sm text-muted-foreground">
        Choisissez la luminosité qui vous convient.
      </p>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {themes.map(({ value: theme, label, icon: Icon, description }) => (
          <label key={theme} htmlFor={`${id}-${theme}`} className="relative cursor-pointer">
            <RadioInput
              id={`${id}-${theme}`}
              aria-label={label}
              aria-describedby={`${id}-${theme}-description`}
              name={`${id}-theme`}
              value={theme}
              checked={value === theme}
              onChange={() => onChange(theme)}
            />
            <span className="flex h-full flex-col gap-4 rounded-2xl border border-border bg-card p-4 shadow-xs transition-[border-color,box-shadow] hover:border-ring/50 peer-checked:border-ring peer-checked:ring-1 peer-checked:ring-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
              <span
                aria-hidden="true"
                data-theme-preview={theme}
                className="flex h-24 overflow-hidden rounded-lg border border-border"
              >
                <span className="flex w-1/4 flex-col gap-2 border-r border-current/10 bg-current/5 p-2">
                  <span className="size-3 rounded-full bg-primary" />
                  <span className="mt-2 h-1 rounded bg-current/30" />
                  <span className="h-1 rounded bg-current/15" />
                </span>
                <span className="flex flex-1 flex-col items-start gap-2 p-3">
                  <Icon className="size-4" />
                  <span className="h-1 w-3/4 rounded bg-current/30" />
                  <span className="h-1 w-1/2 rounded bg-current/15" />
                  <span className="mt-auto h-3 w-full rounded border border-current/15" />
                </span>
              </span>
              <span className="flex items-center justify-between gap-2">
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span
                    id={`${id}-${theme}-description`}
                    className="mt-1 block text-xs text-muted-foreground"
                  >
                    {description}
                  </span>
                </span>
                {value === theme ? (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : null}
              </span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
