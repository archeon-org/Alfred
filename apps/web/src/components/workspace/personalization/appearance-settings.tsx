import { RadioInput } from '@/components/ui/radio-input';
import { useId } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { SettingsRow } from '@/components/workspace/settings/settings-row';
import { ThemePicker } from '@/components/workspace/settings/theme-picker';
import type { WorkspacePreferences } from '@/lib/workspace/workspace-preferences.types';

const accents = [
  { value: 'sage', label: 'Sauge' },
  { value: 'blue', label: 'Bleu' },
  { value: 'violet', label: 'Violet' },
  { value: 'rose', label: 'Rose' },
  { value: 'amber', label: 'Ambre' },
] as const;

export function AppearanceSettings({
  preferences,
}: {
  readonly preferences: WorkspacePreferences;
}) {
  const id = useId();
  return (
    <div className="space-y-8">
      <p role="status" className="text-sm text-muted-foreground">
        {preferences.storageAvailable
          ? 'Vos choix sont appliqués immédiatement et enregistrés dans ce navigateur.'
          : 'Le stockage de ce navigateur est indisponible. Vos choix restent actifs pour cette session uniquement.'}
      </p>
      <ThemePicker value={preferences.theme} onChange={preferences.setTheme} />
      <fieldset>
        <legend className="text-base font-semibold">Couleur d’accent</legend>
        <p className="mt-1 text-sm text-muted-foreground">
          Une touche de couleur pour les boutons, sélections et éléments actifs.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          {accents.map(({ value, label }) => (
            <label key={value} className="relative cursor-pointer">
              <RadioInput
                name={`${id}-accent`}
                value={value}
                checked={preferences.accent === value}
                onChange={() => preferences.setAccent(value)}
              />
              <span className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-card px-4 text-sm font-medium transition-colors hover:bg-accent peer-checked:border-ring peer-checked:bg-accent peer-checked:text-accent-foreground peer-checked:ring-1 peer-checked:ring-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
                <span
                  aria-hidden="true"
                  data-accent-swatch={value}
                  className="size-4 shrink-0 rounded-full"
                />
                {label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <section aria-labelledby={`${id}-comfort`} className="space-y-4">
        <h2 id={`${id}-comfort`} className="text-base font-semibold">
          Confort de l’interface
        </h2>
        <div className="divide-y divide-border rounded-2xl border border-border bg-card px-5 shadow-xs">
          <SettingsRow
            id={`${id}-density`}
            label="Navigation compacte"
            description="Réduisez l’espacement des éléments de navigation pour en afficher davantage."
          >
            <Switch
              id={`${id}-density`}
              aria-describedby={`${id}-density-description`}
              checked={preferences.density === 'compact'}
              onCheckedChange={(checked) =>
                preferences.setDensity(checked ? 'compact' : 'comfortable')
              }
            />
          </SettingsRow>
          <SettingsRow
            id={`${id}-reading`}
            label="Largeur de lecture"
            description="Une conversation centrée pour lire, ou étendue pour les tableaux et le code."
          >
            <NativeSelect
              id={`${id}-reading`}
              aria-describedby={`${id}-reading-description`}
              value={preferences.readingWidth}
              onChange={(event) => {
                const value = event.currentTarget.value;
                if (value === 'centered' || value === 'wide') preferences.setReadingWidth(value);
              }}
              className="min-h-11"
            >
              <NativeSelectOption value="centered">Centrée</NativeSelectOption>
              <NativeSelectOption value="wide">Étendue</NativeSelectOption>
            </NativeSelect>
          </SettingsRow>
          <SettingsRow
            id={`${id}-context`}
            label="Ouvrir le contexte par défaut"
            description="Affichez le contexte à côté de la conversation, ou en dessous sur les petits écrans."
          >
            <Switch
              id={`${id}-context`}
              aria-describedby={`${id}-context-description`}
              checked={preferences.contextOpenByDefault}
              onCheckedChange={preferences.setContextOpenByDefault}
            />
          </SettingsRow>
          <SettingsRow
            id={`${id}-motion`}
            label="Réduire les animations"
            description="Limitez les mouvements de l’interface. La préférence de votre système est également respectée."
          >
            <Switch
              id={`${id}-motion`}
              aria-describedby={`${id}-motion-description`}
              checked={preferences.reducedMotion}
              onCheckedChange={preferences.setReducedMotion}
            />
          </SettingsRow>
        </div>
      </section>
      <div className="border-t border-border pt-6">
        <Button
          onClick={preferences.resetPreferences}
          variant="outline"
          className="h-auto min-h-11 whitespace-normal py-3 text-left"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Restaurer l’apparence par défaut
        </Button>
      </div>
    </div>
  );
}
