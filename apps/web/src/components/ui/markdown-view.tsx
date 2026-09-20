import { memo, type ComponentProps } from 'react';
import Markdown, { type Components, type UrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';

import {
  codeOf,
  MarkdownCodeBlock,
  MarkdownSourceContext,
  useUnterminatedFence,
} from '@/components/ui/markdown-code-block';
import { cn } from '@/lib/cn';

interface MarkdownViewProps extends Omit<ComponentProps<'div'>, 'children'> {
  readonly source: string;
  /** Shown instead of an empty document. */
  readonly emptyLabel?: string;
}

const SAFE_URL = /^(?:https?:\/\/|mailto:)/iu;

/** react-markdown passes the hast node along; DOM elements must not receive it. */
function strip<P extends { node?: unknown }>(props: P): Omit<P, 'node'> {
  const { node, ...rest } = props;
  void node;
  return rest;
}
function CodeBlock({
  node,
  children,
}: ComponentProps<'pre'> & {
  node?: { position?: { start: { offset?: number }; end: { offset?: number } } };
}) {
  const unterminated = useUnterminatedFence(
    node?.position?.start.offset,
    node?.position?.end.offset,
    codeOf(children).value,
  );
  return <MarkdownCodeBlock unterminated={unterminated}>{children}</MarkdownCodeBlock>;
}

/** Only web and mail links survive; anything else loses its destination and reads as text. */
const safeUrl: UrlTransform = (url) => (SAFE_URL.test(url) ? url : null);

const headingClasses: Record<number, string> = {
  1: 'text-xl font-semibold tracking-tight',
  2: 'text-lg font-semibold tracking-tight',
  3: 'text-base font-semibold',
  4: 'text-sm font-semibold',
  5: 'text-sm font-medium',
  6: 'text-xs font-medium uppercase tracking-label text-muted-foreground',
};

const heading =
  (level: 1 | 2 | 3 | 4 | 5 | 6) => (props: ComponentProps<'h1'> & { node?: unknown }) => {
    const Heading = `h${level}` as const;
    const { className, ...rest } = strip(props);
    return <Heading className={cn(headingClasses[level], className)} {...rest} />;
  };

/**
 * React elements for every Markdown construct. The tree never turns into HTML: raw HTML in the
 * source is skipped, links are filtered, and images are shown as links rather than fetched.
 */
const components: Components = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  p: (props) => <p {...strip(props)} />,
  a: (props) => {
    const { href, children, ...rest } = strip(props);
    return href === undefined || href === '' ? (
      <span>{children}</span>
    ) : (
      <a
        className="text-primary underline underline-offset-2 hover:text-primary/80"
        href={href}
        rel="noreferrer noopener"
        target="_blank"
        {...rest}
      >
        {children}
      </a>
    );
  },
  img: ({ src, alt }) =>
    typeof src === 'string' && src !== '' ? (
      <a
        className="text-primary underline underline-offset-2 hover:text-primary/80"
        href={src}
        rel="noreferrer noopener"
        target="_blank"
      >
        Image : {alt || src}
      </a>
    ) : (
      <span>{alt}</span>
    ),
  ul: (props) => (
    <ul className={cn('list-disc space-y-1 pl-5', props.className)} {...strip(props)} />
  ),
  ol: (props) => (
    <ol className={cn('list-decimal space-y-1 pl-5', props.className)} {...strip(props)} />
  ),
  li: (props) => (
    <li className={cn('[&>ol]:mt-1 [&>ul]:mt-1', props.className)} {...strip(props)} />
  ),
  input: ({ checked }) => (
    <input
      aria-label={checked ? 'Tâche terminée' : 'Tâche à faire'}
      checked={Boolean(checked)}
      className="mr-1.5 size-3.5 translate-y-px accent-primary"
      readOnly
      type="checkbox"
      disabled
    />
  ),
  blockquote: (props) => (
    <blockquote
      className={cn('border-l-2 border-border pl-3 text-muted-foreground', props.className)}
      {...strip(props)}
    />
  ),
  hr: (props) => <hr className={cn('border-border', props.className)} {...strip(props)} />,
  code: (props) => (
    <code
      className={cn('rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]', props.className)}
      {...strip(props)}
    />
  ),
  pre: CodeBlock,
  table: (props) => (
    <div className="overflow-x-auto rounded-lg border border-border [scrollbar-width:thin]">
      <table
        className={cn('w-full border-collapse text-left text-sm', props.className)}
        {...strip(props)}
      />
    </div>
  ),
  thead: (props) => (
    <thead
      className={cn('bg-muted text-xs uppercase tracking-label', props.className)}
      {...strip(props)}
    />
  ),
  th: (props) => (
    <th
      className={cn(
        'border-b border-border px-3 py-2 font-semibold whitespace-nowrap',
        props.className,
      )}
      {...strip(props)}
    />
  ),
  td: (props) => (
    <td
      className={cn('border-b border-border px-3 py-2 align-top last:border-b-0', props.className)}
      {...strip(props)}
    />
  ),
  tr: (props) => <tr className={cn('last:[&>td]:border-b-0', props.className)} {...strip(props)} />,
  del: (props) => <del {...strip(props)} />,
  strong: (props) => <strong {...strip(props)} />,
  em: (props) => <em {...strip(props)} />,
};

/**
 * Renders Markdown as React elements: no HTML injection, links limited to http(s) and mailto.
 * Memoised because a transcript re-renders on every streamed event while each stored answer keeps
 * the same source; re-parsing every answer per event was measured at ~100 ms for a long one.
 */
export const MarkdownView = memo(function MarkdownView({
  className,
  emptyLabel,
  source,
  ...props
}: MarkdownViewProps) {
  const empty = source.trim().length === 0;
  return (
    <div
      data-slot="markdown-view"
      className={cn('space-y-3 text-sm leading-relaxed wrap-anywhere', className)}
      {...props}
    >
      {empty ? (
        <p className="text-muted-foreground italic">{emptyLabel ?? 'Aucun contenu.'}</p>
      ) : (
        <MarkdownSourceContext value={source}>
          <Markdown
            components={components}
            remarkPlugins={[remarkGfm]}
            skipHtml
            urlTransform={safeUrl}
          >
            {source}
          </Markdown>
        </MarkdownSourceContext>
      )}
    </div>
  );
});
