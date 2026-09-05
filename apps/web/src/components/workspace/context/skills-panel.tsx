import { useId } from 'react';

import { Sparkles } from 'lucide-react';

import { Switch } from '@/components/ui/switch';
import type { WorkspaceToolsState } from '@/lib/workspace/workspace-tools.types';

export function SkillsPanel({
  tools,
}: {
  readonly tools: Pick<WorkspaceToolsState, 'skills' | 'enabledSkillIds' | 'toggleSkill'>;
}) {
  const id = useId();
  return (
    <section aria-labelledby={`${id}-title`} className="space-y-5">
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold" id={`${id}-title`}>
            Les skills
          </h3>
          <Sparkles aria-hidden="true" className="size-4 text-primary" />
        </div>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          Imaginez les savoir-faire de votre assistant.
        </p>
      </div>
      <ul className="space-y-3">
        {tools.skills.map((skill) => (
          <li
            className="flex items-start gap-3 rounded-xl border border-border bg-card/70 p-3 shadow-sm"
            key={skill.id}
          >
            <div className="min-w-0 flex-1">
              <label
                className="cursor-pointer text-xs font-semibold"
                htmlFor={`${id}-skill-${skill.id}`}
              >
                {skill.name}
              </label>
              <p
                className="mt-1 text-2xs leading-relaxed text-muted-foreground"
                id={`${id}-skill-${skill.id}-description`}
              >
                {skill.description}
              </p>
            </div>
            <Switch
              aria-describedby={`${id}-skill-${skill.id}-description`}
              checked={tools.enabledSkillIds.includes(skill.id)}
              id={`${id}-skill-${skill.id}`}
              onCheckedChange={() => tools.toggleSkill(skill.id)}
            />
          </li>
        ))}
      </ul>
      <p className="text-2xs leading-relaxed text-muted-foreground">
        Sélections d’aperçu uniquement. Aucun skill n’est exécuté.
      </p>
    </section>
  );
}
