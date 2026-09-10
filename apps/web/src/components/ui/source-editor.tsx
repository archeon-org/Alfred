import { useId, useRef, type ComponentProps } from 'react';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';

interface SourceEditorProps extends Omit<ComponentProps<'textarea'>, 'value' | 'onChange'> {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}

/** Controlled source field with a synchronized gutter and native keyboard navigation. */
export function SourceEditor({
  label,
  value,
  onChange,
  className,
  id,
  ...props
}: SourceEditorProps) {
  const generatedId = useId();
  const gutter = useRef<HTMLDivElement>(null);
  const lines = value
    .split('\n')
    .map((_, index) => index + 1)
    .join('\n');
  return (
    <div
      data-slot="source-editor"
      className={cn(
        'flex h-[28rem] min-w-0 overflow-hidden rounded-lg border border-border bg-background focus-within:ring-2 focus-within:ring-ring',
        className,
      )}
    >
      <div
        aria-hidden="true"
        ref={gutter}
        className="shrink-0 overflow-hidden border-r border-border bg-muted/30 text-right font-mono text-sm leading-6 text-muted-foreground select-none"
      >
        <pre className="px-3 py-3 font-inherit">{lines}</pre>
      </div>
      <label className="sr-only" htmlFor={id ?? generatedId}>
        {label}
      </label>
      <Textarea
        {...props}
        id={id ?? generatedId}
        value={value}
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        wrap="off"
        className="h-full min-h-0 min-w-0 flex-1 resize-none rounded-none border-0 px-3 py-3 font-mono text-sm leading-6 shadow-none focus-visible:ring-0"
        onChange={(event) => onChange(event.target.value)}
        onScroll={(event) => {
          if (gutter.current) gutter.current.scrollTop = event.currentTarget.scrollTop;
          props.onScroll?.(event);
        }}
      />
    </div>
  );
}
