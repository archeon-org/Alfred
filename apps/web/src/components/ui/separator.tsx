import { cn } from '../../lib/cn';

interface SeparatorProps {
  readonly className?: string;
  readonly orientation?: 'horizontal' | 'vertical';
}

export function Separator({ className, orientation = 'horizontal' }: SeparatorProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'shrink-0 bg-line',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className,
      )}
    />
  );
}
