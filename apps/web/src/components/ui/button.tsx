import { cva, type VariantProps } from 'class-variance-authority';
import type { ButtonHTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

export const buttonVariants = cva(
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-colors outline-none focus-visible:ring-3 focus-visible:ring-brand-700 focus-visible:ring-offset-2 focus-visible:ring-offset-panel disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none',
  {
    defaultVariants: { size: 'default', variant: 'default' },
    variants: {
      size: {
        default: 'h-11',
        icon: 'size-11 p-0',
        sm: 'h-9 min-h-9 rounded-lg px-3 text-xs',
      },
      variant: {
        default: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800',
        ghost: 'text-muted hover:bg-brand-50 hover:text-ink',
        outline: 'border border-line bg-panel text-ink hover:border-brand-300 hover:bg-brand-50',
      },
    },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, size, type = 'button', variant, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ size, variant }), className)} type={type} {...props} />
  );
}
