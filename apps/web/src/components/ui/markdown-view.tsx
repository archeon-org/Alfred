import type { ComponentProps, ReactNode } from 'react';

import { cn } from '@/lib/cn';
import { parseMarkdown, type BlockNode, type InlineNode } from '@/lib/markdown/parse-markdown';

interface MarkdownViewProps extends Omit<ComponentProps<'div'>, 'children'> {
  readonly source: string;
  /** Shown instead of an empty document. */
  readonly emptyLabel?: string;
}

const headingClasses: Record<number, string> = {
  1: 'text-xl font-semibold tracking-tight',
  2: 'text-lg font-semibold tracking-tight',
  3: 'text-base font-semibold',
  4: 'text-sm font-semibold',
  5: 'text-sm font-medium',
  6: 'text-xs font-medium uppercase tracking-label text-muted-foreground',
};

function renderInline(nodes: readonly InlineNode[]): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return node.value;
      case 'break':
        return <br key={index} />;
      case 'code':
        return (
          <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]" key={index}>
            {node.value}
          </code>
        );
      case 'strong':
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case 'emphasis':
        return <em key={index}>{renderInline(node.children)}</em>;
      case 'link':
        return (
          <a
            className="text-primary underline underline-offset-2 hover:text-primary/80"
            href={node.href}
            key={index}
            rel="noreferrer noopener"
            target="_blank"
          >
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

function renderBlock(block: BlockNode, index: number): ReactNode {
  switch (block.type) {
    case 'heading': {
      const Heading = `h${block.level}` as const;
      return (
        <Heading className={headingClasses[block.level]} key={index}>
          {renderInline(block.children)}
        </Heading>
      );
    }
    case 'paragraph':
      return <p key={index}>{renderInline(block.children)}</p>;
    case 'list': {
      const List = block.ordered ? 'ol' : 'ul';
      return (
        <List
          className={cn('space-y-1 pl-5', block.ordered ? 'list-decimal' : 'list-disc')}
          key={index}
        >
          {block.items.map((item, itemIndex) => (
            <li key={itemIndex}>{renderInline(item)}</li>
          ))}
        </List>
      );
    }
    case 'code':
      return (
        <pre
          className="overflow-x-auto rounded-md border border-border bg-muted p-3 font-mono text-xs leading-relaxed"
          data-language={block.language ?? undefined}
          key={index}
        >
          <code>{block.value}</code>
        </pre>
      );
    case 'quote':
      return (
        <blockquote className="border-l-2 border-border pl-3 text-muted-foreground" key={index}>
          {renderInline(block.children)}
        </blockquote>
      );
    case 'rule':
      return <hr className="border-border" key={index} />;
  }
}

/** Renders Markdown as React elements: no HTML injection, links limited to http(s) and mailto. */
export function MarkdownView({ className, emptyLabel, source, ...props }: MarkdownViewProps) {
  const blocks = parseMarkdown(source);
  return (
    <div
      data-slot="markdown-view"
      className={cn('space-y-3 text-sm leading-relaxed wrap-anywhere', className)}
      {...props}
    >
      {blocks.length === 0 ? (
        <p className="text-muted-foreground italic">{emptyLabel ?? 'Aucun contenu.'}</p>
      ) : (
        blocks.map(renderBlock)
      )}
    </div>
  );
}
