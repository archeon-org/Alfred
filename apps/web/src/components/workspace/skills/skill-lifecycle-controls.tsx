import type { SkillDetail } from '@alfred/contracts';
import { Power, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SkillVersionHistory } from '@/components/workspace/skills/skill-version-history';

interface Props {
  readonly skill: SkillDetail;
  readonly disabled: boolean;
  readonly publishDisabled: boolean;
  readonly onPublish: () => void;
  readonly onRestore: (version: number) => void;
  readonly onAvailability: () => void;
}
export function SkillLifecycleControls({
  skill,
  disabled,
  onRestore,
  onAvailability,
  onPublish,
  publishDisabled,
}: Props) {
  return (
    <section
      aria-label="Versions et disponibilité"
      className="flex shrink-0 flex-wrap items-center gap-x-2 gap-y-1 border-b border-border bg-muted/20 px-4 py-1 text-xs md:px-6"
    >
      <p className="mr-auto text-muted-foreground">
        {skill.enabled ? 'Actif' : 'Désactivé'} ·{' '}
        {skill.status === 'published' ? 'Publié' : 'Brouillon'} v{skill.currentVersion}
        {skill.publishedVersion !== null && skill.status === 'draft'
          ? ` · Version publiée : v${skill.publishedVersion}`
          : ''}
      </p>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || publishDisabled || skill.currentVersion === skill.publishedVersion}
        onClick={onPublish}
        title={publishDisabled ? 'Enregistrez vos modifications avant de publier.' : undefined}
      >
        <Upload size={14} aria-hidden="true" />
        {skill.currentVersion === skill.publishedVersion ? 'Publiée' : 'Publier'}
      </Button>
      <Button size="sm" variant="ghost" disabled={disabled} onClick={onAvailability}>
        <Power size={14} aria-hidden="true" />{' '}
        {skill.enabled ? 'Désactiver le skill' : 'Activer le skill'}
      </Button>
      <SkillVersionHistory
        skillId={skill.id}
        currentVersion={skill.currentVersion}
        publishedVersion={skill.publishedVersion}
        disabled={disabled}
        onRestore={onRestore}
      />
    </section>
  );
}
