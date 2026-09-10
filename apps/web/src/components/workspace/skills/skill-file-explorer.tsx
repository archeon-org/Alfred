import { useId, useState } from 'react';
import { ChevronDown, ChevronRight, FileText, Folder } from 'lucide-react';
import type { SkillFileInput } from '@alfred/contracts';
import { Button } from '@/components/ui/button';
import { buildSkillFileTree, type SkillFileNode } from '@/lib/skills/skill-file-tree';

interface EntryProps {
  readonly node: SkillFileNode;
  readonly selected: string | undefined;
  readonly onSelect: (path: string) => void;
}
function FileEntry({ node, selected, onSelect }: EntryProps) {
  const [open, setOpen] = useState(true);
  const id = useId();
  if (node.kind === 'file')
    return (
      <li className="min-w-0">
        <Button
          size="sm"
          variant={selected === node.path ? 'outline' : 'ghost'}
          aria-label={node.path}
          aria-pressed={selected === node.path}
          title={node.path}
          className="w-full min-w-0 justify-start gap-2"
          onClick={() => onSelect(node.path)}
        >
          <FileText className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{node.name}</span>
        </Button>
      </li>
    );
  return (
    <li className="min-w-0">
      <Button
        size="sm"
        variant="ghost"
        aria-label={`Dossier ${node.path}`}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen(!open)}
        className="w-full min-w-0 justify-start gap-2"
        title={node.path}
      >
        {open ? (
          <ChevronDown className="size-3 shrink-0" aria-hidden="true" />
        ) : (
          <ChevronRight className="size-3 shrink-0" aria-hidden="true" />
        )}
        <Folder className="size-4 shrink-0" aria-hidden="true" />
        <span className="truncate">{node.name}</span>
      </Button>
      <ul id={id} hidden={!open} className="ml-3 min-w-0 space-y-1 border-l border-border pl-2">
        {node.children.map((child) => (
          <FileEntry key={child.path} node={child} selected={selected} onSelect={onSelect} />
        ))}
      </ul>
    </li>
  );
}

interface Props {
  readonly files: readonly SkillFileInput[];
  readonly selected: string | undefined;
  readonly onSelect: (path: string) => void;
}
export function SkillFileExplorer({ files, selected, onSelect }: Props) {
  return (
    <nav aria-label="Arborescence des fichiers" className="min-w-0">
      <div className="mb-3 flex items-center justify-between gap-2 px-2 text-xs text-muted-foreground">
        <span className="font-medium">Fichiers</span>
        <span>{files.length}</span>
      </div>
      <ul className="max-h-60 space-y-1 overflow-y-auto lg:max-h-none">
        {buildSkillFileTree(files).map((node) => (
          <FileEntry key={node.path} node={node} selected={selected} onSelect={onSelect} />
        ))}
      </ul>
    </nav>
  );
}
