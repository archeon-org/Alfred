import type { FileKind } from '@alfred/contracts';
import { File, FileImage, FileText, FileType } from 'lucide-react';

import { cn } from '@/lib/cn';

const ICONS = { docx: FileType, image: FileImage, pdf: FileText } as const;

interface FileTypeIconProps {
  /** Unknown until the leading bytes of a file were read. */
  readonly kind: FileKind | null;
  readonly className?: string;
}

/** Decorative: the row or chip it sits in always names the file, and states its kind in text. */
export function FileTypeIcon({ kind, className }: FileTypeIconProps) {
  const Icon = kind === null ? File : ICONS[kind];
  return (
    <Icon
      aria-hidden="true"
      data-kind={kind ?? 'unknown'}
      className={cn('size-4 shrink-0 text-muted-foreground', className)}
    />
  );
}
