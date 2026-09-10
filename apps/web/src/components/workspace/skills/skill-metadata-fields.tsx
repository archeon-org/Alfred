import { useId } from 'react';
import { SKILL_DESCRIPTION_MAX_LENGTH, SKILL_NAME_MAX_LENGTH } from '@alfred/contracts';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

interface Props {
  readonly name: string;
  readonly description: string;
  readonly disabled: boolean;
  readonly onChange: (fields: { name?: string; description?: string }) => void;
}
export function SkillMetadataFields({ name, description, disabled, onChange }: Props) {
  const id = useId();
  return (
    <section
      aria-label="Métadonnées du skill"
      className="grid gap-4 border-b border-border bg-muted/30 px-4 py-4 md:grid-cols-[minmax(12rem,1fr)_2fr] md:px-6"
    >
      <label htmlFor={`${id}-name`} className="grid content-start gap-2 text-sm font-medium">
        Nom du skill
        <Input
          className="text-sm"
          id={`${id}-name`}
          required
          pattern="[a-z0-9]+(-[a-z0-9]+)*"
          maxLength={SKILL_NAME_MAX_LENGTH}
          disabled={disabled}
          placeholder="synthese-document"
          value={name}
          onChange={(event) => onChange({ name: event.target.value })}
        />
      </label>
      <label htmlFor={`${id}-description`} className="grid gap-2 text-sm font-medium">
        Description
        <Textarea
          id={`${id}-description`}
          rows={2}
          className="min-h-16 text-sm"
          required
          maxLength={SKILL_DESCRIPTION_MAX_LENGTH}
          disabled={disabled}
          value={description}
          onChange={(event) => onChange({ description: event.target.value })}
        />
      </label>
    </section>
  );
}
