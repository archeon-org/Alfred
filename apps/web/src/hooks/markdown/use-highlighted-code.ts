import { useEffect, useState } from 'react';

import { highlight, type HighlightedLine } from '@/lib/markdown/highlight';

/**
 * Highlighted tokens of a finished code block, or null while plain text is the right answer
 * (unknown language, unfinished fence, tokenising in progress or refused).
 */
export function useHighlightedCode(
  code: string,
  language: string | null,
  enabled: boolean,
): readonly HighlightedLine[] | null {
  const [state, setState] = useState<{ code: string; lines: readonly HighlightedLine[] } | null>(
    null,
  );
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void highlight(code, language).then((lines) => {
      if (!cancelled && lines !== null) setState({ code, lines });
    });
    return () => {
      cancelled = true;
    };
  }, [code, language, enabled]);
  return enabled && state !== null && state.code === code ? state.lines : null;
}
