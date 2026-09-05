import type { ButtonProps } from '@/components/ui/button';
import { Button } from '@/components/ui/button';

interface IconButtonProps extends Omit<ButtonProps, 'aria-label' | 'size'> {
  readonly label: string;
  readonly size?: 'icon' | 'icon-sm';
}

export function IconButton({ label, size = 'icon', ...props }: IconButtonProps) {
  return (
    <Button
      data-slot="icon-button"
      aria-label={label}
      title={label}
      size={size}
      variant="ghost"
      {...props}
    />
  );
}
