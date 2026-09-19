import type { ReactNode } from 'react';

import { useFileDrop } from '@/hooks/ui/use-file-drop';
import { cn } from '@/lib/cn';

interface FileDropZoneProps {
  /** Where the dropped files go, in words: « Mes fichiers », or the name of the open folder. */
  readonly destination: string;
  readonly onFiles: (files: File[]) => void;
  readonly children: ReactNode;
  readonly className?: string;
}

/**
 * Drop files from the computer anywhere over the explorer. An enhancement only: « Importer »
 * does the same from the keyboard.
 */
export function FileDropZone({ children, className, destination, onFiles }: FileDropZoneProps) {
  const drop = useFileDrop(onFiles);
  return (
    <div
      className={cn('relative', className)}
      data-drop-target={drop.isOver ? '' : undefined}
      data-slot="file-drop-zone"
      {...drop.handlers}
    >
      {children}
      {drop.isOver ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl border-2 border-dashed border-ring bg-background/85 p-6 text-center text-sm font-medium"
        >
          Déposez vos fichiers pour les importer dans « {destination} »
        </div>
      ) : null}
    </div>
  );
}
