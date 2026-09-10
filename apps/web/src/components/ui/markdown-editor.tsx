import { useId, useState } from 'react';

import { MarkdownView } from '@/components/ui/markdown-view';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SourceEditor } from '@/components/ui/source-editor';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/cn';

export interface TextLimit {
  readonly max: number;
  readonly unit: 'characters' | 'bytes';
}

interface MarkdownEditorProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly placeholder?: string;
  readonly limit?: TextLimit;
  readonly disabled?: boolean;
  readonly className?: string;
  readonly variant?: 'document' | 'source';
}

export function measureText(value: string, unit: TextLimit['unit']): number {
  return unit === 'bytes' ? new TextEncoder().encode(value).byteLength : value.length;
}

/** Plain Markdown editor with a write/preview switch. State stays with the caller. */
export function MarkdownEditor({
  className,
  disabled = false,
  label,
  limit,
  onChange,
  placeholder,
  value,
  variant = 'document',
}: MarkdownEditorProps) {
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const textareaId = useId();
  const helpId = useId();
  const used = limit === undefined ? null : measureText(value, limit.unit);
  const overLimit = limit !== undefined && used !== null && used > limit.max;
  return (
    <Tabs
      data-slot="markdown-editor"
      className={cn('gap-3', className)}
      value={mode}
      onValueChange={(next) => setMode(next === 'preview' ? 'preview' : 'write')}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList aria-label={`Mode d’édition · ${label}`}>
          <TabsTrigger value="write">Écrire</TabsTrigger>
          <TabsTrigger value="preview">Aperçu</TabsTrigger>
        </TabsList>
        {limit !== undefined ? (
          <span
            className={cn('text-2xs text-muted-foreground', overLimit && 'text-destructive')}
            id={helpId}
          >
            {used?.toLocaleString('fr-FR')} / {limit.max.toLocaleString('fr-FR')}{' '}
            {limit.unit === 'bytes' ? 'octets' : 'caractères'}
          </span>
        ) : null}
      </div>
      <TabsContent value="write">
        {variant === 'source' ? (
          <SourceEditor
            label={label}
            value={value}
            onChange={onChange}
            disabled={disabled}
            placeholder={placeholder}
            aria-describedby={limit === undefined ? undefined : helpId}
            aria-invalid={overLimit || undefined}
          />
        ) : (
          <>
            <label className="sr-only" htmlFor={textareaId}>
              {label}
            </label>
            <Textarea
              aria-describedby={limit === undefined ? undefined : helpId}
              aria-invalid={overLimit || undefined}
              className="min-h-64 resize-y font-mono text-sm leading-relaxed"
              disabled={disabled}
              id={textareaId}
              onChange={(event) => onChange(event.target.value)}
              placeholder={placeholder}
              spellCheck
              value={value}
            />
          </>
        )}
      </TabsContent>
      <TabsContent value="preview">
        <MarkdownView
          aria-label={`Aperçu · ${label}`}
          className="min-h-64 rounded-md border border-border bg-background px-4 py-3"
          emptyLabel="Rien à prévisualiser pour le moment."
          role="region"
          source={value}
        />
      </TabsContent>
    </Tabs>
  );
}
