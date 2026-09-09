import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

export const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl text-sm font-semibold whitespace-nowrap transition-[color,background-color,border-color,box-shadow,transform] duration-150 outline-none focus-visible:ring-3 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 motion-safe:active:scale-[0.98] motion-reduce:transition-none [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    defaultVariants: { size: 'default', variant: 'default' },
    variants: {
      size: {
        default: 'h-11 min-h-11 px-4',
        icon: 'size-11 p-0',
        sm: 'h-9 min-h-9 rounded-lg px-3 text-xs',
        'icon-sm': 'size-8 rounded-lg p-0',
      },
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md active:shadow-xs',
        destructive:
          'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md active:shadow-xs',
        ghost: 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        outline:
          'border border-border bg-background text-foreground shadow-xs hover:border-ring/40 hover:bg-accent hover:text-accent-foreground',
      },
    },
  },
);

export interface ButtonProps
  extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {}

export function Button({
  className,
  size = 'default',
  type = 'button',
  variant = 'default',
  ...props
}: ButtonProps) {
  return (
    <button
      data-slot="button"
      data-size={size}
      data-variant={variant}
      className={cn(buttonVariants({ size, variant }), className)}
      type={type}
      {...props}
    />
  );
}
