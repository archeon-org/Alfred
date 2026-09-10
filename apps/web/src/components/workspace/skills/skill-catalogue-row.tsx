import { useId } from 'react';
import type { SkillSummary } from '@alfred/contracts';
import { BookOpen, Download, Pencil, Send, Trash2 } from 'lucide-react';
import { ActionMenu } from '@/components/ui/action-menu';
import { Button } from '@/components/ui/button';

interface Props {
  readonly skill: SkillSummary;
  readonly pending: boolean;
  readonly onEdit: () => void;
  readonly onExport: () => void;
  readonly onPublish: () => void;
  readonly onDelete: () => void;
}

export function SkillCatalogueRow({
  skill,
  pending,
  onEdit,
  onExport,
  onPublish,
  onDelete,
}: Props) {
  const id = useId();
  return (
    <li className="flex min-w-0 items-center gap-1">
      <Button
        className="flex h-auto min-h-14 min-w-0 flex-1 items-center justify-start gap-3 rounded-lg px-3 py-3 text-left whitespace-normal"
        variant="ghost"
        disabled={pending}
        aria-label={`Modifier ${skill.name}`}
        aria-describedby={`${id}-description ${id}-status`}
        onClick={onEdit}
      >
        <BookOpen aria-hidden="true" className="shrink-0 text-muted-foreground" size={16} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-medium text-foreground wrap-anywhere">
            {skill.name}
          </span>
          <span
            id={`${id}-description`}
            className="block truncate text-2xs font-normal text-muted-foreground"
          >
            {skill.description}
          </span>
          <span className="block text-2xs font-normal text-muted-foreground">
            {skill.fileCount} fichier{skill.fileCount > 1 ? 's' : ''} ·{' '}
            {skill.totalBytes.toLocaleString('fr-FR')} octets
            {skill.status === 'draft' && skill.publishedVersion !== null
              ? ` · v${skill.publishedVersion} toujours publiée`
              : ''}
          </span>
        </span>
        <span
          id={`${id}-status`}
          className="flex shrink-0 flex-col items-end gap-1 text-2xs font-normal text-muted-foreground"
        >
          <span>
            {skill.status === 'published' ? 'Publié' : 'Brouillon'} · v{skill.currentVersion}
          </span>
          {skill.enabled === false && (
            <span className="rounded-md bg-muted px-1.5 py-0.5">Désactivé</span>
          )}
        </span>
      </Button>
      <ActionMenu
        label={`Actions du skill ${skill.name}`}
        items={[
          {
            id: 'edit',
            icon: Pencil,
            label: `Modifier ${skill.name}`,
            disabled: pending,
            onSelect: onEdit,
          },
          {
            id: 'export',
            icon: Download,
            label: `Exporter ${skill.name}`,
            disabled: pending,
            onSelect: onExport,
          },
          ...(skill.status === 'draft'
            ? [
                {
                  id: 'publish',
                  icon: Send,
                  label: `Publier ${skill.name}`,
                  disabled: pending,
                  onSelect: onPublish,
                },
              ]
            : []),
          {
            id: 'delete',
            icon: Trash2,
            label: `Supprimer ${skill.name}`,
            disabled: pending,
            destructive: true,
            separatorBefore: true,
            onSelect: onDelete,
          },
        ]}
      />
    </li>
  );
}
