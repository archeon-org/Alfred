import { MoreHorizontal, type LucideIcon } from 'lucide-react';
import { Fragment } from 'react';

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { IconButton } from '@/components/ui/icon-button';

export interface ActionMenuItem {
  readonly id: string;
  readonly label: string;
  readonly icon?: LucideIcon;
  readonly onSelect: () => void;
  /** Renders in the destructive tone (deletion, revocation). */
  readonly destructive?: boolean;
  readonly disabled?: boolean;
  /** Draws a separator above this item. */
  readonly separatorBefore?: boolean;
}

interface ActionMenuProps {
  /** Accessible name of the trigger, e.g. "Actions du projet Atlas". */
  readonly label: string;
  readonly items: readonly ActionMenuItem[];
  readonly align?: 'end' | 'start';
  readonly size?: 'icon' | 'icon-sm';
  readonly className?: string;
}

/** The application's "⋯" menu: one trigger, a list of actions, destructive ones last. */
export function ActionMenu({
  align = 'end',
  className,
  items,
  label,
  size = 'icon-sm',
}: ActionMenuProps) {
  return (
    <DropdownMenu data-slot="action-menu" modal={false}>
      <DropdownMenuTrigger asChild>
        <IconButton className={className} label={label} size={size}>
          <MoreHorizontal aria-hidden="true" size={16} />
        </IconButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} aria-label={label}>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <Fragment key={item.id}>
              {item.separatorBefore ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                disabled={item.disabled}
                onSelect={item.onSelect}
                variant={item.destructive ? 'destructive' : 'default'}
              >
                {Icon ? <Icon aria-hidden="true" /> : null}
                {item.label}
              </DropdownMenuItem>
            </Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
