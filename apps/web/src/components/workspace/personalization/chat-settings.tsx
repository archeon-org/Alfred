import { Check, RotateCcw } from 'lucide-react';
import { useId } from 'react';

import { Button } from '@/components/ui/button';
import { RadioInput } from '@/components/ui/radio-input';
import { Switch } from '@/components/ui/switch';
import { SettingsRow } from '@/components/workspace/settings/settings-row';
import type { ChatPreferencesState } from '@/hooks/workspace/use-chat-preferences';
import type { ChatDetail, ChatDisplayKey } from '@/lib/workspace/chat-preferences';

const details: readonly {
  readonly value: ChatDetail;
  readonly label: string;
  readonly description: string;
}[] = [
  {
    value: 'simple',
    label: 'Simple',
    description:
      'Une ligne dit ce qu’Alfred fait. Déplié, le travail ne montre que les spécialistes appelés.',
  },
  {
    value: 'standard',
    label: 'Standard',
    description:
      'Les réflexions, messages et outils d’Alfred, les messages et outils des spécialistes.',
  },
  {
    value: 'detailed',
    label: 'Détaillé',
    description:
      'Tout, y compris les réflexions des spécialistes, ouvertes pendant qu’elles s’écrivent.',
  },
  {
    value: 'custom',
    label: 'Personnalisé',
    description: 'Votre propre combinaison des réglages ci-dessous.',
  },
];

interface SwitchCopy {
  readonly key: ChatDisplayKey;
  readonly label: string;
  readonly description: string;
}

const groups: readonly {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly switches: readonly SwitchCopy[];
}[] = [
  {
    key: 'live',
    title: 'Pendant le travail',
    description: 'Comment le travail s’affiche pendant qu’Alfred répond, puis une fois fini.',
    switches: [
      {
        key: 'openWhileWorking',
        label: 'Déplier le travail pendant qu’Alfred travaille',
        description: 'Désactivé, une seule ligne indique l’activité en cours.',
      },
      {
        key: 'openReasoningWhileStreaming',
        label: 'Ouvrir les réflexions pendant qu’elles s’écrivent',
        description: 'Désactivé, une réflexion reste repliée sur sa dernière ligne.',
      },
      {
        key: 'foldWhenDone',
        label: 'Replier le travail une fois la réponse terminée',
        description: 'Seule la réponse reste visible, avec le bilan du travail au-dessus.',
      },
    ],
  },
  {
    key: 'orchestrator',
    title: 'Alfred',
    description: 'Ce que fait Alfred lui-même, l’orchestrateur qui répond et délègue.',
    switches: [
      {
        key: 'orchestratorReasoning',
        label: 'Réflexions d’Alfred',
        description: 'Son raisonnement, quand le modèle l’expose.',
      },
      {
        key: 'orchestratorMessages',
        label: 'Messages intermédiaires d’Alfred',
        description: 'Ce qu’il annonce entre deux actions.',
      },
      {
        key: 'orchestratorTools',
        label: 'Outils d’Alfred',
        description: 'Ses propres appels d’outils, par exemple sa liste de tâches.',
      },
      {
        key: 'emptyGenerations',
        label: 'Générations sans réponse',
        description:
          'Les appels au modèle qui n’ont rien produit, par exemple avant un modèle de secours.',
      },
    ],
  },
  {
    key: 'specialists',
    title: 'Spécialistes',
    description:
      'Le travail des spécialistes qu’Alfred appelle. Les spécialistes restent toujours listés.',
    switches: [
      {
        key: 'specialistReasoning',
        label: 'Réflexions des spécialistes',
        description: 'Leur raisonnement, souvent long, quand le modèle l’expose.',
      },
      {
        key: 'specialistMessages',
        label: 'Messages des spécialistes',
        description: 'Ce qu’un spécialiste annonce entre deux actions.',
      },
      {
        key: 'specialistTools',
        label: 'Outils des spécialistes',
        description: 'Les requêtes et appels d’outils de chaque spécialiste.',
      },
    ],
  },
];

/** Display choices for the chat: a preset, or a custom combination of the switches it sets. */
export function ChatSettings({ preferences }: { readonly preferences: ChatPreferencesState }) {
  const id = useId();
  return (
    <div className="space-y-8">
      <p role="status" className="text-sm text-muted-foreground">
        {preferences.storageAvailable
          ? 'Vos choix sont appliqués immédiatement et enregistrés dans ce navigateur. Ils ne changent que l’affichage : tout le travail reste consultable.'
          : 'Le stockage de ce navigateur est indisponible. Vos choix restent actifs pour cette session uniquement.'}
      </p>
      <fieldset>
        <legend className="text-base font-semibold">Niveau de détail</legend>
        <p className="mt-1 text-sm text-muted-foreground">
          Un niveau règle tous les interrupteurs ci-dessous. Changer un interrupteur passe en
          Personnalisé.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {details.map(({ value, label, description }) => (
            <label key={value} htmlFor={`${id}-${value}`} className="relative cursor-pointer">
              <RadioInput
                id={`${id}-${value}`}
                aria-label={label}
                aria-describedby={`${id}-${value}-description`}
                name={`${id}-detail`}
                value={value}
                checked={preferences.detail === value}
                onChange={() =>
                  value === 'custom' ? preferences.keepCustom() : preferences.applyPreset(value)
                }
              />
              <span className="flex h-full items-start justify-between gap-3 rounded-2xl border border-border bg-card p-4 shadow-xs transition-[border-color,box-shadow] hover:border-ring/50 peer-checked:border-ring peer-checked:ring-1 peer-checked:ring-ring peer-focus-visible:ring-3 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-background">
                <span>
                  <span className="block text-sm font-medium">{label}</span>
                  <span
                    id={`${id}-${value}-description`}
                    className="mt-1 block text-xs leading-relaxed text-muted-foreground"
                  >
                    {description}
                  </span>
                </span>
                {preferences.detail === value ? (
                  <Check className="size-4 shrink-0 text-primary" aria-hidden="true" />
                ) : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {groups.map((group) => (
        <section
          key={group.key}
          aria-labelledby={`${id}-${group.key}`}
          aria-describedby={`${id}-${group.key}-description`}
          className="space-y-4"
        >
          <div className="space-y-1">
            <h2 id={`${id}-${group.key}`} className="text-base font-semibold">
              {group.title}
            </h2>
            <p id={`${id}-${group.key}-description`} className="text-sm text-muted-foreground">
              {group.description}
            </p>
          </div>
          <div className="divide-y divide-border rounded-2xl border border-border bg-card px-5 shadow-xs">
            {group.switches.map(({ key, label, description }) => (
              <SettingsRow key={key} id={`${id}-${key}`} label={label} description={description}>
                <Switch
                  id={`${id}-${key}`}
                  aria-describedby={`${id}-${key}-description`}
                  checked={preferences[key]}
                  onCheckedChange={(checked) => preferences.setSwitch(key, checked)}
                />
              </SettingsRow>
            ))}
          </div>
        </section>
      ))}
      <div className="border-t border-border pt-6">
        <Button
          onClick={preferences.reset}
          variant="outline"
          className="h-auto min-h-11 whitespace-normal py-3 text-left"
        >
          <RotateCcw className="size-4" aria-hidden="true" />
          Restaurer l’affichage par défaut
        </Button>
      </div>
    </div>
  );
}
