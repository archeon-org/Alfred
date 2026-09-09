import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pencil, Trash2 } from 'lucide-react';
import { describe, expect, it, vi } from 'vitest';

import { ActionMenu } from '@/components/ui/action-menu';

describe('ActionMenu', () => {
  it('opens on click, exposes items with their tone and runs the chosen action', async () => {
    const user = userEvent.setup();
    const rename = vi.fn();
    const remove = vi.fn();
    render(
      <ActionMenu
        items={[
          { icon: Pencil, id: 'rename', label: 'Renommer', onSelect: rename },
          {
            destructive: true,
            icon: Trash2,
            id: 'delete',
            label: 'Supprimer',
            onSelect: remove,
            separatorBefore: true,
          },
        ]}
        label="Actions du projet Atlas"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Actions du projet Atlas' });
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();

    await user.click(trigger);

    const menu = screen.getByRole('menu', { name: 'Actions du projet Atlas' });
    expect(menu).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Supprimer' })).toHaveAttribute(
      'data-variant',
      'destructive',
    );
    expect(screen.getByRole('separator')).toBeInTheDocument();

    await user.click(screen.getByRole('menuitem', { name: 'Supprimer' }));

    expect(remove).toHaveBeenCalledOnce();
    expect(rename).not.toHaveBeenCalled();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('is keyboard operable and skips disabled items', async () => {
    const user = userEvent.setup();
    const first = vi.fn();
    const second = vi.fn();
    render(
      <ActionMenu
        items={[
          { id: 'first', label: 'Première', onSelect: first },
          { disabled: true, id: 'off', label: 'Indisponible', onSelect: vi.fn() },
          { id: 'second', label: 'Seconde', onSelect: second },
        ]}
        label="Actions"
      />,
    );

    screen.getByRole('button', { name: 'Actions' }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('menu')).toBeVisible();
    expect(screen.getByRole('menuitem', { name: 'Indisponible' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await user.keyboard('{ArrowDown}{Enter}');

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
  });
});
