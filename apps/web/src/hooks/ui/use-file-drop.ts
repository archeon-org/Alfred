import { useState, type DragEvent } from 'react';

/** A drag that carries files from the computer, as opposed to text or a dragged link. */
function carriesFiles(event: DragEvent): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes('Files');
}

/**
 * Drop files from the computer onto an element. Without a receiver nothing is handled, so the
 * browser keeps its default behaviour and no highlight ever shows.
 */
export function useFileDrop(onFiles: ((files: File[]) => void) | undefined) {
  const [isOver, setIsOver] = useState(false);
  if (onFiles === undefined) return { isOver: false, handlers: {} };
  return {
    isOver,
    handlers: {
      onDragEnter: (event: DragEvent<HTMLElement>) => {
        if (carriesFiles(event)) setIsOver(true);
      },
      onDragOver: (event: DragEvent<HTMLElement>) => {
        // Without this the browser refuses the drop and opens the file instead.
        if (carriesFiles(event)) event.preventDefault();
      },
      onDragLeave: (event: DragEvent<HTMLElement>) => {
        // Moving over a child fires a leave on the parent: only a real exit ends the highlight.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsOver(false);
      },
      onDrop: (event: DragEvent<HTMLElement>) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setIsOver(false);
        const files = Array.from(event.dataTransfer.files);
        if (files.length > 0) onFiles(files);
      },
    },
  };
}
