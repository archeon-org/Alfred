import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import type { WorkspacePreferences } from '@/lib/workspace/workspace-preferences.types';

export function AppearanceSettings({
  preferences,
}: {
  readonly preferences: WorkspacePreferences;
}) {
  const id = useId();
  return (
    <div className="space-y-4">
      <div className="divide-y divide-border rounded-xl border border-border bg-card/60 px-4">
        <div className="flex flex-wrap items-center justify-between gap-3 py-4">
          <label className="text-sm font-medium" htmlFor={`${id}-text-size`}>
            Taille du texte
          </label>
          <NativeSelect
            id={`${id}-text-size`}
            value={preferences.textSize}
            onChange={(event) => {
              const value = event.currentTarget.value;
              if (value === 'standard' || value === 'comfortable') preferences.setTextSize(value);
            }}
            className="border-border bg-card"
          >
            <NativeSelectOption value="standard">Standard</NativeSelectOption>
            <NativeSelectOption value="comfortable">Confortable</NativeSelectOption>
          </NativeSelect>
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <label className="cursor-pointer text-sm font-medium" htmlFor={`${id}-density`}>
            Navigation compacte
          </label>
          <Switch
            id={`${id}-density`}
            checked={preferences.density === 'compact'}
            onCheckedChange={(checked) =>
              preferences.setDensity(checked ? 'compact' : 'comfortable')
            }
            className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted"
          />
        </div>
        <div className="flex items-center justify-between gap-4 py-4">
          <label className="cursor-pointer text-sm font-medium" htmlFor={`${id}-motion`}>
            Réduire les animations
          </label>
          <Switch
            id={`${id}-motion`}
            checked={preferences.reducedMotion}
            onCheckedChange={preferences.setReducedMotion}
            className="data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted"
          />
        </div>
      </div>
      <Button onClick={preferences.resetPreferences} variant="outline" size="sm">
        Réinitialiser les préférences
      </Button>
    </div>
  );
}
