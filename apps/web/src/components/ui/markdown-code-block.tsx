import { Check, Copy } from 'lucide-react';
import { createContext, isValidElement, use, useEffect, useState, type ReactNode } from 'react';

import { IconButton } from '@/components/ui/icon-button';
import { MermaidDiagram } from '@/components/ui/mermaid-diagram';
import { useHighlightedCode } from '@/hooks/markdown/use-highlighted-code';

interface MarkdownCodeBlockProps {
  readonly children?: ReactNode;
  /** Whether this block is the last fence of the document and still waits for its closing line. */
  readonly unterminated?: boolean;
}

/** The Markdown source being rendered, for decisions that need the raw text of a node. */
export const MarkdownSourceContext = createContext('');

const FENCE_OPEN = /^ {0,3}(?:`{3,}|~{3,})/u;
const LINE_BREAK = /\r\n|\r|\n/u;

/** The lines of a text, trailing blank lines left out: they belong to no one. */
function contentLines(text: string): number {
  const lines = text.split(LINE_BREAK);
  while (lines.length > 0 && lines.at(-1)?.trim() === '') lines.pop();
  return lines.length;
}

/**
 * Whether the fenced block spanning `[start, end)` of `source` still waits for its closing line.
 * The parser already decided which lines belong to the block: `text`, the block's text as
 * react-markdown hands it over, holds every line after the opener while the fence is open, and one
 * line fewer than the span, the closing fence, once it is closed. Counting lines makes the
 * container prefixes (`> `, list indentation), the fence characters and the fence length
 * irrelevant. An indented code block has no fence and is complete by nature.
 */
export function isFenceUnterminated(
  source: string,
  start: number | undefined,
  end: number | undefined,
  text: string,
): boolean {
  if (start === undefined || end === undefined) return false;
  const span = source.slice(start, end).split(LINE_BREAK);
  if (!FENCE_OPEN.test(span[0] ?? '')) return false;
  return contentLines(span.slice(1).join('\n')) <= contentLines(text);
}

const COPIED_FOR_MS = 2000;

/** The fenced block as react-markdown hands it over: one `code` element with its class and text. */
export function codeOf(children: ReactNode): {
  readonly language: string | null;
  readonly value: string;
} {
  if (!isValidElement<{ className?: string; children?: ReactNode }>(children)) {
    return { language: null, value: typeof children === 'string' ? children : '' };
  }
  const language = /language-([\w+-]+)/u.exec(children.props.className ?? '')?.[1] ?? null;
  const raw = children.props.children;
  const value = Array.isArray(raw) ? raw.join('') : typeof raw === 'string' ? raw : '';
  return { language, value };
}

/**
 * A fenced code block with its language and a copy control; the text never becomes HTML. A
 * completed `mermaid` fence is drawn as a diagram, with this block as its source fallback.
 */
export function MarkdownCodeBlock({ children, unterminated = false }: MarkdownCodeBlockProps) {
  const { language, value } = codeOf(children);
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const copied = copyState === 'copied';
  // Highlighting waits for the closing fence: a streaming block is re-tokenised at most once.
  const lines = useHighlightedCode(value, language, !unterminated);
  useEffect(() => {
    if (copyState === 'idle') return;
    const timer = setTimeout(() => setCopyState('idle'), COPIED_FOR_MS);
    return () => clearTimeout(timer);
  }, [copyState]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value.replace(/\n$/u, ''));
      setCopyState('copied');
    } catch {
      setCopyState('failed');
    }
  };
  const block = (
    <div
      className="group/code relative overflow-hidden rounded-lg border border-border bg-muted"
      data-language={language ?? undefined}
      data-slot="markdown-code-block"
    >
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-1 text-2xs text-muted-foreground">
        <span className="font-mono uppercase tracking-label">{language ?? 'texte'}</span>
        <IconButton
          className="size-6 rounded-md"
          label={copied ? 'Copié' : 'Copier le code'}
          onClick={() => void copy()}
          size="icon-sm"
        >
          {copied ? <Check aria-hidden="true" size={13} /> : <Copy aria-hidden="true" size={13} />}
        </IconButton>
        {copyState !== 'idle' ? (
          <span className={copied ? 'sr-only' : 'text-destructive'} role="status">
            {copied ? 'Code copié.' : 'Copie impossible.'}
          </span>
        ) : null}
      </div>
      <pre
        className="m-0 overflow-x-auto p-3 font-mono text-xs leading-relaxed [scrollbar-width:thin]"
        data-highlighted={lines === null ? undefined : 'true'}
      >
        <code>
          {lines === null
            ? value
            : lines.map((line, index) => (
                <span className="block" key={index}>
                  {line.map((token, tokenIndex) => (
                    <span
                      key={tokenIndex}
                      style={{
                        color: token.color,
                        fontStyle: (token.fontStyle ?? 0) & 1 ? 'italic' : undefined,
                        fontWeight: (token.fontStyle ?? 0) & 2 ? 600 : undefined,
                      }}
                    >
                      {token.content}
                    </span>
                  ))}
                  {line.length === 0 ? '\n' : null}
                </span>
              ))}
        </code>
      </pre>
    </div>
  );
  if (language === 'mermaid' && !unterminated && value.trim().length > 0) {
    return <MermaidDiagram fallback={block} source={value} />;
  }
  return block;
}

/** Decides for one `pre` node, from its source span and its text, whether its fence is still open. */
export function useUnterminatedFence(
  start: number | undefined,
  end: number | undefined,
  text: string,
): boolean {
  const source = use(MarkdownSourceContext);
  return isFenceUnterminated(source, start, end, text);
}
